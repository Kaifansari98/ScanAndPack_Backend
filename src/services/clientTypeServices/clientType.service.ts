import { prisma } from "../../prisma/client";

export const createClientType = async (vendor_id: number, type: string) => {
  return await prisma.clientTypeMaster.create({
    data: { vendor_id, type },
  });
};

export const getClientTypesList = async (vendor_id: number, activeOnly = true) => {
  return await prisma.clientTypeMaster.findMany({
    where: {
      vendor_id,
      ...(activeOnly ? { is_active: true } : {}),
    },
    orderBy: { type: "asc" },
  });
};
