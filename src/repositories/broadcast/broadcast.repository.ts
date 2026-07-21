import { prisma } from "../../prisma/client";

export class BroadcastRepository {
  // ─── Shared include used across all read queries ─────────────────────────────
  private readonly defaultInclude = {
    audiences: true,
    attachments: true,
    createdBy: { select: { id: true, user_name: true } },
    updatedBy: { select: { id: true, user_name: true } },
  };

  // ─── CREATE ──────────────────────────────────────────────────────────────────

  async createBroadcast(
    tx: any,
    data: {
      title: string;
      content: string;
      type: string;
      status: string;
      publish_at: Date | null;
      vendor_id: number | null;
      created_by: number;
      updated_by: number;
    }
  ) {
    return tx.broadcastMaster.create({ data });
  }

  async createAudiences(
    tx: any,
    broadcastId: number,
    audiences: Array<{ audienceType: string; targetId?: number | null }>,
    userId: number
  ) {
    return tx.broadcastAudienceMapping.createMany({
      data: audiences.map((a) => ({
        broadcast_id: broadcastId,
        audience_type: a.audienceType,
        target_id: a.targetId ?? null,
        created_by: userId,
        updated_by: userId,
      })),
    });
  }

  async createAttachments(
    tx: any,
    broadcastId: number,
    attachments: Array<{
      attachmentType: string;
      title: string;
      fileUrl?: string;
      fileName?: string | null;
      originalFileName?: string | null;
      fileType?: string | null;
    }>,
    userId: number
  ) {
    return tx.broadcastAttachment.createMany({
      data: attachments.map((a) => ({
        broadcast_id: broadcastId,
        attachment_type: a.attachmentType,
        title: a.title,
        file_url: a.fileUrl ?? "",
        file_name: a.fileName ?? null,
        original_file_name: a.originalFileName ?? null,
        file_type: a.fileType ?? null,
        created_by: userId,
        updated_by: userId,
      })),
    });
  }

  // ─── READ ─────────────────────────────────────────────────────────────────────

  /**
   * Find a single broadcast by ID with full relations
   */
  async findById(id: number) {
    return prisma.broadcastMaster.findUnique({
      where: { id },
      include: this.defaultInclude,
    });
  }

  /**
   * List broadcasts with optional filters and audience-based visibility
   *
   * @param filters  - vendorId, status, type, page, limit
   * @param audience - current user context (id, user_type_id, franchise_id) for filtering
   */
  async findMany(
    filters: {
      vendorId?: number;
      status?: string;
      type?: string;
      page: number;
      limit: number;
    },
    audience?: {
      userId: number;
      userTypeId?: number;
      franchiseId?: number;
    }
  ) {
    const { vendorId, status, type, page, limit } = filters;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};
    if (vendorId) where.vendor_id = vendorId;
    if (status) where.status = status;
    else where.status = "ACTIVE";
    if (type) where.type = type;

    // Audience-based visibility: show only broadcasts this user is allowed to see
    if (audience) {
      const audienceConditions: any[] = [
        { audience_type: "ALL" },
        { audience_type: "USER", target_id: audience.userId },
      ];
      if (audience.userTypeId) {
        audienceConditions.push({ audience_type: "ROLE", target_id: audience.userTypeId });
      }
      if (audience.franchiseId) {
        audienceConditions.push({ audience_type: "FRANCHISE", target_id: audience.franchiseId });
      }
      where.audiences = { some: { OR: audienceConditions } };
      
      // Override status to ACTIVE and ensure we only show items published now or in the past
      where.status = "ACTIVE";
      where.OR = [
        { publish_at: null },
        { publish_at: { lte: new Date() } }
      ];
    }

    const [data, total] = await Promise.all([
      prisma.broadcastMaster.findMany({
        where,
        include: {
          ...this.defaultInclude,
          ...(audience ? { readLogs: { where: { user_id: audience.userId }, select: { id: true } } } : {}),
        },
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      }),
      prisma.broadcastMaster.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  // ─── UPDATE ──────────────────────────────────────────────────────────────────

  /**
   * Update core broadcast fields (audiences/attachments are replaced entirely)
   */
  async update(
    tx: any,
    id: number,
    data: {
      title?: string;
      content?: string;
      type?: string;
      status?: string;
      publish_at?: Date | null;
      vendor_id?: number | null;
      updated_by: number;
    }
  ) {
    return tx.broadcastMaster.update({
      where: { id },
      data: { ...data, updated_at: new Date() },
    });
  }

  /**
   * Delete all existing audience rows for a broadcast (used before replacing)
   */
  async deleteAudiences(tx: any, broadcastId: number) {
    return tx.broadcastAudienceMapping.deleteMany({ where: { broadcast_id: broadcastId } });
  }

  /**
   * Delete all existing attachment rows for a broadcast (used before replacing)
   */
  async deleteAttachments(tx: any, broadcastId: number) {
    return tx.broadcastAttachment.deleteMany({ where: { broadcast_id: broadcastId } });
  }

  // ─── DELETE (soft — sets status = INACTIVE) ──────────────────────────────────

  async softDelete(id: number, userId: number) {
    return prisma.broadcastMaster.update({
      where: { id },
      data: { status: "INACTIVE", updated_by: userId, updated_at: new Date() },
    });
  }

  // ─── READ TRACKING ───────────────────────────────────────────────────────────

  /**
   * Mark broadcast as read by a user. Silently ignores if already marked.
   */
  async markRead(broadcastId: number, userId: number) {
    return prisma.broadcastRead.upsert({
      where: { broadcast_id_user_id: { broadcast_id: broadcastId, user_id: userId } },
      update: { read_at: new Date(), updated_by: userId, updated_at: new Date() },
      create: {
        broadcast_id: broadcastId,
        user_id: userId,
        created_by: userId,
        updated_by: userId,
      },
    });
  }

  /**
   * Get list of all users who have read a broadcast
   */
  async findReaders(broadcastId: number) {
    let superAdminTypeIds: number[] = [];
    try {
      const superAdminRoles = await prisma.userTypeMaster.findMany({
        where: {
          user_type: {
            in: ["super-admin", "superadmin", "super_admin"],
            mode: "insensitive",
          },
        },
        select: { id: true },
      });
      superAdminTypeIds = superAdminRoles.map((r) => r.id);
    } catch (err) {
      // Non-fatal fallback
    }

    const reads = await prisma.broadcastRead.findMany({
      where: {
        broadcast_id: broadcastId,
        ...(superAdminTypeIds.length > 0
          ? { user: { user_type_id: { notIn: superAdminTypeIds } } }
          : {}),
      },
      include: {
        user: { select: { id: true, user_name: true, user_email: true } },
      },
      orderBy: { read_at: "desc" },
    });

    return reads;
  }
}
