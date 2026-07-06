import { prisma } from "../../prisma/client";
import { NotificationType } from "../../prisma/generated";
import type { Notification } from "../../prisma/generated";
import { getFirebaseMessaging } from "../../utils/firebaseAdmin";
import logger from "../../utils/logger";

export type CreateNotificationInput = {
  vendor_id: number;
  user_id: number;
  sender_id?: number | null;
  type: NotificationType;
  title: string;
  message: string;
  entity_type?: string | null;
  entity_id?: number | null;
  redirect_url?: string | null;
};

export type ListNotificationsOptions = {
  is_read?: boolean;
  take?: number;
  skip?: number;
  search?: string;
  tab?: string;
};

export type RegisterPushTokenInput = {
  vendor_id: number;
  user_id: number;
  token: string;
  platform: string;
  browser?: string | null;
  device_id?: string | null;
};

export type PushDeliverySummary = {
  total_tokens: number;
  success_count: number;
  failure_count: number;
  invalid_token_count: number;
};

export type NotificationWithDelivery = Notification & {
  delivery_summary: {
    sent: number;
    failed: number;
  };
  sender?: {
    user_name: string;
  } | null;
};

export type ListNotificationsResult = {
  notifications: NotificationWithDelivery[];
  unread_count: number;
  total_count: number;
};

export const NotificationService = {
  async create(input: CreateNotificationInput) {
    return prisma.notification.create({
      data: {
        vendor_id: input.vendor_id,
        user_id: input.user_id,
        sender_id: input.sender_id ?? null,
        type: input.type,
        title: input.title,
        message: input.message,
        entity_type: input.entity_type ?? null,
        entity_id: input.entity_id ?? null,
        redirect_url: input.redirect_url ?? null,
      },
    });
  },

  async createAndSend(
    input: CreateNotificationInput,
  ): Promise<{
    notification: Notification | null;
    delivery: PushDeliverySummary | null;
  }> {
    let notificationsEnabled = process.env.NOTIFICATIONS_ENABLED === "true";
    if (input.vendor_id) {
      const vendor = await prisma.vendorMaster.findUnique({
        where: { id: input.vendor_id },
        select: { is_in_app_noti_enabled: true }
      });
      if (vendor) {
        notificationsEnabled = vendor.is_in_app_noti_enabled;
      }
    }

    if (!notificationsEnabled) {
      logger.info("Notification skipped: notifications disabled", {
        user_id: input.user_id,
        title: input.title,
      });
      return { notification: null, delivery: null };
    }

    const notification = await this.create(input);
    let delivery: PushDeliverySummary | null = null;

    try {
      delivery = await this.sendPushToUser(notification.id, input);
    } catch (error: any) {
      logger.warn("⚠️ Failed to deliver push notification", {
        error: error?.message,
        notification_id: notification.id,
        user_id: input.user_id,
      });
    }

    return { notification, delivery };
  },

  async sendPushToUser(
    notificationId: number,
    input: CreateNotificationInput,
  ): Promise<PushDeliverySummary> {
    const tokens = await prisma.userPushToken.findMany({
      where: {
        user_id: input.user_id,
        vendor_id: input.vendor_id,
        is_active: true,
      },
      select: { id: true, token: true },
    });

    if (tokens.length === 0) {
      return {
        total_tokens: 0,
        success_count: 0,
        failure_count: 0,
        invalid_token_count: 0,
      };
    }

    const firebaseEnabled = process.env.FIREBASE_ENABLED === "true";
    if (!firebaseEnabled) {
      logger.info("Firebase push notification skipped: disabled", {
        user_id: input.user_id,
        title: input.title,
      });
      return {
        total_tokens: tokens.length,
        success_count: 0,
        failure_count: 0,
        invalid_token_count: 0,
      };
    }

    const messaging = getFirebaseMessaging();
    const webpush = {
      notification: {
        title: input.title,
        body: input.message,
      },
      ...(input.redirect_url
        ? {
            fcmOptions: {
              link: input.redirect_url,
            },
          }
        : {}),
    };
    const response = await messaging.sendEachForMulticast({
      tokens: tokens.map((item) => item.token),
      webpush,
      notification: {
        title: input.title,
        body: input.message,
      },
      data: {
        notification_id: String(notificationId),
        type: input.type,
        title: input.title,
        body: input.message,
        entity_type: input.entity_type ?? "",
        entity_id: input.entity_id ? String(input.entity_id) : "",
        redirect_url: input.redirect_url ?? "",
      },
    });

    const logs = response.responses.map((result, index) => {
      const token = tokens[index];
      return {
        notification_id: notificationId,
        push_token_id: token.id,
        status: result.success ? "SENT" : "FAILED",
        error: result.success
          ? null
          : (result.error?.message ?? "Unknown error"),
      };
    });

    await prisma.notificationDeliveryLogs.createMany({
      data: logs,
    });

    await prisma.userPushToken.updateMany({
      where: { id: { in: tokens.map((item) => item.id) } },
      data: { last_used_at: new Date() },
    });

    const invalidTokenIds = response.responses
      .map((result, index) => ({
        result,
        tokenId: tokens[index].id,
      }))
      .filter(({ result }) =>
        [
          "messaging/registration-token-not-registered",
          "messaging/invalid-registration-token",
        ].includes(result.error?.code ?? ""),
      )
      .map(({ tokenId }) => tokenId);

    if (invalidTokenIds.length > 0) {
      await prisma.userPushToken.updateMany({
        where: { id: { in: invalidTokenIds } },
        data: { is_active: false },
      });
    }

    const successCount = response.responses.filter(
      (result) => result.success,
    ).length;
    const failureCount = response.responses.length - successCount;

    return {
      total_tokens: tokens.length,
      success_count: successCount,
      failure_count: failureCount,
      invalid_token_count: invalidTokenIds.length,
    };
  },

  async listForUser(
    vendorId: number,
    userId: number,
    options: ListNotificationsOptions = {},
  ): Promise<ListNotificationsResult> {
    const { is_read, take = 20, skip = 0, search, tab } = options;

    // Map tab names to their corresponding notification types (backend filter)
    const TAB_TYPE_MAP: Record<string, string[]> = {
      leads:    ["LEAD_ASSIGNED", "LEAD_MILESTONE", "LEAD_ACTION"],
      task:     ["TASK_ASSIGNED"],
      mention:  ["CHAT_MENTION"],
      approval: ["APPROVAL"],
    };

    const whereClause: any = {
      vendor_id: vendorId,
      user_id: userId,
      ...(typeof is_read === "boolean" ? { is_read } : {}),
      ...(search ? { OR: [
        { title:   { contains: search, mode: "insensitive" } },
        { message: { contains: search, mode: "insensitive" } },
      ]} : {}),
      ...(tab && TAB_TYPE_MAP[tab] ? { type: { in: TAB_TYPE_MAP[tab] } } : {}),
    };

    const [notifications, unread_count, total_count] = await Promise.all([
      prisma.notification.findMany({
        where: whereClause,
        orderBy: { created_at: "desc" },
        take,
        skip,
        include: {
          sender: {
            select: { user_name: true },
          },
        },
      }),
      prisma.notification.count({
        where: { vendor_id: vendorId, user_id: userId, is_read: false },
      }),
      prisma.notification.count({
        where: whereClause,
      }),
    ]);

    // Attach a default delivery_summary so the return type is satisfied.
    // The delivery logs groupBy was removed — it ran sequentially after the
    // main query, adding an extra DB round-trip that the frontend never used.
    const notificationsWithDelivery: NotificationWithDelivery[] = notifications.map(
      (n) => ({ ...n, delivery_summary: { sent: 0, failed: 0 } }),
    );

    return { notifications: notificationsWithDelivery, unread_count, total_count };
  },

  async markRead(notificationId: number, userId: number) {
    return prisma.notification.updateMany({
      where: {
        id: notificationId,
        user_id: userId,
      },
      data: {
        is_read: true,
        read_at: new Date(),
      },
    });
  },

  async markReadBulk(notificationIds: number[], userId: number) {
    return prisma.notification.updateMany({
      where: {
        id: { in: notificationIds },
        user_id: userId,
      },
      data: {
        is_read: true,
        read_at: new Date(),
      },
    });
  },

  async registerPushToken(input: RegisterPushTokenInput) {
    return prisma.userPushToken.upsert({
      where: { token: input.token },
      update: {
        user_id: input.user_id,
        vendor_id: input.vendor_id,
        platform: input.platform,
        browser: input.browser ?? null,
        device_id: input.device_id ?? null,
        is_active: true,
        last_used_at: new Date(),
      },
      create: {
        user_id: input.user_id,
        vendor_id: input.vendor_id,
        token: input.token,
        platform: input.platform,
        browser: input.browser ?? null,
        device_id: input.device_id ?? null,
        is_active: true,
        last_used_at: new Date(),
      },
    });
  },

async deactivatePushToken(data: {
  user_id: number;
  vendor_id: number;
  device_id?: string;
  token?: string;
}) {
  const { user_id, vendor_id, device_id, token } = data;

  logger.info("Deactivating push token", {
    user_id,
    vendor_id,
    device_id,
    token,
  });

  const result = await prisma.userPushToken.updateMany({
    where: {
      user_id,
      vendor_id,
      ...(device_id ? { device_id } : {}),
      ...(token ? { token } : {}),
    },
    data: {
      is_active: false,
      last_used_at: new Date(),
    },
  });

  logger.info("Push token deactivated", { affectedRows: result.count });

  return { success: true, affected: result.count };
}

};
