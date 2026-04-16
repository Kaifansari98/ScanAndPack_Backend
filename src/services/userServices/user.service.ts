import { prisma } from "../../prisma/client";
import bcrypt from "bcryptjs";

export const createUserService = async (data: {
  vendor_id: number;
  franchise_id: number;
  user_name: string;
  user_contact: string;
  user_email: string;
  user_timezone: string;
  password: string;
  user_type_id: number;
  status?: string;
}) => {
  if (!data.franchise_id) {
    const error = new Error("franchise_id is required.");
    (error as any).statusCode = 400;
    throw error;
  }

  const franchise = await prisma.franchiseMaster.findFirst({
    where: {
      id: Number(data.franchise_id),
      vendor_id: Number(data.vendor_id),
    },
    select: { id: true },
  });

  if (!franchise) {
    const error = new Error("Invalid franchise_id for the given vendor_id.");
    (error as any).statusCode = 400;
    throw error;
  }

  const hashedPassword = await bcrypt.hash(data.password, 10);

  return prisma.userMaster.create({
    data: {
      ...data,
      password: hashedPassword,
    },
  });
};

export const MasterResetPasswordService = async ({
  user_id,
  new_password,
}: {
  user_id: number;
  new_password: string;
}) => {
  // 1️⃣ Check if user exists
  const user = await prisma.userMaster.findUnique({
    where: { id: user_id },
    select: { id: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  // 2️⃣ Hash new password
  const hashedPassword = await bcrypt.hash(new_password, 10);

  // 3️⃣ Update password
  await prisma.userMaster.update({
    where: { id: user_id },
    data: {
      password: hashedPassword,
      updated_at: new Date(),
    },
  });

  return { message: "Password reset successfully" };
};

export const updateUserService = async (
  userId: number,
  data: {
    user_name?: string;
    user_contact?: string;
    user_email?: string;
    user_timezone?: string;
    password?: string;
    user_type_id?: number;
    franchise_id?: number | null;
    status?: string;
  },
) => {
  const user = await prisma.userMaster.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    const error = new Error("User not found");
    (error as any).statusCode = 404;
    throw error;
  }

  const updateData: Record<string, any> = {};

  if (data.user_name !== undefined) updateData.user_name = data.user_name;
  if (data.user_contact !== undefined) updateData.user_contact = data.user_contact;
  if (data.user_email !== undefined) updateData.user_email = data.user_email;
  if (data.user_timezone !== undefined) updateData.user_timezone = data.user_timezone;
  if (data.user_type_id !== undefined) updateData.user_type_id = data.user_type_id;
  if (data.franchise_id !== undefined) updateData.franchise_id = data.franchise_id;
  if (data.status !== undefined) updateData.status = data.status;

  if (data.password) {
    updateData.password = await bcrypt.hash(data.password, 10);
  }

  if (Object.keys(updateData).length === 0) {
    return { message: "No changes to update" };
  }

  return prisma.userMaster.update({
    where: { id: userId },
    data: updateData,
  });
};

export const getUsersByVendorService = async ({
  vendorId,
  page = 1,
  limit = 20,
  search = "",
  franchise_id,
}: {
  vendorId: number;
  page?: number;
  limit?: number;
  search?: string;
  franchise_id?: number;
}) => {
  if (!vendorId) {
    const error = new Error("vendorId is required");
    (error as any).statusCode = 400;
    throw error;
  }

  const pageNum = Number.isFinite(page) && page > 0 ? page : 1;
  const limitNum = Number.isFinite(limit) && limit > 0 ? limit : 20;
  const normalizedSearch = search.trim();

  const where = {
    vendor_id: vendorId,
    ...(franchise_id ? { franchise_id } : {}),
    ...(normalizedSearch
      ? {
          OR: [
            { user_name: { contains: normalizedSearch, mode: "insensitive" as const } },
            { user_contact: { contains: normalizedSearch, mode: "insensitive" as const } },
            { user_email: { contains: normalizedSearch, mode: "insensitive" as const } },
            { status: { contains: normalizedSearch, mode: "insensitive" as const } },
            {
              user_type: {
                user_type: { contains: normalizedSearch, mode: "insensitive" as const },
              },
            },
            {
              franchise: {
                franchise_name: {
                  contains: normalizedSearch,
                  mode: "insensitive" as const,
                },
              },
            },
          ],
        }
      : {}),
  };

  const [users, count] = await Promise.all([
    prisma.userMaster.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      select: {
        id: true,
        vendor_id: true,
        franchise_id: true,
        user_name: true,
        user_contact: true,
        user_email: true,
        user_timezone: true,
        status: true,
        created_at: true,
        user_type: {
          select: {
            user_type: true,
          },
        },
        franchise: {
          select: {
            franchise_name: true,
          },
        },
      },
    }),
    prisma.userMaster.count({ where }),
  ]);

  return {
    count,
    data: users,
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(count / limitNum),
      totalRecoards: count,
      hasNext: pageNum < Math.ceil(count / limitNum),
      hasPrev: pageNum > 1,
    },
  };
};
