import { prisma } from "../../prisma/client";

export class BroadcastRepository {
  // ─── Shared include used across all read queries ─────────────────────────────
  private readonly defaultInclude = {
    category: true,
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
      category_id?: number | null;
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
      fileSize?: number | null;
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
        file_size: a.fileSize != null ? BigInt(a.fileSize) : null,
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
      where.status = "ACTIVE";
      where.OR = [
        { publish_at: null },
        { publish_at: { lte: new Date() } }
      ];

      const audienceConditions: any[] = [
        // 1. Broadcast has no audiences defined (unrestricted)
        { audiences: { none: {} } },
        // 2. Broadcast is sent to ALL
        { audiences: { some: { audience_type: "ALL" } } },
        // 3. Broadcast is explicitly sent to this user ID
        { audiences: { some: { audience_type: "USER", target_id: audience.userId } } },
      ];

      // 4a. Broadcast has BOTH Franchise and Role targets -> user must match BOTH
      if (audience.franchiseId && audience.userTypeId) {
        audienceConditions.push({
          AND: [
            { audiences: { some: { audience_type: "FRANCHISE" } } },
            { audiences: { some: { audience_type: "FRANCHISE", target_id: audience.franchiseId } } },
            { audiences: { some: { audience_type: "ROLE" } } },
            { audiences: { some: { audience_type: "ROLE", target_id: audience.userTypeId } } },
          ],
        });
      }

      // 4b. Broadcast has ONLY Franchise targets (no Role targets) -> user must match Franchise
      if (audience.franchiseId) {
        audienceConditions.push({
          AND: [
            { audiences: { some: { audience_type: "FRANCHISE" } } },
            { audiences: { some: { audience_type: "FRANCHISE", target_id: audience.franchiseId } } },
            { audiences: { none: { audience_type: "ROLE" } } },
          ],
        });
      }

      // 4c. Broadcast has ONLY Role targets (no Franchise targets) -> user must match Role
      if (audience.userTypeId) {
        audienceConditions.push({
          AND: [
            { audiences: { none: { audience_type: "FRANCHISE" } } },
            { audiences: { some: { audience_type: "ROLE" } } },
            { audiences: { some: { audience_type: "ROLE", target_id: audience.userTypeId } } },
          ],
        });
      }

      where.AND = [
        { OR: audienceConditions }
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
      category_id?: number | null;
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
   * Get list of all target/sent users for a broadcast along with their read status
   */
  async findReaders(broadcastId: number) {
    let superAdminTypeIds: number[] = [];
    try {
      const superAdminRoles = await prisma.userTypeMaster.findMany({
        where: {
          user_type: {
            in: [
              "super-admin", "superadmin", "super_admin",
              "master-admin", "masteradmin", "master_admin", "master", "vloq master", "vloq_master"
            ],
            mode: "insensitive",
          },
        },
        select: { id: true },
      });
      superAdminTypeIds = superAdminRoles.map((r) => r.id);
    } catch (err) {
      // Non-fatal fallback
    }

    const broadcast = await prisma.broadcastMaster.findUnique({
      where: { id: broadcastId },
      include: {
        audiences: true,
      },
    });

    if (!broadcast) return [];

    const effectivePublishDate = broadcast.publish_at || broadcast.created_at;

    // 1. Fetch read logs for this broadcast
    const reads = await prisma.broadcastRead.findMany({
      where: {
        broadcast_id: broadcastId,
        user: {
          ...(superAdminTypeIds.length > 0
            ? { user_type_id: { notIn: superAdminTypeIds } }
            : {}),
          ...(effectivePublishDate ? { created_at: { lte: effectivePublishDate } } : {}),
        },
      },
      include: {
        user: { select: { id: true, user_name: true, user_email: true, created_at: true } },
      },
      orderBy: { read_at: "desc" },
    });

    const readMap = new Map<number, { id: number; read_at: Date }>();
    reads.forEach((r) => {
      if (r.user_id) {
        readMap.set(r.user_id, { id: r.id, read_at: r.read_at });
      }
    });

    // 2. Fetch sent users from notifications table
    const notifications = await prisma.notification.findMany({
      where: {
        entity_type: "broadcast",
        entity_id: broadcastId,
        user: {
          ...(superAdminTypeIds.length > 0
            ? { user_type_id: { notIn: superAdminTypeIds } }
            : {}),
        },
      },
      select: {
        user: { select: { id: true, user_name: true, user_email: true, created_at: true } },
      },
      distinct: ["user_id"],
    });

    const userMap = new Map<number, { id: number; user_name: string; email?: string }>();

    // Add users from notifications
    notifications.forEach((n) => {
      if (n.user) {
        userMap.set(n.user.id, {
          id: n.user.id,
          user_name: n.user.user_name,
          email: n.user.user_email || undefined,
        });
      }
    });

    // Add readers into userMap as well in case notifications weren't created for legacy items
    reads.forEach((r) => {
      if (r.user && !userMap.has(r.user.id)) {
        userMap.set(r.user.id, {
          id: r.user.id,
          user_name: r.user.user_name,
          email: r.user.user_email || undefined,
        });
      }
    });

    // 3. Fallback: If no notifications or readers exist yet, resolve target users from audiences
    if (userMap.size === 0) {
      const isAll = broadcast.audiences.some((a) => a.audience_type === "ALL") || broadcast.audiences.length === 0;
      if (isAll) {
        const activeUsers = await prisma.userMaster.findMany({
          where: {
            status: { equals: "active", mode: "insensitive" },
            ...(broadcast.vendor_id ? { vendor_id: broadcast.vendor_id } : {}),
            ...(superAdminTypeIds.length > 0 ? { user_type_id: { notIn: superAdminTypeIds } } : {}),
          },
          select: { id: true, user_name: true, user_email: true },
        });
        activeUsers.forEach((u) => {
          userMap.set(u.id, { id: u.id, user_name: u.user_name, email: u.user_email || undefined });
        });
      } else {
        const franchiseIds = broadcast.audiences.filter((a) => a.audience_type === "FRANCHISE" && a.target_id).map((a) => a.target_id!);
        const roleIds = broadcast.audiences.filter((a) => a.audience_type === "ROLE" && a.target_id).map((a) => a.target_id!);
        const userIds = broadcast.audiences.filter((a) => a.audience_type === "USER" && a.target_id).map((a) => a.target_id!);

        const orConds: any[] = [];
        if (userIds.length > 0) orConds.push({ id: { in: userIds } });
        if (franchiseIds.length > 0 && roleIds.length > 0) {
          orConds.push({ franchise_id: { in: franchiseIds }, user_type_id: { in: roleIds } });
        } else if (franchiseIds.length > 0) {
          orConds.push({ franchise_id: { in: franchiseIds } });
        } else if (roleIds.length > 0) {
          orConds.push({ user_type_id: { in: roleIds } });
        }

        if (orConds.length > 0) {
          const matched = await prisma.userMaster.findMany({
            where: {
              status: { equals: "active", mode: "insensitive" },
              ...(broadcast.vendor_id ? { vendor_id: broadcast.vendor_id } : {}),
              ...(superAdminTypeIds.length > 0 ? { user_type_id: { notIn: superAdminTypeIds } } : {}),
              OR: orConds,
            },
            select: { id: true, user_name: true, user_email: true },
          });
          matched.forEach((u) => {
            userMap.set(u.id, { id: u.id, user_name: u.user_name, email: u.user_email || undefined });
          });
        }
      }
    }

    // Combine userMap with read logs
    const result = Array.from(userMap.values()).map((user) => {
      const readInfo = readMap.get(user.id);
      return {
        id: readInfo?.id || user.id,
        user_id: user.id,
        broadcast_id: broadcastId,
        read_at: readInfo?.read_at ? readInfo.read_at.toISOString() : null,
        is_read: !!readInfo,
        user: {
          id: user.id,
          user_name: user.user_name,
          email: user.email,
        },
      };
    });

    // Sort: Viewed users first (newest read_at first), then Unread users alphabetically by user_name
    result.sort((a, b) => {
      if (a.is_read && !b.is_read) return -1;
      if (!a.is_read && b.is_read) return 1;
      if (a.is_read && b.is_read && a.read_at && b.read_at) {
        return new Date(b.read_at).getTime() - new Date(a.read_at).getTime();
      }
      return (a.user.user_name || "").localeCompare(b.user.user_name || "");
    });

    return result;
  }
}
