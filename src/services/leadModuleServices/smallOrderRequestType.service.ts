import { prisma } from "../../prisma/client";

export const getAllSmallOrderRequestTypes = async (vendor_id: number) => {
  const vendor = await prisma.vendorMaster.findUnique({
    where: { id: vendor_id },
  });

  if (!vendor) {
    throw new Error("Invalid vendor_id");
  }

  return prisma.smallOrderRequestTypeMaster.findMany({
    where: { vendor_id, status: "active" },
    orderBy: { id: "asc" },
  });
};
