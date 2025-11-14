import { prisma } from "../../prisma/client";

export interface InstallerUserInput {
  vendor_id: number;
  installer_name: string;
  contact_number?: string;
  created_by: number;
}

export const addInstallerUser = async (payload: InstallerUserInput) => {
  console.log("[SERVICE] addInstallerUser called", payload);

  // ✅ Check vendor exists
  const vendor = await prisma.vendorMaster.findUnique({
    where: { id: payload.vendor_id },
  });

  if (!vendor) {
    console.error("[SERVICE] Vendor not found", { vendor_id: payload.vendor_id });
    throw new Error("Invalid vendor_id");
  }

  // ✅ Check creator user exists
  const user = await prisma.userMaster.findUnique({
    where: { id: payload.created_by },
  });

  if (!user) {
    console.error("[SERVICE] Creator not found", { created_by: payload.created_by });
    throw new Error("Invalid created_by user");
  }

  // ✅ Create new InstallerUserMaster entry
  const installerUser = await prisma.installerUserMaster.create({
    data: {
      vendor_id: payload.vendor_id,
      installer_name: payload.installer_name,
      contact_number: payload.contact_number,
      created_by: payload.created_by,
    },
  });

  console.log("[SERVICE] InstallerUser created successfully", installerUser);
  return installerUser;
};

export const getAllInstallerUsers = async (vendor_id: number) => {
  console.log("[SERVICE] getAllInstallerUsers called", { vendor_id });

  const vendor = await prisma.vendorMaster.findUnique({
    where: { id: vendor_id },
  });

  if (!vendor) {
    console.error("[SERVICE] Vendor not found", { vendor_id });
    throw new Error("Invalid vendor_id");
  }

  const installers = await prisma.installerUserMaster.findMany({
    where: { vendor_id, status: "active" },
    include: {
      createdBy: {
        select: { id: true, user_name: true },
      },
    },
    orderBy: { created_at: "desc" },
  });

  console.log("[SERVICE] Found installers", { count: installers.length });
  return installers;
};

export const deleteInstallerUser = async (id: number): Promise<boolean> => {
  console.log("[SERVICE] deleteInstallerUser called", { id });

  const existing = await prisma.installerUserMaster.findUnique({ where: { id } });
  if (!existing) {
    console.error("[SERVICE] InstallerUser not found for deletion", { id });
    throw new Error("Installer user not found");
  }

  await prisma.installerUserMaster.delete({ where: { id } });
  console.log("[SERVICE] InstallerUser deleted successfully", { id });

  return true;
};
