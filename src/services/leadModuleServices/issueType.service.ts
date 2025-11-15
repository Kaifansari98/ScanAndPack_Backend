import { prisma } from "../../prisma/client";

/* ------------------------------ Issue Type Master ------------------------------ */

export const addIssueType = async (payload: {
  vendor_id: number;
  name: string;
  created_by: number;
}) => {
  console.log("[SERVICE] addIssueType called", payload);

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

  return prisma.issueLogTypeMaster.create({
    data: {
      vendor_id: payload.vendor_id,
      name: payload.name,
      created_by: payload.created_by,
    },
  });
};

export const fetchIssueTypes = async (vendor_id: number) => {
  console.log("[SERVICE] fetchIssueTypes", { vendor_id });

  return prisma.issueLogTypeMaster.findMany({
    where: { vendor_id },
    orderBy: { created_at: "desc" },
  });
};

export const removeIssueType = async (id: number) => {
  console.log("[SERVICE] removeIssueType", { id });

  const existing = await prisma.issueLogTypeMaster.findUnique({
    where: { id },
  });

  if (!existing) throw new Error("Issue Type not found");

  await prisma.issueLogTypeMaster.delete({
    where: { id },
  });

  return true;
};
