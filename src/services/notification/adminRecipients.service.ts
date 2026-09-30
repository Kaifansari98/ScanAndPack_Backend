import { prisma } from "../../prisma/client";
import logger from "../../utils/logger";

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

export type AdminRecipientsResult = {
  recipients: FranchiseAdminRecipient[];
  isSuperAdminFallback: boolean;
};

export async function getFranchiseAdminRecipients(
  input: GetFranchiseAdminRecipientsInput,
): Promise<AdminRecipientsResult> {
  const { vendorId, franchiseId, excludeUserId, candidateUserIds } = input;

  if (franchiseId == null) {
    return { recipients: [], isSuperAdminFallback: false };
  }

  if (candidateUserIds && candidateUserIds.length === 0) {
    return { recipients: [], isSuperAdminFallback: false };
  }

  const idFilter =
    candidateUserIds && excludeUserId != null
      ? { in: candidateUserIds.filter((id) => id !== excludeUserId) }
      : candidateUserIds
        ? { in: candidateUserIds }
        : excludeUserId != null
          ? { not: excludeUserId }
          : undefined;

  const admins = await prisma.userMaster.findMany({
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

  // ✅ Return active franchise admins (if none, return empty array)
  if (admins.length === 0) {
    logger.info("No active franchise admins found, fallback disabled", {
      vendor_id: vendorId,
      franchise_id: franchiseId,
    });
  }

  return { recipients: admins, isSuperAdminFallback: false };
}
