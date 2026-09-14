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
      is_online_lead_feature_enabled: true,
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
        select: { franchise_code: true, franchise_name: true },
      })
    : null;

  const isOnlineLeadFeatureEnabled = vendor.is_online_lead_feature_enabled === true;
  const basePrefix = vendor.vendor_code || "SH";
  const normalizedVendorCode = basePrefix.trim().toUpperCase();
  const normalizedFranchiseCode = franchise?.franchise_code?.trim().toUpperCase() || null;

  let franchiseSuffix = "";
  let prefix = "";
  let legacyPrefix = "";

  if (isOnlineLeadFeatureEnabled) {
    const requiredVendorPrefix = "SH";
    if (franchise) {
      const rawCode = (franchise.franchise_code || "").trim().toUpperCase();
      const rawName = (franchise.franchise_name || "").trim().toUpperCase();

      const cleanedCode = rawCode
        .replace(/^FURNIX/i, "")
        .replace(/^SH/i, "")
        .trim();

      const cleanedName = rawName
        .replace(/^FURNIX/i, "")
        .replace(/^SH/i, "")
        .replace(/STORE$/i, "")
        .replace(/HO$/i, "")
        .trim();

      franchiseSuffix = cleanedCode || cleanedName || "";
    }

    prefix = franchiseSuffix ? `${requiredVendorPrefix}${franchiseSuffix}` : requiredVendorPrefix;
    legacyPrefix = franchiseSuffix ? `FURNIX${franchiseSuffix}` : "FURNIX";
  } else {
    prefix = normalizedFranchiseCode || normalizedVendorCode;
    legacyPrefix = prefix;
  }

  const shouldUseYearWiseLeadCode =
    vendor.handlesLargeScaleProjects === true ||
    vendor.is_this_vendor_is_custom_usertype_only === true ||
    vendor.is_year_wise_lead_code_enabled === true;

  if (shouldUseYearWiseLeadCode) {
    const financialYearLabel = getFinancialYearLabel(new Date());
    const yearPrefix = `${prefix}-${financialYearLabel}-`;

    const [lastLead, lastOnlineLead] = await Promise.all([
      tx.leadMaster.findFirst({
        where: {
          vendor_id: input.vendorId,
          lead_code: {
            startsWith: yearPrefix,
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
            startsWith: yearPrefix,
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

    let generatedCode = `${prefix}-${financialYearLabel}-${nextNumber}`;

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
        generatedCode = `${prefix}-${financialYearLabel}-${nextNumber}`;
      }
    }

    logger.debug("[LEAD CODE GENERATED]", {
      franchiseId: input.franchiseId,
      prefix,
      financialYearLabel,
      generatedCode,
    });

    return generatedCode;
  }

  // Get latest lead for this prefix across the entire vendor (checking both new SH prefix and legacy FURNIX prefix)
  const [lastLeadSH, lastLeadFURNIX, lastOnlineLeadSH, lastOnlineLeadFURNIX] = await Promise.all([
    tx.leadMaster.findFirst({
      where: {
        vendor_id: input.vendorId,
        lead_code: { startsWith: `${prefix}-` },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      select: { lead_code: true },
    }),
    tx.leadMaster.findFirst({
      where: {
        vendor_id: input.vendorId,
        lead_code: { startsWith: `${legacyPrefix}-` },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      select: { lead_code: true },
    }),
    tx.online_leads.findFirst({
      where: {
        vendor_id: input.vendorId,
        lead_code: { startsWith: `${prefix}-` },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      select: { lead_code: true },
    }),
    tx.online_leads.findFirst({
      where: {
        vendor_id: input.vendorId,
        lead_code: { startsWith: `${legacyPrefix}-` },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      select: { lead_code: true },
    }),
  ]);

  const extractSequenceNum = (code?: string | null) => {
    if (!code) return 0;
    const match = code.match(/-(\d+)$/);
    return match ? parseInt(match[1], 10) : 0;
  };

  const maxSeq = Math.max(
    extractSequenceNum(lastLeadSH?.lead_code),
    extractSequenceNum(lastLeadFURNIX?.lead_code),
    extractSequenceNum(lastOnlineLeadSH?.lead_code),
    extractSequenceNum(lastOnlineLeadFURNIX?.lead_code),
  );

  let nextNumber = maxSeq > 0 ? maxSeq + 1 : 1;
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
    franchiseCode: franchiseSuffix,
    prefix,
    generatedCode,
  });

  return generatedCode;
}
