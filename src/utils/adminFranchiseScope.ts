import { prisma } from "../prisma/client";

/** Resolve access from the authenticated user's stored assignment, not filters. */
export async function getAdminFranchiseScope(
  vendorId: number,
  requesterUserId: number,
) {
  if (!Number.isSafeInteger(requesterUserId) || requesterUserId <= 0) {
    throw Object.assign(new Error("Authenticated user is required"), {
      statusCode: 403,
    });
  }
  const user = await prisma.userMaster.findFirst({
    where: { id: requesterUserId, vendor_id: vendorId, status: "active" },
    select: { franchise_id: true, user_type: { select: { user_type: true } } },
  });
  if (!user) {
    throw Object.assign(new Error("User does not have access to this vendor"), {
      statusCode: 403,
    });
  }
  return {
    isAdmin: user.user_type.user_type.trim().toLowerCase() === "admin",
    franchiseId: user.franchise_id,
  };
}
