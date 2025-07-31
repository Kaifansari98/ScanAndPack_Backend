import { prisma } from "../../prisma/client";
import { CreateClientInput } from "../../types/client.types";

export const createClient = async (clientData: CreateClientInput) => {
  return await prisma.clientMaster.create({
    data: clientData,
  });
};