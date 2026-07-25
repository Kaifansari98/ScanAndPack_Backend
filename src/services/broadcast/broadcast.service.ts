import { prisma } from "../../prisma/client";
import { BroadcastRepository } from "../../repositories/broadcast/broadcast.repository";
import { CreateBroadcastInput, UpdateBroadcastInput, ListBroadcastsInput } from "../../validations/broadcast.validation";
import { uploadToWasabiCompanyVendorDocument, generateSignedUrl } from "../../utils/wasabiClient";
import { processPendingNotificationQueue } from "../schedulers/cron";

async function getSuperAdminUserTypeIds(): Promise<number[]> {
  try {
    const roles = await prisma.userTypeMaster.findMany({
      where: {
        user_type: {
          in: ["super-admin", "superadmin", "super_admin"],
          mode: "insensitive",
        },
      },
      select: { id: true },
    });
    return roles.map((r) => r.id);
  } catch (err) {
    return [];
  }
}

function stripHtmlAndEntitiesBackend(html: string): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function isSuperAdminUser(userId: number): Promise<boolean> {
  try {
    const superAdminTypeIds = await getSuperAdminUserTypeIds();
    if (superAdminTypeIds.length === 0) return false;

    const user = await prisma.userMaster.findUnique({
      where: { id: userId },
      select: { user_type_id: true },
    });

    return user?.user_type_id ? superAdminTypeIds.includes(user.user_type_id) : false;
  } catch (err) {
    return false;
  }
}

export class BroadcastService {
  private repository: BroadcastRepository;

  constructor() {
    this.repository = new BroadcastRepository();
  }

  // ─── CATEGORIES ────────────────────────────────────────────────────────────

  async getBroadcastCategories(vendor_id: number, includeInactive: boolean = false) {
    return await prisma.broadcastCategoryMaster.findMany({
      where: {
        vendor_id,
        ...(includeInactive ? {} : { is_active: true }),
      },
      orderBy: {
        category: "asc",
      },
    });
  }

  async createBroadcastCategory(data: {
    vendor_id: number;
    category: string;
    type?: string;
    created_by: number;
  }) {
    return await prisma.broadcastCategoryMaster.create({
      data: {
        vendor_id: data.vendor_id,
        category: data.category,
        type: data.type || "DOCUMENT",
        created_by: data.created_by,
        is_active: true,
      },
    });
  }

  async updateBroadcastCategory(
    id: number,
    data: { category: string; type?: string }
  ) {
    return await prisma.broadcastCategoryMaster.update({
      where: { id },
      data: {
        category: data.category,
        ...(data.type ? { type: data.type } : {}),
      },
    });
  }

  async toggleBroadcastCategoryStatus(id: number) {
    const category = await prisma.broadcastCategoryMaster.findUnique({
      where: { id },
    });
    if (!category) throw new Error("Category not found");
    return await prisma.broadcastCategoryMaster.update({
      where: { id },
      data: {
        is_active: !category.is_active,
      },
    });
  }

  // ─── CREATE ────────────────────────────────────────────────────────────────

  async create(
    payload: CreateBroadcastInput,
    userId: number,
    uploadedFiles: { [fieldname: string]: Express.Multer.File[] } = {}
  ) {
    const { title, content, type, status, publishAt, vendorId, audiences = [], attachments = [] } = payload;

    if (vendorId) await this.assertVendorExists(vendorId);

    const resolvedAttachments = await this.resolveAttachments(attachments, vendorId, uploadedFiles);

    // Support userTypeId / userTypeIds as number or array of numbers
    const rawUserTypeId = (payload as any).userTypeId ?? (payload as any).userTypeIds;
    let finalAudiences: Array<{ audienceType: string; targetId?: number | null }> = [...audiences];

    if (rawUserTypeId !== undefined && rawUserTypeId !== null) {
      const userTypeIdsArray: number[] = Array.isArray(rawUserTypeId) ? rawUserTypeId : [rawUserTypeId];
      for (const utId of userTypeIdsArray) {
        if (utId && typeof utId === "number") {
          const exists = finalAudiences.some(
            (a) => a.audienceType === "ROLE" && Number(a.targetId) === Number(utId)
          );
          if (!exists) {
            finalAudiences.push({ audienceType: "ROLE", targetId: utId });
          }
        }
      }
    }

    if (finalAudiences.length === 0) {
      finalAudiences = [{ audienceType: "ALL", targetId: null }];
    }

    const broadcast = await prisma.$transaction(async (tx) => {
      const record = await this.repository.createBroadcast(tx, {
        title, content, type, status,
        category_id: payload.category_id ?? null,
        publish_at: publishAt ? new Date(publishAt) : null,
        vendor_id: vendorId ?? null,
        created_by: userId,
        updated_by: userId,
      });
      await this.repository.createAudiences(tx, record.id, finalAudiences, userId);
      if (resolvedAttachments.length > 0) {
        await this.repository.createAttachments(tx, record.id, resolvedAttachments, userId);
      }

      // Enqueue notification if broadcast status is ACTIVE
      if (status === "ACTIVE") {
        await tx.notificationQueue.create({
          data: {
            title: `New Announcement: ${title}`,
            body: stripHtmlAndEntitiesBackend(content).substring(0, 100),
            notification_source: "IN_APP",
            notification_status: "PENDING",
            send_at: publishAt ? new Date(publishAt) : new Date(),
            request_body: { broadcastId: record.id },
            created_by: userId,
            updated_by: userId,
          },
        });
      }

      return record;
    });

    // Trigger instant notification queue processing if ACTIVE and immediate
    if (status === "ACTIVE") {
      processPendingNotificationQueue().catch(() => {});
    }

    return this.getById(broadcast.id);
  }

  // ─── GET ONE ───────────────────────────────────────────────────────────────

  async getById(id: number) {
    const broadcast = await this.repository.findById(id);
    if (!broadcast) {
      const err = new Error(`Broadcast with id ${id} not found`);
      (err as any).statusCode = 404;
      throw err;
    }
    const [enriched] = await this.enrichBroadcastData([broadcast]);

    let sentCount = 0;
    let readersCount = 0;
    try {
      const superAdminTypeIds = await getSuperAdminUserTypeIds();
      const broadcastRecord = await prisma.broadcastMaster.findUnique({
        where: { id },
        select: { created_at: true, publish_at: true },
      });
      const effectivePublishDate = broadcastRecord?.publish_at || broadcastRecord?.created_at;

      const sentUserList = await prisma.notification.findMany({
        where: { entity_type: "broadcast", entity_id: id },
        select: { user_id: true },
        distinct: ["user_id"],
      });
      sentCount = sentUserList.length;

      readersCount = await prisma.broadcastRead.count({
        where: {
          broadcast_id: id,
          user: {
            ...(superAdminTypeIds.length > 0
              ? { user_type_id: { notIn: superAdminTypeIds } }
              : {}),
            ...(effectivePublishDate ? { created_at: { lte: effectivePublishDate } } : {}),
          },
        },
      });
    } catch (err) {
      // Non-fatal
    }

    return {
      ...enriched,
      readersCount,
      sentCount,
    };
  }

  // ─── LIST ──────────────────────────────────────────────────────────────────

  async list(
    filters: ListBroadcastsInput,
    currentUser: { id: number; user_type_id?: number; franchise_id?: number }
  ) {
    let audience: { userId: number; userTypeId?: number; franchiseId?: number; createdAt?: Date } | undefined;

    if (filters.forMe) {
      const userRecord = await prisma.userMaster.findUnique({
        where: { id: currentUser.id },
        select: { id: true, user_type_id: true, franchise_id: true, created_at: true },
      });

      audience = {
        userId: currentUser.id,
        userTypeId: userRecord?.user_type_id ?? currentUser.user_type_id,
        franchiseId: userRecord?.franchise_id ?? currentUser.franchise_id ?? undefined,
        createdAt: userRecord?.created_at ?? undefined,
      };
    }

    const result = await this.repository.findMany(
      {
        vendorId: filters.vendorId,
        status: filters.status,
        type: filters.type,
        page: filters.page,
        limit: filters.limit,
      },
      audience
    );

    // Safely attach sentCount and readCount to each broadcast
    const broadcastIds = result.data.map((b: any) => b.id as number);

    let sentCountMap = new Map<number, number>();
    let readCountMap = new Map<number, number>();

    try {
      if (broadcastIds.length > 0) {
        const superAdminTypeIds = await getSuperAdminUserTypeIds();

        // Count unique recipient users sent notifications per broadcast
        const sentRows = await prisma.notification.findMany({
          where: { entity_type: "broadcast", entity_id: { in: broadcastIds } },
          select: { entity_id: true, user_id: true },
          distinct: ["entity_id", "user_id"],
        });
        for (const row of sentRows) {
          if (row.entity_id) {
            const currentCount = sentCountMap.get(row.entity_id) ?? 0;
            sentCountMap.set(row.entity_id, currentCount + 1);
          }
        }

        // Count read logs per broadcast (excluding super-admin & users created after broadcast publish date)
        const readLogs = await prisma.broadcastRead.findMany({
          where: {
            broadcast_id: { in: broadcastIds },
            ...(superAdminTypeIds.length > 0
              ? { user: { user_type_id: { notIn: superAdminTypeIds } } }
              : {}),
          },
          select: {
            broadcast_id: true,
            user: { select: { created_at: true } },
            broadcast: { select: { created_at: true, publish_at: true } },
          },
        });

        for (const log of readLogs) {
          const effectivePublishDate = log.broadcast?.publish_at || log.broadcast?.created_at;
          if (!effectivePublishDate || !log.user?.created_at || log.user.created_at <= effectivePublishDate) {
            const currentCount = readCountMap.get(log.broadcast_id) ?? 0;
            readCountMap.set(log.broadcast_id, currentCount + 1);
          }
        }
      }
    } catch (err) {
      // Non-fatal: counts will default to 0
    }

    const enrichedData = await this.enrichBroadcastData(result.data);

    const dataWithCounts = enrichedData.map((b: any) => ({
      ...b,
      isRead: Array.isArray(b.readLogs) ? b.readLogs.length > 0 : false,
      readersCount: readCountMap.get(b.id) ?? 0,
      sentCount: sentCountMap.get(b.id) ?? 0,
    }));

    return { ...result, data: dataWithCounts };
  }

  private async enrichBroadcastData(broadcasts: any[]) {
    const roleIds = new Set<number>();
    const franchiseIds = new Set<number>();
    const userIds = new Set<number>();

    for (const b of broadcasts) {
      for (const aud of (b as any).audiences || []) {
        if (aud.audience_type === "ROLE" && aud.target_id) roleIds.add(aud.target_id);
        if (aud.audience_type === "FRANCHISE" && aud.target_id) franchiseIds.add(aud.target_id);
        if (aud.audience_type === "USER" && aud.target_id) userIds.add(aud.target_id);
      }
    }

    let roleMap = new Map<number, string>();
    let franchiseMap = new Map<number, string>();
    let userMap = new Map<number, string>();

    try {
      if (roleIds.size > 0) {
        const roles = await prisma.userTypeMaster.findMany({ where: { id: { in: Array.from(roleIds) } } });
        roles.forEach((r) => roleMap.set(r.id, r.user_type));
      }
      if (franchiseIds.size > 0) {
        const franchises = await prisma.franchiseMaster.findMany({ where: { id: { in: Array.from(franchiseIds) } } });
        franchises.forEach((f) => franchiseMap.set(f.id, f.franchise_name));
      }
      if (userIds.size > 0) {
        const users = await prisma.userMaster.findMany({
          where: { id: { in: Array.from(userIds) } },
          select: { id: true, user_name: true },
        });
        users.forEach((u) => userMap.set(u.id, u.user_name));
      }
    } catch (err) {
      // Non-fatal
    }

    return Promise.all(
      broadcasts.map(async (b: any) => {
        const enrichedAttachments = await Promise.all(
          (b.attachments || []).map(async (att: any) => {
            let finalUrl = att.file_url;
            if (
              att.attachment_type === "FILE" &&
              finalUrl &&
              !finalUrl.startsWith("http://") &&
              !finalUrl.startsWith("https://")
            ) {
              try {
                finalUrl = await generateSignedUrl(finalUrl, 86400);
              } catch (e) {
                // Non-fatal fallback
              }
            }
            return {
              ...att,
              file_url: finalUrl,
            };
          })
        );

        return {
          ...b,
          audiences: (b.audiences || []).map((aud: any) => ({
            ...aud,
            target_name:
              aud.audience_type === "ROLE"
                ? roleMap.get(aud.target_id)
                : aud.audience_type === "FRANCHISE"
                ? franchiseMap.get(aud.target_id)
                : aud.audience_type === "USER"
                ? userMap.get(aud.target_id)
                : "All Users",
          })),
          attachments: enrichedAttachments,
        };
      })
    );
  }

  // ─── UPDATE ────────────────────────────────────────────────────────────────

  async update(
    id: number,
    payload: UpdateBroadcastInput,
    userId: number,
    uploadedFiles: { [fieldname: string]: Express.Multer.File[] } = {}
  ) {
    // Check exists
    await this.getById(id);

    if (payload.vendorId) await this.assertVendorExists(payload.vendorId);

    // Resolve any new attachments (if attachments array provided in payload)
    let resolvedAttachments: any[] | null = null;
    if (payload.attachments !== undefined) {
      resolvedAttachments = await this.resolveAttachments(
        payload.attachments,
        payload.vendorId ?? null,
        uploadedFiles
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.broadcastMaster.findUnique({
        where: { id },
      });
      if (!existing) {
        throw new Error(`Broadcast with id ${id} not found`);
      }

      // Update core fields
      const record = await this.repository.update(tx, id, {
        title: payload.title,
        content: payload.content,
        type: payload.type,
        status: payload.status,
        category_id: payload.category_id !== undefined ? payload.category_id : undefined,
        publish_at: payload.publishAt !== undefined ? (payload.publishAt ? new Date(payload.publishAt) : null) : undefined,
        vendor_id: payload.vendorId !== undefined ? (payload.vendorId ?? null) : undefined,
        updated_by: userId,
      });

      // Replace audiences if provided or if userTypeId / userTypeIds provided
      const rawUserTypeId = (payload as any).userTypeId ?? (payload as any).userTypeIds;
      if (payload.audiences !== undefined || rawUserTypeId !== undefined) {
        let updateAudiences: Array<{ audienceType: string; targetId?: number | null }> = payload.audiences ? [...payload.audiences] : [];
        if (rawUserTypeId !== undefined && rawUserTypeId !== null) {
          const userTypeIdsArray: number[] = Array.isArray(rawUserTypeId) ? rawUserTypeId : [rawUserTypeId];
          for (const utId of userTypeIdsArray) {
            if (utId && typeof utId === "number") {
              const exists = updateAudiences.some(
                (a) => a.audienceType === "ROLE" && Number(a.targetId) === Number(utId)
              );
              if (!exists) {
                updateAudiences.push({ audienceType: "ROLE", targetId: utId });
              }
            }
          }
        }
        await this.repository.deleteAudiences(tx, id);
        await this.repository.createAudiences(tx, id, updateAudiences, userId);
      }

      // Replace attachments if provided
      if (resolvedAttachments !== null) {
        await this.repository.deleteAttachments(tx, id);
        if (resolvedAttachments.length > 0) {
          await this.repository.createAttachments(tx, id, resolvedAttachments, userId);
        }
      }

      // Sync Notification Queue: delete pending notification queue items for this broadcast
      const pendingNotifications = await tx.notificationQueue.findMany({
        where: { notification_status: "PENDING" },
      });
      const matchingNotifIds = pendingNotifications
        .filter((n) => {
          const body = n.request_body as any;
          return body && body.broadcastId === id;
        })
        .map((n) => n.id);

      const hadPending = matchingNotifIds.length > 0;
      if (hadPending) {
        await tx.notificationQueue.deleteMany({
          where: { id: { in: matchingNotifIds } },
        });
      }

      // Only schedule a new notification if it transitions from INACTIVE to ACTIVE or had a pending scheduled notification
      const isTransitioningToActive = existing.status === "INACTIVE" && payload.status === "ACTIVE";
      const finalStatus = payload.status ?? record.status;
      if (finalStatus === "ACTIVE" && (hadPending || isTransitioningToActive)) {
        const finalTitle = payload.title ?? record.title;
        const finalContent = payload.content ?? record.content;
        const finalPublishAt = payload.publishAt !== undefined ? payload.publishAt : record.publish_at;

        await tx.notificationQueue.create({
          data: {
            title: `New Announcement: ${finalTitle}`,
            body: finalContent.replace(/<[^>]*>/g, "").substring(0, 100),
            notification_source: "IN_APP",
            notification_status: "PENDING",
            send_at: finalPublishAt ? new Date(finalPublishAt) : new Date(),
            request_body: { broadcastId: id },
            created_by: userId,
            updated_by: userId,
          },
        });
      }

      return record;
    });

    return this.repository.findById(updated.id);
  }

  // ─── DELETE (soft) ─────────────────────────────────────────────────────────

  async delete(id: number, userId: number) {
    await this.getById(id);
    return prisma.$transaction(async (tx) => {
      const result = await tx.broadcastMaster.update({
        where: { id },
        data: { status: "INACTIVE", updated_by: userId, updated_at: new Date() },
      });

      // Remove any pending notifications for this broadcast
      const pendingNotifications = await tx.notificationQueue.findMany({
        where: { notification_status: "PENDING" },
      });
      const matchingNotifIds = pendingNotifications
        .filter((n) => {
          const body = n.request_body as any;
          return body && body.broadcastId === id;
        })
        .map((n) => n.id);

      if (matchingNotifIds.length > 0) {
        await tx.notificationQueue.deleteMany({
          where: { id: { in: matchingNotifIds } },
        });
      }

      return result;
    });
  }

  // ─── READ TRACKING ─────────────────────────────────────────────────────────

  async markRead(broadcastId: number, userId: number) {
    const broadcast = await prisma.broadcastMaster.findUnique({
      where: { id: broadcastId },
      select: { created_at: true, publish_at: true },
    });
    if (!broadcast) {
      const err = new Error(`Broadcast with id ${broadcastId} not found`);
      (err as any).statusCode = 404;
      throw err;
    }

    const superAdmin = await isSuperAdminUser(userId);
    let result = null;

    if (!superAdmin) {
      const user = await prisma.userMaster.findUnique({
        where: { id: userId },
        select: { created_at: true },
      });
      const effectivePublishDate = broadcast.publish_at || broadcast.created_at;
      const isUserCreatedAfterPublish =
        user?.created_at && effectivePublishDate && user.created_at > effectivePublishDate;

      if (!isUserCreatedAfterPublish) {
        result = await this.repository.markRead(broadcastId, userId);
      }
    }

    // Sync matching in-app notification read state
    try {
      await prisma.notification.updateMany({
        where: {
          entity_type: "broadcast",
          entity_id: broadcastId,
          user_id: userId,
          is_read: false,
        },
        data: {
          is_read: true,
          read_at: new Date(),
        },
      });
    } catch (err) {
      // Non-fatal
    }

    return result ?? { broadcast_id: broadcastId, user_id: userId, skipped: true };
  }

  async getReaders(broadcastId: number) {
    await this.getById(broadcastId);
    return this.repository.findReaders(broadcastId);
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private async assertVendorExists(vendorId: number) {
    const vendor = await prisma.vendorMaster.findUnique({ where: { id: vendorId } });
    if (!vendor) {
      const err = new Error(`Vendor with id ${vendorId} not found`);
      (err as any).statusCode = 404;
      throw err;
    }
  }

  private async resolveAttachments(
    attachments: Array<{ attachmentType: string; title: string; fileUrl?: string }>,
    vendorId: number | null | undefined,
    uploadedFiles: { [fieldname: string]: Express.Multer.File[] }
  ) {
    return Promise.all(
      attachments.map(async (att, idx) => {
        if (att.attachmentType === "FILE") {
          const fieldname = `attachment_file_${idx}`;
          const file = uploadedFiles[fieldname]?.[0];
          if (!file) {
            const err = new Error(`File for attachment[${idx}] ("${att.title}") is missing`);
            (err as any).statusCode = 400;
            throw err;
          }
          const key = await uploadToWasabiCompanyVendorDocument(
            file.buffer, vendorId ?? 0, file.originalname, file.mimetype
          );
          return {
            attachmentType: att.attachmentType,
            title: att.title,
            fileUrl: key,
            fileName: key.split("/").pop() ?? file.originalname,
            originalFileName: file.originalname,
            fileType: file.mimetype,
            fileSize: file.size,           // actual bytes from multer
          };
        }
        if (!att.fileUrl) {
          const err = new Error(`fileUrl is required for YOUTUBE attachment[${idx}] ("${att.title}")`);
          (err as any).statusCode = 400;
          throw err;
        }
        return {
          attachmentType: att.attachmentType,
          title: att.title,
          fileUrl: att.fileUrl,
          fileName: null,
          originalFileName: null,
          fileType: "youtube",
          fileSize: null,
        };
      })
    );
  }
}
