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
    });

    if (pendingQueue.length === 0) {
      return;
    }

      logger.info(`Processing ${pendingQueue.length} notifications in queue`);

      // Fetch super admin user type IDs to exclude them from notifications
      const superAdmins = await prisma.userTypeMaster.findMany({
        where: {
          user_type: {
            in: ["super-admin", "superadmin", "super_admin"],
            mode: "insensitive"
          }
        },
        select: { id: true },
      });
      const superAdminTypeIds = superAdmins.map((r) => r.id);

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

          // Check if there is an 'ALL' audience type
          const hasAllAudience = broadcast.audiences.some((a) => a.audience_type === "ALL");

          if (hasAllAudience) {
            // Find all active users for this vendor
            const activeUsers = await prisma.userMaster.findMany({
              where: {
                status: { equals: "active", mode: "insensitive" },
                ...(broadcast.vendor_id ? { vendor_id: broadcast.vendor_id } : {}),
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

            if (userTargetIdsFromAudience.length > 0) {
              mainOrConditions.push({ id: { in: userTargetIdsFromAudience } });
            }

            if (franchiseTargetIds.length > 0 || roleTargetIds.length > 0) {
              const targetedWhere: any = {};
              if (franchiseTargetIds.length > 0) {
                targetedWhere.franchise_id = { in: franchiseTargetIds };
              }
              if (roleTargetIds.length > 0) {
                targetedWhere.user_type_id = { in: roleTargetIds };
              }
              mainOrConditions.push(targetedWhere);
            }

            if (mainOrConditions.length > 0) {
              const matchedUsers = await prisma.userMaster.findMany({
                where: {
                  status: { equals: "active", mode: "insensitive" },
                  ...(broadcast.vendor_id ? { vendor_id: broadcast.vendor_id } : {}),
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
          for (const userId of targetUserIds) {
            try {
              const existing = await prisma.notification.findFirst({
                where: { entity_type: "broadcast", entity_id: broadcastId, user_id: userId },
              });
              if (existing) continue;

              const userVendorId = broadcast.vendor_id || userVendorMap.get(userId) || 0;
              await NotificationService.createAndSend({
                vendor_id: userVendorId,
                user_id: userId,
                sender_id: broadcast.created_by,
                type: "LEAD_ACTION" as NotificationType,
                title: broadcast.title,
                message: queueItem.body,
                redirect_url: `/dashboard/broadcasts/${broadcastId}`,
                entity_type: "broadcast",
                entity_id: broadcastId,
              });
            } catch (err: any) {
              logger.error(`Error sending notification to user ${userId} for broadcast ${broadcastId}:`, err);
            }
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
