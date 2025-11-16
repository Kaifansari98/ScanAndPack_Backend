import { prisma } from "../../prisma/client";

/* ------------------------------ Type Master ------------------------------ */

export const addMiscType = async (payload: {
  vendor_id: number;
  name: string;
  created_by: number;
}) => {
  console.log("[SERVICE] addMiscType called", payload);

  // Validate vendor
  const vendor = await prisma.vendorMaster.findUnique({
    where: { id: payload.vendor_id },
  });
  if (!vendor) throw new Error("Invalid vendor_id");

  // Validate creator
  const user = await prisma.userMaster.findUnique({
    where: { id: payload.created_by },
  });
  if (!user) throw new Error("Invalid created_by user");

  return prisma.miscellaneousTypeMaster.create({
    data: {
      vendor_id: payload.vendor_id,
      name: payload.name,
      created_by: payload.created_by,
    },
  });
};

export const fetchMiscTypes = async (vendor_id: number) => {
  console.log("[SERVICE] fetchMiscTypes", { vendor_id });

  return prisma.miscellaneousTypeMaster.findMany({
    where: { vendor_id },
    orderBy: { created_at: "desc" },
  });
};

export const removeMiscType = async (id: number) => {
  console.log("[SERVICE] removeMiscType", { id });

  const existing = await prisma.miscellaneousTypeMaster.findUnique({ where: { id } });
  if (!existing) throw new Error("Misc Type not found");

  await prisma.miscellaneousTypeMaster.delete({ where: { id } });
  return true;
};


/* ------------------------------ Team Master ------------------------------ */

export const addMiscTeam = async (payload: {
  vendor_id: number;
  name: string;
  created_by: number;
}) => {
  console.log("[SERVICE] addMiscTeam called", payload);

  const vendor = await prisma.vendorMaster.findUnique({
    where: { id: payload.vendor_id },
  });
  if (!vendor) throw new Error("Invalid vendor_id");

  const user = await prisma.userMaster.findUnique({
    where: { id: payload.created_by },
  });
  if (!user) throw new Error("Invalid created_by user");

  return prisma.miscellaneousTeamMaster.create({
    data: {
      vendor_id: payload.vendor_id,
      name: payload.name,
      created_by: payload.created_by,
    },
  });
};

export const fetchMiscTeams = async (vendor_id: number) => {
  console.log("[SERVICE] fetchMiscTeams", { vendor_id });

  return prisma.miscellaneousTeamMaster.findMany({
    where: { vendor_id },
    orderBy: { created_at: "desc" },
  });
};

export const removeMiscTeam = async (id: number) => {
  console.log("[SERVICE] removeMiscTeam", { id });

  const existing = await prisma.miscellaneousTeamMaster.findUnique({ where: { id } });
  if (!existing) throw new Error("Team not found");

  await prisma.miscellaneousTeamMaster.delete({ where: { id } });
  return true;
};
