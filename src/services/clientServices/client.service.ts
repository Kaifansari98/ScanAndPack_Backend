import { prisma } from "../../prisma/client";
import { CreateClientInput, UpdateClientInput } from "../../types/client.types";

export const createClient = async (clientData: CreateClientInput) => {
  return await prisma.clientMaster.create({
    data: clientData,
    include: { clientType: true },
  });
};

export const getClientsList = async (
  vendor_id: number,
  page: number,
  limit: number,
  search?: string
) => {
  const skip = (page - 1) * limit;

  const whereCondition: any = { vendor_id };

  if (search) {
    whereCondition.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { company_name: { contains: search, mode: "insensitive" } },
      { contact: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { clientCode: { contains: search, mode: "insensitive" } },
      { gst_number: { contains: search, mode: "insensitive" } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.clientMaster.findMany({
      where: whereCondition,
      include: { clientType: true },
      skip,
      take: limit,
      orderBy: { created_at: "desc" },
    }),
    prisma.clientMaster.count({ where: whereCondition }),
  ]);

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

export const getClientById = async (vendor_id: number, id: number) => {
  return await prisma.clientMaster.findFirst({
    where: { id, vendor_id },
    include: { clientType: true },
  });
};

export const updateClient = async (id: number, data: UpdateClientInput) => {
  return await prisma.clientMaster.update({
    where: { id },
    data,
    include: { clientType: true },
  });
};
