import { Prisma, PrismaClient } from "../prisma/generated";
import logger from "./logger";

type Tx = PrismaClient | Prisma.TransactionClient;

const getFinancialYearSegment = (date: Date) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const financialYearStart = month >= 3 ? year : year - 1;
  const financialYearEnd = financialYearStart + 1;

  return `${String(financialYearStart).slice(-2)}/${String(financialYearEnd).slice(-2)}`;
};

export async function generateLeadCode(
  tx: Tx,
  input: {
    franchiseId: number;
    vendorId: number;
  },
): Promise<string> {
  const vendor = await tx.vendorMaster.findUnique({
    where: { id: input.vendorId },
    select: {
      vendor_code: true,
      is_year_wise_lead_code_enabled: true,
    },
  });

  if (!vendor) {
    logger.error("[LEAD CODE] Vendor not found", { vendorId: input.vendorId });
    throw new Error(`Vendor not found for vendor ${input.vendorId}`);
  }

  if (vendor.is_year_wise_lead_code_enabled) {
    const prefix = vendor.vendor_code.trim().toUpperCase();
    const financialYearSegment = getFinancialYearSegment(new Date());
    const codePrefix = `${prefix}-${financialYearSegment}-`;

    const lastLead = await tx.leadMaster.findFirst({
      where: {
        vendor_id: input.vendorId,
        lead_code: {
          startsWith: codePrefix,
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      select: {
        lead_code: true,
      },
    });

    let nextNumber = 1;

    if (lastLead?.lead_code) {
      const match = lastLead.lead_code.match(/-(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    const generatedCode = `${prefix}-${financialYearSegment}-${nextNumber}`;

    logger.debug("[LEAD CODE GENERATED - YEAR WISE]", {
      vendorId: input.vendorId,
      prefix,
      financialYearSegment,
      lastLead: lastLead?.lead_code,
      generatedCode,
    });

    return generatedCode;
  }

  // 1️⃣ Get franchise_code
  const franchise = await tx.franchiseMaster.findUnique({
    where: { id: input.franchiseId },
    select: { franchise_code: true },
  });

  if (!franchise || !franchise.franchise_code) {
    logger.error("[LEAD CODE] Franchise code missing", {
      franchiseId: input.franchiseId,
    });
    throw new Error(
      `Franchise code not found for franchise ${input.franchiseId}`,
    );
  }

  const prefix = franchise.franchise_code
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();

  // 2️⃣ Get latest lead for this franchise
  const lastLead = await tx.leadMaster.findFirst({
    where: {
      franchise_id: input.franchiseId,
      lead_code: {
        startsWith: `${prefix}-`,
      },
    },
    orderBy: {
      created_at: "desc",
    },
    select: {
      lead_code: true,
    },
  });

  // 3️⃣ Extract last number
  let nextNumber = 1;

  if (lastLead?.lead_code) {
    const match = lastLead.lead_code.match(/-(\d+)$/);
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1;
    }
  }

  const generatedCode = `${prefix}-${nextNumber}`;

  // 🔍 VERY IMPORTANT DEBUG
  logger.debug("[LEAD CODE GENERATED]", {
    franchiseId: input.franchiseId,
    prefix,
    lastLead: lastLead?.lead_code,
    generatedCode,
  });

  return generatedCode;
}
