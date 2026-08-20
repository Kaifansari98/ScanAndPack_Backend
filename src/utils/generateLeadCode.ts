import { Prisma, PrismaClient } from "../prisma/generated";
import logger from "./logger";

type Tx = PrismaClient | Prisma.TransactionClient;

export async function generateLeadCode(
  tx: Tx,
  input: {
    franchiseId?: number;
    vendorId: number;
  },
): Promise<string> {
  const vendor = await tx.vendorMaster.findUnique({
    where: { id: input.vendorId },
    select: {
      vendor_code: true,
    },
  });

  if (!vendor) {
    logger.error("[LEAD CODE] Vendor not found", { vendorId: input.vendorId });
    throw new Error(`Vendor not found for vendor ${input.vendorId}`);
  }

  // Concurrency-safety: Lock the franchise or vendor row for update
  if (input.franchiseId) {
    await tx.$queryRawUnsafe(
      `SELECT id FROM "FranchiseMaster" WHERE id = $1 FOR UPDATE`,
      input.franchiseId,
    );
  } else {
    await tx.$queryRawUnsafe(
      `SELECT id FROM "VendorMaster" WHERE id = $1 FOR UPDATE`,
      input.vendorId,
    );
  }

  let prefix = "SH";

  if (input.franchiseId) {
    const franchise = await tx.franchiseMaster.findUnique({
      where: { id: input.franchiseId },
      select: { city_id: true },
    });

    if (franchise && franchise.city_id) {
      const city = await tx.cityMaster.findUnique({
        where: { id: franchise.city_id },
        select: { name: true },
      });

      if (city && city.name) {
        const citySegment = city.name.replace(/[^A-Za-z]/g, "").toUpperCase();
        if (citySegment) {
          prefix = `SH${citySegment}`;
        }
      }
    }
  }

  // Get latest lead for this prefix across the entire vendor
  const lastLead = await tx.leadMaster.findFirst({
    where: {
      vendor_id: input.vendorId,
      lead_code: {
        startsWith: `${prefix}-`,
      },
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    select: {
      lead_code: true,
    },
  });

  // Also look up in onlineLead for conflicts
  const lastOnlineLead = await tx.onlineLead.findFirst({
    where: {
      vendor_id: input.vendorId,
      lead_code: {
        startsWith: `${prefix}-`,
      },
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    select: {
      lead_code: true,
    },
  });

  let lastCode = "";
  if (lastLead?.lead_code && lastOnlineLead?.lead_code) {
    const m1 = lastLead.lead_code.match(/-(\d+)$/);
    const m2 = lastOnlineLead.lead_code.match(/-(\d+)$/);
    const n1 = m1 ? parseInt(m1[1], 10) : 0;
    const n2 = m2 ? parseInt(m2[1], 10) : 0;
    lastCode = n1 >= n2 ? lastLead.lead_code : lastOnlineLead.lead_code;
  } else {
    lastCode = lastLead?.lead_code || lastOnlineLead?.lead_code || "";
  }

  let nextNumber = 1;
  if (lastCode) {
    const match = lastCode.match(/-(\d+)$/);
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1;
    }
  }

  let numSegment = nextNumber < 10 ? `0${nextNumber}` : `${nextNumber}`;
  let generatedCode = `${prefix}-${numSegment}`;

  // Loop check to prevent duplicate conflicts
  let exists = true;
  while (exists) {
    const existingInLead = await tx.leadMaster.findFirst({
      where: {
        vendor_id: input.vendorId,
        lead_code: generatedCode,
      },
      select: { id: true },
    });

    const existingInOnlineLead = await tx.onlineLead.findFirst({
      where: {
        vendor_id: input.vendorId,
        lead_code: generatedCode,
      },
      select: { id: true },
    });

    if (!existingInLead && !existingInOnlineLead) {
      exists = false;
    } else {
      nextNumber++;
      numSegment = nextNumber < 10 ? `0${nextNumber}` : `${nextNumber}`;
      generatedCode = `${prefix}-${numSegment}`;
    }
  }

  logger.debug("[LEAD CODE GENERATED]", {
    franchiseId: input.franchiseId,
    prefix,
    generatedCode,
  });

  return generatedCode;
}
