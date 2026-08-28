import { Prisma, PrismaClient } from "../prisma/generated";
import logger from "./logger";

type Tx = PrismaClient | Prisma.TransactionClient;

const getFinancialYearLabel = (date: Date) => {
  const month = date.getMonth() + 1;
  const startYear = month >= 4 ? date.getFullYear() : date.getFullYear() - 1;
  const endYear = startYear + 1;

  return `${String(startYear).slice(-2)}/${String(endYear).slice(-2)}`;
};

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
      handlesLargeScaleProjects: true,
      is_this_vendor_is_custom_usertype_only: true,
      is_year_wise_lead_code_enabled: true,
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

  const franchise = input.franchiseId
    ? await tx.franchiseMaster.findUnique({
        where: { id: input.franchiseId },
        select: { franchise_code: true },
      })
    : null;

  const basePrefix = vendor.vendor_code || "SH";
  const normalizedVendorCode = basePrefix.trim().toUpperCase();
  const normalizedFranchiseCode = franchise?.franchise_code?.trim().toUpperCase() || null;
  const shouldUseYearWiseLeadCode =
    vendor.handlesLargeScaleProjects === true ||
    vendor.is_this_vendor_is_custom_usertype_only === true ||
    vendor.is_year_wise_lead_code_enabled === true;

  if (shouldUseYearWiseLeadCode) {
    const financialYearLabel = getFinancialYearLabel(new Date());
    const prefix = `${normalizedVendorCode}-${financialYearLabel}-`;

    const [lastLead, lastOnlineLead] = await Promise.all([
      tx.leadMaster.findFirst({
        where: {
          vendor_id: input.vendorId,
          lead_code: {
            startsWith: prefix,
          },
        },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        select: {
          lead_code: true,
        },
      }),
      tx.online_leads.findFirst({
        where: {
          vendor_id: input.vendorId,
          lead_code: {
            startsWith: prefix,
          },
        },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        select: {
          lead_code: true,
        },
      }),
    ]);

    let nextNumber = 1;
    const extractSequence = (leadCode?: string | null) => {
      if (!leadCode) return 0;
      const match = leadCode.match(/-(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    };

    nextNumber =
      Math.max(
        extractSequence(lastLead?.lead_code),
        extractSequence(lastOnlineLead?.lead_code),
      ) + 1;

    let generatedCode = `${normalizedVendorCode}-${financialYearLabel}-${nextNumber}`;

    let exists = true;
    while (exists) {
      const [existingInLead, existingInOnlineLead] = await Promise.all([
        tx.leadMaster.findFirst({
          where: {
            vendor_id: input.vendorId,
            lead_code: generatedCode,
          },
          select: { id: true },
        }),
        tx.online_leads.findFirst({
          where: {
            vendor_id: input.vendorId,
            lead_code: generatedCode,
          },
          select: { id: true },
        }),
      ]);

      if (!existingInLead && !existingInOnlineLead) {
        exists = false;
      } else {
        nextNumber += 1;
        generatedCode = `${normalizedVendorCode}-${financialYearLabel}-${nextNumber}`;
      }
    }

    logger.debug("[LEAD CODE GENERATED]", {
      franchiseId: input.franchiseId,
      prefix: normalizedVendorCode,
      financialYearLabel,
      generatedCode,
    });

    return generatedCode;
  }

  let prefix = normalizedFranchiseCode || basePrefix;

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
  const lastOnlineLead = await tx.online_leads.findFirst({
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

    const existingInOnlineLead = await tx.online_leads.findFirst({
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
    franchiseCode: normalizedFranchiseCode,
    prefix,
    generatedCode,
  });

  return generatedCode;
}
