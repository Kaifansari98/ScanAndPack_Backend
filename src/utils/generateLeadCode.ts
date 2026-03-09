import { Prisma, PrismaClient } from "../prisma/generated";
import logger from "./logger";

type Tx = PrismaClient | Prisma.TransactionClient;

export async function generateLeadCode(
  tx: Tx,
  franchiseId: number
): Promise<string> {
  // 1️⃣ Get franchise_code
  const franchise = await tx.franchiseMaster.findUnique({
    where: { id: franchiseId },
    select: { franchise_code: true },
  });

  if (!franchise || !franchise.franchise_code) {
    logger.error("[LEAD CODE] Franchise code missing", { franchiseId });
    throw new Error(`Franchise code not found for franchise ${franchiseId}`);
  }

  const prefix = franchise.franchise_code
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();

  // 2️⃣ Get latest lead for this franchise
  const lastLead = await tx.leadMaster.findFirst({
    where: {
      franchise_id: franchiseId,
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
    franchiseId,
    prefix,
    lastLead: lastLead?.lead_code,
    generatedCode,
  });

  return generatedCode;
}
