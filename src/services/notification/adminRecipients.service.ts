import { prisma } from "../../prisma/client";

type GetFranchiseAdminRecipientsInput = {
  vendorId: number;
  franchiseId?: number | null;
  excludeUserId?: number | null;
  candidateUserIds?: number[];
};

export type FranchiseAdminRecipient = {
  id: number;
  user_name: string | null;
  user_email: string | null;
};

export async function getFranchiseAdminRecipients(
  input: GetFranchiseAdminRecipientsInput,
): Promise<FranchiseAdminRecipient[]> {
  const { vendorId, franchiseId, excludeUserId, candidateUserIds } = input;

  if (franchiseId == null) {
    return [];
  }

  if (candidateUserIds && candidateUserIds.length === 0) {
    return [];
  }

  const idFilter =
    candidateUserIds && excludeUserId != null
      ? { in: candidateUserIds.filter((id) => id !== excludeUserId) }
      : candidateUserIds
        ? { in: candidateUserIds }
        : excludeUserId != null
          ? { not: excludeUserId }
          : undefined;

  return prisma.userMaster.findMany({
    where: {
      vendor_id: vendorId,
      franchise_id: franchiseId,
      status: "active",
      user_type: {
        user_type: { equals: "admin", mode: "insensitive" },
      },
      ...(idFilter ? { id: idFilter } : {}),
    },
    select: {
      id: true,
      user_name: true,
      user_email: true,
    },
  });
}
