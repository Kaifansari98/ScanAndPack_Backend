import { Prisma } from "../../prisma/client";
import { ComplaintError } from "./clientComplaints.service";

// A complaint from a client without a lead code still needs a CRM lead, so its
// tasks reach My Tasks like any lead's. Each external client gets one
// placeholder lead (<VendorCode>EX-n), created on their first complaint and
// reused for later ones. It sits in Project Completed (Delivered Projects)
// and is flagged so normal lead lists and counts leave it out.

type Tx = Prisma.TransactionClient;

export type PlaceholderLead = {
  leadId: number;
  accountId: number;
  leadCode: string;
  siteSupervisorId: number | null;
  headSiteSupervisorId: number | null;
};

const SS_TYPES = ["site-supervisor", "site supervisor", "site_supervisor"];
const HSS_TYPES = ["head-site-supervisor", "head site supervisor", "head_site_supervisor"];

// The franchise tagged to the client's city; the head office when no franchise
// covers that city.
async function franchiseForCity(tx: Tx, vendorId: number, city: string) {
  const byCity = await tx.franchiseMaster.findFirst({
    where: {
      vendor_id: vendorId,
      status: "active",
      storeCity: { name: { equals: city.trim(), mode: "insensitive" } },
    },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  if (byCity) return byCity.id;
  const headOffice = await tx.franchiseMaster.findFirst({
    where: { vendor_id: vendorId, is_head_office: true },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  return headOffice?.id ?? null;
}

// The franchise's most recently created head site supervisor and most recently
// assigned site supervisor.
async function franchiseSupervisors(tx: Tx, vendorId: number, franchiseId: number | null) {
  if (!franchiseId) return { ss: null, hss: null };
  const active = { status: "active" } as const;
  const hssMapping = await tx.headSiteSupervisorFranchiseMapping.findFirst({
    where: { vendor_id: vendorId, franchise_id: franchiseId, status: true, user: active },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    select: { user_id: true },
  });
  const hss =
    hssMapping?.user_id ??
    (
      await tx.userMaster.findFirst({
        where: {
          vendor_id: vendorId,
          franchise_id: franchiseId,
          ...active,
          user_type: { user_type: { in: HSS_TYPES, mode: "insensitive" } },
        },
        orderBy: { id: "desc" },
        select: { id: true },
      })
    )?.id ??
    null;
  const ssMapping = await tx.siteSupervisorFranchiseMapping.findFirst({
    where: {
      vendor_id: vendorId,
      franchise_id: franchiseId,
      supervisor: { ...active, user_type: { user_type: { in: SS_TYPES, mode: "insensitive" } } },
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    select: { supervisor_id: true },
  });
  const ss =
    ssMapping?.supervisor_id ??
    (
      await tx.userMaster.findFirst({
        where: {
          vendor_id: vendorId,
          franchise_id: franchiseId,
          ...active,
          user_type: { user_type: { in: SS_TYPES, mode: "insensitive" } },
        },
        orderBy: { id: "desc" },
        select: { id: true },
      })
    )?.id ??
    null;
  return { ss, hss };
}

// The lead's current supervisor of the given type, if still active.
async function leadSupervisor(tx: Tx, vendorId: number, leadId: number, type: "site-supervisor" | "head-site-supervisor") {
  const mapping = await tx.leadUserMapping.findFirst({
    where: { vendor_id: vendorId, lead_id: leadId, type, status: "active", user: { status: "active" } },
    orderBy: { created_at: "desc" },
    select: { user_id: true },
  });
  return mapping?.user_id ?? null;
}

// "+919876543210" → { country_code: "+91", contact_no: "9876543210" }.
function splitMobile(mobile: string) {
  const digits = mobile.replace(/\D/g, "");
  const contact = digits.slice(-10);
  const country = digits.length > 10 ? `+${digits.slice(0, digits.length - 10)}` : "+91";
  return { country_code: country, contact_no: contact };
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return { firstname: parts[0] ?? fullName, lastname: parts.slice(1).join(" ") };
}

/**
 * Returns the external client's placeholder lead, creating it on their first
 * complaint. Runs inside the registration transaction, which already holds the
 * vendor row lock, so lead numbers cannot collide.
 */
export async function ensurePlaceholderLead(
  tx: Tx,
  input: {
    vendorId: number;
    vendorCode: string | null;
    actorId: number;
    externalClientId: number;
    clientName: string;
    mobile: string;
    alternateMobile: string | null;
    email: string | null;
    siteAddress: string;
    siteMapLink: string | null;
    city: string;
  },
): Promise<PlaceholderLead> {
  const client = await tx.complaintExternalClient.findUniqueOrThrow({
    where: { id: input.externalClientId },
    select: {
      city: true,
      lead: { select: { id: true, account_id: true, lead_code: true, is_deleted: true } },
    },
  });

  // Later complaints reuse the lead and whoever is assigned to it now.
  if (client.lead && client.lead.account_id && !client.lead.is_deleted) {
    const [ss, hss] = await Promise.all([
      leadSupervisor(tx, input.vendorId, client.lead.id, "site-supervisor"),
      leadSupervisor(tx, input.vendorId, client.lead.id, "head-site-supervisor"),
    ]);
    return {
      leadId: client.lead.id,
      accountId: client.lead.account_id,
      leadCode: client.lead.lead_code,
      siteSupervisorId: ss,
      headSiteSupervisorId: hss,
    };
  }

  const status = await tx.statusTypeMaster.findFirst({
    where: { vendor_id: input.vendorId, tag: "Type 17" },
    select: { id: true },
  });
  if (!status) throw new ComplaintError("The Project Completed stage is not configured for this vendor.", 409);

  // A linked existing client keeps the city on record.
  const franchiseId = await franchiseForCity(tx, input.vendorId, client.city || input.city);
  const { ss, hss } = await franchiseSupervisors(tx, input.vendorId, franchiseId);
  const { firstname, lastname } = splitName(input.clientName);
  const phone = splitMobile(input.mobile);
  const alternate = input.alternateMobile ? splitMobile(input.alternateMobile).contact_no : null;

  const account = await tx.accountMaster.create({
    data: {
      name: input.clientName,
      country_code: phone.country_code,
      contact_no: phone.contact_no,
      alt_contact_no: alternate,
      email: input.email?.toLowerCase() ?? null,
      vendor_id: input.vendorId,
      franchise_id: franchiseId,
      created_by: input.actorId,
    },
  });

  // <VendorCode>EX-<n>, numbered per vendor.
  const prefix = `${(input.vendorCode || "SH").trim().toUpperCase()}EX-`;
  let number = (await tx.leadMaster.count({ where: { vendor_id: input.vendorId, is_complaint_placeholder: true } })) + 1;
  while (await tx.leadMaster.findFirst({ where: { vendor_id: input.vendorId, lead_code: `${prefix}${number}` }, select: { id: true } }))
    number += 1;
  const leadCode = `${prefix}${number}`;

  const lead = await tx.leadMaster.create({
    data: {
      lead_code: leadCode,
      firstname,
      lastname,
      country_code: phone.country_code,
      contact_no: phone.contact_no,
      alt_contact_no: alternate,
      email: input.email ?? "",
      site_address: input.siteAddress,
      site_map_link: input.siteMapLink,
      vendor_id: input.vendorId,
      franchise_id: franchiseId,
      account_id: account.id,
      status_id: status.id,
      created_by: input.actorId,
      is_complaint_placeholder: true,
    },
    select: { id: true },
  });

  await tx.leadStatusLogs.create({
    data: {
      lead_id: lead.id,
      account_id: account.id,
      vendor_id: input.vendorId,
      status_id: status.id,
      created_by: input.actorId,
      created_at: new Date(),
    },
  });

  const mappings = [
    ss && { type: "site-supervisor" as const, user_id: ss },
    hss && { type: "head-site-supervisor" as const, user_id: hss },
  ].filter(Boolean) as { type: "site-supervisor" | "head-site-supervisor"; user_id: number }[];
  if (mappings.length)
    await tx.leadUserMapping.createMany({
      data: mappings.map((m) => ({
        vendor_id: input.vendorId,
        account_id: account.id,
        lead_id: lead.id,
        type: m.type,
        user_id: m.user_id,
        status: "active" as const,
        created_by: input.actorId,
      })),
    });

  await tx.complaintExternalClient.update({ where: { id: input.externalClientId }, data: { lead_id: lead.id } });

  return {
    leadId: lead.id,
    accountId: account.id,
    leadCode,
    siteSupervisorId: ss,
    headSiteSupervisorId: hss,
  };
}
