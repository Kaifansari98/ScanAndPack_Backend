import { prisma } from "src/prisma/client";

export async function resolveEmailIdentity(vendorId: number) {
  const vendor = await prisma.vendorMaster.findUnique({
    where: { id: vendorId },
    select: {
      vendor_name: true,
      vendor_code: true,
      primary_contact_email: true,
    },
  });

  if (!vendor) {
    throw new Error(`Vendor ${vendorId} not found`);
  }

  return {
    senderName: vendor.vendor_name + "CRM",
    senderEmail: vendor.primary_contact_email,
  };
}
