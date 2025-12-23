import { Prisma, PrismaClient } from "../prisma/generated";
import logger from "./logger";

type Tx = PrismaClient | Prisma.TransactionClient;

export async function generateLeadCode(
  tx: Tx,
  vendorId: number
): Promise<string> {
  // 1️⃣ Get vendor_code
  const vendor = await tx.vendorMaster.findUnique({
    where: { id: vendorId },
    select: { vendor_code: true },
  });

  if (!vendor || !vendor.vendor_code) {
    logger.error("[LEAD CODE] Vendor code missing", { vendorId });
    throw new Error(`Vendor code not found for vendor ${vendorId}`);
  }

  const prefix = vendor.vendor_code
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();

  // 2️⃣ Get latest lead for this vendor
  const lastLead = await tx.leadMaster.findFirst({
    where: {
      vendor_id: vendorId,
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
    vendorId,
    prefix,
    lastLead: lastLead?.lead_code,
    generatedCode,
  });

  return generatedCode;
}
