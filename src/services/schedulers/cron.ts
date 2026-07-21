import cron from "node-cron";
import { prisma } from "../../prisma/client";
import { NotificationService } from "../notification/notification.service";
import { NotificationType } from "../../prisma/generated";
import logger from "../../utils/logger";

export async function processPendingNotificationQueue() {
  try {
    const now = new Date();

    // Find pending notifications in the queue that should be sent
    const pendingQueue = await prisma.notificationQueue.findMany({
      where: {
        notification_status: "PENDING",
        send_at: { lte: now },
      },
    });

    if (pendingQueue.length === 0) {
      return;
    }

      logger.info(`Processing ${pendingQueue.length} notifications in queue`);

      for (const queueItem of pendingQueue) {
        try {
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
              },
              select: { id: true, vendor_id: true },
            });
            activeUsers.forEach((u) => {
              targetUserIds.add(u.id);
              if (u.vendor_id) userVendorMap.set(u.id, u.vendor_id);
            });
          } else {
            // Build query conditions for target audiences
            const conditions: any[] = [];

            for (const audience of broadcast.audiences) {
              if (audience.audience_type === "ROLE" && audience.target_id) {
                conditions.push({ user_type_id: audience.target_id });
              } else if (audience.audience_type === "USER" && audience.target_id) {
                conditions.push({ id: audience.target_id });
              } else if (audience.audience_type === "FRANCHISE" && audience.target_id) {
                conditions.push({ franchise_id: audience.target_id });
              }
            }

            if (conditions.length > 0) {
              const matchedUsers = await prisma.userMaster.findMany({
                where: {
                  status: { equals: "active", mode: "insensitive" },
                  ...(broadcast.vendor_id ? { vendor_id: broadcast.vendor_id } : {}),
                  OR: conditions,
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

          // Send notification to each user
          for (const userId of targetUserIds) {
            try {
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

          // Mark queue item as SENT
          await prisma.notificationQueue.update({
            where: { id: queueItem.id },
            data: { notification_status: "SENT" },
          });

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
  // Run every 1 minute
  cron.schedule("* * * * *", async () => {
    logger.info("⏰ BROADCAST SCHEDULER CRON STARTED");
    await processPendingNotificationQueue();
  });
}
