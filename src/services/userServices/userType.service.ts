import { prisma } from "../../prisma/client";

export const createUserTypeService = async (user_type: string) => {
  return prisma.userTypeMaster.create({
    data: {
      user_type,
    },
  });
};

export const getUserTypesService = async () => {
  return prisma.userTypeMaster.findMany();
};