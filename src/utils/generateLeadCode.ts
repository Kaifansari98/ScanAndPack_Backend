// src/utils/generateLeadCode.ts
import { Prisma, PrismaClient } from "@prisma/client";

// Accept either the root client or a transaction client.
type Tx = PrismaClient | Prisma.TransactionClient;

export async function generateLeadCode(tx: Tx, vendorId: number): Promise<string> {
  // 1) Get vendor name for prefix
  const vendor = await tx.vendorMaster.findUnique({
    where: { id: vendorId },
    select: { vendor_name: true },
  });
  if (!vendor) throw new Error(`Vendor ${vendorId} not found`);

  // 2) Prefix: first 4 letters, uppercase, strip non-letters
  const prefix = vendor.vendor_name.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 4) || "VEND";

  // 3) Next sequence number (count existing leads of this vendor)
  //    We count *all* leads so codes are never reused (even if soft-deleted).
  const count = await tx.leadMaster.count({
    where: { vendor_id: vendorId },
  });
  const next = count + 1;

  // 4) Minimum 3-digit padding (1000+ stays as 1000)
  const suffix = next.toString().padStart(3, "0");

  return `${prefix}-${suffix}`;
}