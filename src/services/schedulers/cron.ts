import cron from "node-cron";
import { prisma } from "../../prisma/client";
import { NotificationService } from "../notification/notification.service";
import { NotificationType } from "../../prisma/generated";
import logger from "../../utils/logger";

export async function processPendingNotificationQueue() {
  try {
    // Add 15-second buffer to handle minor clock differences between client and database server
    const nowWithBuffer = new Date(Date.now() + 15000);

    // Find pending notifications in the queue that should be sent
    const pendingQueue = await prisma.notificationQueue.findMany({
      where: {
        notification_status: "PENDING",
        send_at: { lte: nowWithBuffer },
      },
       take: 100,
  orderBy: {
    send_at: "asc",
  },
    });

    if (pendingQueue.length === 0) {
      return;
    }

      logger.info(`Processing ${pendingQueue.length} notifications in queue`);

      // Fetch super admin and master user type IDs to exclude them from notifications
      const excludedRoles = await prisma.userTypeMaster.findMany({
        where: {
          user_type: {
            in: [
              "super-admin", "superadmin", "super_admin",
              "master-admin", "masteradmin", "master_admin", "master", "vloq master"
            ],
            mode: "insensitive"
          }
        },
        select: { id: true },
      });
      const superAdminTypeIds = excludedRoles.map((r) => r.id);

      for (const queueItem of pendingQueue) {
        try {
          // Atomically claim the queue item by marking SENT early (enum only has PENDING/SENT/FAILED).
          // If another parallel execution already claimed it this will return count=0 and we skip.
          const claimed = await prisma.notificationQueue.updateMany({
            where: { id: queueItem.id, notification_status: "PENDING" },
            data: { notification_status: "SENT" },
          });

          if (claimed.count === 0) {
            // Already claimed by a parallel execution – skip
            continue;
          }

          const body = queueItem.request_body as any;
          const broadcastId = body?.broadcastId;

          if (!broadcastId) {
            // No broadcast ID, mark as FAILED
            await prisma.notificationQueue.update({
              where: { id: queueItem.id },
              data: { notification_status: "FAILED" },
            });
            continue;
          }

          // Fetch the broadcast and its target audiences
          const broadcast = await prisma.broadcastMaster.findUnique({
            where: { id: broadcastId },
            include: { audiences: true },
          });

          // If broadcast doesn't exist, is deleted, or is INACTIVE, fail/cancel this notification
          if (!broadcast || broadcast.status !== "ACTIVE") {
            await prisma.notificationQueue.update({
              where: { id: queueItem.id },
              data: { notification_status: "FAILED" },
            });
            continue;
          }

          // Resolve targeted user IDs & their vendor IDs
          const targetUserIds = new Set<number>();
          const userVendorMap = new Map<number, number>();

          // Resolve effective vendor_id: use broadcast's vendor_id or fall back to the creator's vendor
          let effectiveVendorId: number | null = broadcast.vendor_id ?? null;
          if (!effectiveVendorId && broadcast.created_by) {
            const creatorUser = await prisma.userMaster.findUnique({
              where: { id: broadcast.created_by },
              select: { vendor_id: true },
            });
            effectiveVendorId = creatorUser?.vendor_id ?? null;
          }

          if (!effectiveVendorId) {
            logger.warn(`Broadcast ${broadcastId} has no vendor_id and creator has no vendor — skipping to prevent cross-vendor notification leak`);
            await prisma.notificationQueue.update({
              where: { id: queueItem.id },
              data: { notification_status: "FAILED" },
            });
            continue;
          }

          // Check if there is an 'ALL' audience type
          const hasAllAudience = broadcast.audiences.some((a) => a.audience_type === "ALL");

          if (hasAllAudience) {
            // Find all active users for this vendor
            const activeUsers = await prisma.userMaster.findMany({
              where: {
                status: { equals: "active", mode: "insensitive" },
                vendor_id: effectiveVendorId,
                ...(superAdminTypeIds.length > 0 ? { user_type_id: { notIn: superAdminTypeIds } } : {}),
              },
              select: { id: true, vendor_id: true },
            });
            activeUsers.forEach((u) => {
              targetUserIds.add(u.id);
              if (u.vendor_id) userVendorMap.set(u.id, u.vendor_id);
            });
          } else {
            // Build query conditions for target audiences
            const franchiseTargetIds = broadcast.audiences
              .filter((a) => a.audience_type === "FRANCHISE" && a.target_id)
              .map((a) => a.target_id!);

            const roleTargetIds = broadcast.audiences
              .filter((a) => a.audience_type === "ROLE" && a.target_id)
              .map((a) => a.target_id!);

            const userTargetIdsFromAudience = broadcast.audiences
              .filter((a) => a.audience_type === "USER" && a.target_id)
              .map((a) => a.target_id!);

            const mainOrConditions: any[] = [];

            // Specific user IDs are always added as a separate OR condition
            if (userTargetIdsFromAudience.length > 0) {
              mainOrConditions.push({ id: { in: userTargetIdsFromAudience } });
            }

            // AND logic: if both franchise AND role are selected, intersect them
            // e.g. Mumbai franchise + Site Supervisor → only Site Supervisors IN Mumbai
            if (franchiseTargetIds.length > 0 && roleTargetIds.length > 0) {
              // Intersection: users must match BOTH franchise AND role
              mainOrConditions.push({
                franchise_id: { in: franchiseTargetIds },
                user_type_id: { in: roleTargetIds },
              });
            } else if (franchiseTargetIds.length > 0) {
              // Only franchise selected → all users in that franchise
              mainOrConditions.push({ franchise_id: { in: franchiseTargetIds } });
            } else if (roleTargetIds.length > 0) {
              // Only role selected → all users with that role
              mainOrConditions.push({ user_type_id: { in: roleTargetIds } });
            }

            if (mainOrConditions.length > 0) {
              const matchedUsers = await prisma.userMaster.findMany({
                where: {
                  status: { equals: "active", mode: "insensitive" },
                  vendor_id: effectiveVendorId,
                  ...(superAdminTypeIds.length > 0 ? { user_type_id: { notIn: superAdminTypeIds } } : {}),
                  OR: mainOrConditions,
                },
                select: { id: true, vendor_id: true },
              });
              matchedUsers.forEach((u) => {
                targetUserIds.add(u.id);
                if (u.vendor_id) userVendorMap.set(u.id, u.vendor_id);
              });
            }
          }

          logger.info(`Sending broadcast ${broadcastId} notification to ${targetUserIds.size} users`);

          // Send notification to each user (skip if notification already created)
 // Fetch existing notifications once (avoids N+1 queries)
const existingNotifications = await prisma.notification.findMany({
  where: {
    entity_type: "broadcast",
    entity_id: broadcastId,
  },
  select: {
    user_id: true,
  },
});

const existingUserIds = new Set(
  existingNotifications.map((n) => n.user_id)
);

// Process users in small parallel batches
const users = Array.from(targetUserIds);
const BATCH_SIZE = 50;

for (let i = 0; i < users.length; i += BATCH_SIZE) {
  const batch = users.slice(i, i + BATCH_SIZE);

  await Promise.allSettled(
    batch.map(async (userId) => {
      try {
        // Skip if notification already exists
        if (existingUserIds.has(userId)) {
          return;
        }

        const userVendorId =
          userVendorMap.get(userId) || effectiveVendorId || 0;

        await NotificationService.createAndSend({
          
          vendor_id: userVendorId,
          user_id: userId,
          sender_id: broadcast.created_by,
          type: NotificationType.LEAD_ACTION,
          title: broadcast.title,
          message: queueItem.body,
          redirect_url: `/dashboard/broadcasts/${broadcastId}`,
          entity_type: "broadcast",
          entity_id: broadcastId,
          
        });
        
      } catch (err: any) {
        
        logger.error(
          `Error sending notification to user ${userId} for broadcast ${broadcastId}:`,
          err
        );
      }
    })
  );
}
          // (Queue item already marked SENT at the start of processing as the exclusive claim)

        } catch (itemErr: any) {
          logger.error(`Error processing notification queue item ${queueItem.id}:`, itemErr);
          await prisma.notificationQueue.update({
            where: { id: queueItem.id },
            data: { notification_status: "FAILED" },
          });
        }
      }
    } catch (cronErr: any) {
      logger.error("Error in processPendingNotificationQueue:", cronErr);
    }
}

export function startCronJobs() {
  // Run every 10 seconds for real-time notification processing
  cron.schedule("*/10 * * * * *", async () => {
    await processPendingNotificationQueue();
  });
}
