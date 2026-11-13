import { prisma, Prisma } from "../../prisma/client";
import { ComplaintActor, ComplaintError } from "./clientComplaints.service";

const PAGE_SIZE = 15;

function requireSuperAdmin(actor: ComplaintActor) {
  if (actor.role !== "super-admin")
    throw new ComplaintError(
      "Only Super Admins can browse leads for complaint registration.",
      403,
    );
}

function optionalId(value: unknown, label: string): number | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" && typeof value !== "number")
    throw new ComplaintError(`Invalid ${label}.`);
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2_147_483_647)
    throw new ComplaintError(`Invalid ${label}.`);
  return id;
}

export async function getComplaintLeadFranchises(actor: ComplaintActor) {
  requireSuperAdmin(actor);
  return prisma.franchiseMaster.findMany({
    where: { vendor_id: actor.vendorId },
    orderBy: [{ franchise_name: "asc" }, { id: "asc" }],
    select: { id: true, franchise_name: true },
  });
}

export async function getComplaintLeadOptions(
  actor: ComplaintActor,
  query: Record<string, unknown>,
) {
  requireSuperAdmin(actor);
  const franchiseId = optionalId(query.franchise_id, "franchise");
  const afterId = optionalId(query.after_id, "lead cursor");
  if (query.search !== undefined && typeof query.search !== "string")
    throw new ComplaintError("Invalid lead search.");
  const search =
    typeof query.search === "string" ? query.search.trim().slice(0, 200) : "";
  if (franchiseId) {
    const franchise = await prisma.franchiseMaster.findFirst({
      where: { id: franchiseId, vendor_id: actor.vendorId },
      select: { id: true },
    });
    if (!franchise)
      throw new ComplaintError("Franchise not found for this vendor.", 404);
  }
  const where: Prisma.LeadMasterWhereInput = {
    vendor_id: actor.vendorId,
    is_deleted: false,
    ...(franchiseId ? { franchise_id: franchiseId } : {}),
    ...(afterId ? { id: { lt: afterId } } : {}),
    ...(search
      ? {
          AND: search
            .split(/\s+/)
            .map((term) => ({
              OR: [
                { firstname: { contains: term, mode: "insensitive" as const } },
                { lastname: { contains: term, mode: "insensitive" as const } },
                { lead_code: { contains: term, mode: "insensitive" as const } },
              ],
            })),
        }
      : {}),
  };
  // Fetch one extra ID to know whether another page exists, without counting all leads.
  const matches = await prisma.leadMaster.findMany({
    where,
    orderBy: { id: "desc" },
    take: PAGE_SIZE + 1,
    select: { id: true, firstname: true, lastname: true, lead_code: true },
  });
  const rows = matches.slice(0, PAGE_SIZE);
  return {
    rows,
    next_cursor: matches.length > PAGE_SIZE ? rows[rows.length - 1].id : null,
  };
}
