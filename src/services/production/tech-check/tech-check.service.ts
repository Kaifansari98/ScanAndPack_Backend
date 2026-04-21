import { NotificationType, Prisma } from "../../../prisma/generated";
import { prisma } from "../../../prisma/client";
import logger from "../../../utils/logger";
import { NotificationService } from "../../../../src/services/notification/notification.service";
import { resolveLeadCode } from "../../../../src/utils/fileUtils";
import { LeadSuperAdminApprovalLockInService } from "../../leadSuperAdminApprovalLockIn/leadSuperAdminApprovalLockIn.service";

export type ApproveTechCheckResult =
  | {
      mode: "instance";
      instance_id: number;
      is_tech_check_completed: boolean | null;
      tech_check_completed_at: Date | null;
    }
  | {
      mode: "instance_and_lead_moved";
      instance_id: number;
      is_tech_check_completed: boolean | null;
      tech_check_completed_at: Date | null;
      updatedLead: any;
      mapping: any;
      moved_to_order_login: true;
      assign_to_user_id: number;
      account_id: number;
      order_login_lock_in: any;
    }
  | {
      updatedLead: any;
      mapping: any;
      order_login_lock_in: any;
    };

export class TechCheckService {
  private leadSuperAdminApprovalLockInService =
    new LeadSuperAdminApprovalLockInService();

  public async getInstanceTechCheckStatus(
    vendorId: number,
    leadId: number,
    instanceId: number,
  ) {
    return prisma.leadProductStructureInstance.findFirst({
      where: {
        id: instanceId,
        lead_id: leadId,
        vendor_id: vendorId,
      },
      select: {
        id: true,
        lead_id: true,
        vendor_id: true,
        is_tech_check_completed: true,
        tech_check_completed_at: true,
        is_order_login_completed: true,
        order_login_completed_at: true,
        is_production_completed: true,
        production_completed_at: true,
      },
    });
  }

  // ✅ Approve Tech Check
  public async approveTechCheck(
    vendorId: number,
    leadId: number,
    userId: number,
    assignToUserId: number,
    accountId: number,
    baseUrl: string,
    productStructureInstanceId?: number,
  ): Promise<ApproveTechCheckResult> {
    const result: ApproveTechCheckResult = await prisma.$transaction(
      async (tx) => {
        const vendor = await tx.vendorMaster.findUnique({
          where: { id: vendorId },
          select: { IsAccountLocInEnabled: true },
        });
        const isAccountLocInEnabled = vendor?.IsAccountLocInEnabled === true;

        if (productStructureInstanceId) {
          const instance = await tx.leadProductStructureInstance.findFirst({
            where: {
              id: productStructureInstanceId,
              lead_id: leadId,
              vendor_id: vendorId,
              account_id: accountId || undefined,
            },
            select: { id: true, title: true, account_id: true },
          });

          if (!instance) {
            throw new Error(
              "Product structure instance not found for this lead",
            );
          }

          const effectiveAccountId = accountId || instance.account_id;

          const updatedInstance = await tx.leadProductStructureInstance.update({
            where: { id: productStructureInstanceId },
            data: {
              is_tech_check_completed: true,
              tech_check_completed_at: new Date(),
              updated_by: userId,
              updated_at: new Date(),
            },
          });

          // ✅ Create mapping for this instance transition
          let instanceMapping: any = null;

          if (assignToUserId && effectiveAccountId) {
            instanceMapping = await tx.leadUserMapping.create({
              data: {
                vendor_id: vendorId,
                lead_id: leadId,
                account_id: effectiveAccountId,
                user_id: assignToUserId,
                type: "order-login-stage",
                status: "active",
                created_by: userId,
              },
            });
          }

          await tx.leadDetailedLogs.create({
            data: {
              vendor_id: vendorId,
              lead_id: leadId,
              account_id: effectiveAccountId,
              action: `Tech Check completed for instance ${instance.title}`,
              action_type: "UPDATE",
              created_by: userId,
            },
          });

          const pendingInstances = await tx.leadProductStructureInstance.count({
            where: {
              lead_id: leadId,
              vendor_id: vendorId,
              OR: [
                { is_tech_check_completed: false },
                { is_tech_check_completed: null },
              ],
            },
          });

          let orderLoginLockIn: any = null;

          if (isAccountLocInEnabled) {
            try {
              orderLoginLockIn =
                await this.leadSuperAdminApprovalLockInService.createOrderLoginLockIn(
                  {
                    vendor_id: vendorId,
                    lead_id: leadId,
                    created_by: userId,
                    instance_id: productStructureInstanceId,
                    clientBaseUrl: baseUrl,
                  },
                  tx,
                );
            } catch (lockInError: any) {
              logger.warn(
                "Order Login lock-in creation failed after tech-check instance completion",
                {
                  lead_id: leadId,
                  instance_id: productStructureInstanceId,
                  error: lockInError?.message,
                },
              );
            }
          }

          if (pendingInstances === 0) {
            if (!assignToUserId || !effectiveAccountId) {
              throw new Error(
                "assign_to_user_id and account_id are required to move lead to Order Login",
              );
            }

            const orderLoginStatus = await tx.statusTypeMaster.findFirst({
              where: { vendor_id: vendorId, tag: "Type 9" },
              select: { id: true },
            });

            if (!orderLoginStatus) {
              throw new Error(
                `Order Login (Type 9) not configured for vendor ${vendorId}`,
              );
            }

            const updatedLead = await tx.leadMaster.update({
              where: { id: leadId },
              data: {
                status_id: orderLoginStatus.id,
                tech_check_completed_at: new Date(),
                updated_by: userId,
                updated_at: new Date(),
              },
            });

            let chatRoom = await tx.leadChatRoom.findFirst({
              where: {
                lead_id: leadId,
                vendor_id: vendorId,
              },
              select: { id: true },
            });

            if (!chatRoom) {
              chatRoom = await tx.leadChatRoom.create({
                data: {
                  lead_id: leadId,
                  vendor_id: vendorId,
                },
                select: { id: true },
              });
            }

            const existingMember = await tx.leadChatMember.findFirst({
              where: {
                chat_room_id: chatRoom.id,
                user_id: assignToUserId,
              },
              select: { id: true },
            });

            if (!existingMember) {
              await tx.leadChatMember.create({
                data: {
                  chat_room_id: chatRoom.id,
                  user_id: assignToUserId,
                  added_by: userId,
                },
              });
            }

            await tx.leadStatusLogs.create({
              data: {
                vendor_id: vendorId,
                lead_id: leadId,
                account_id: effectiveAccountId,
                status_id: orderLoginStatus.id,
                created_by: userId,
              },
            });

            const assignedUser = await tx.userMaster.findUnique({
              where: { id: assignToUserId },
              select: { user_name: true },
            });
            const assignedUserName = assignedUser?.user_name ?? `User #${assignToUserId}`;

            await tx.leadDetailedLogs.create({
              data: {
                vendor_id: vendorId,
                lead_id: leadId,
                account_id: effectiveAccountId,
                action: `All instances tech check completed. Lead moved to Order Login and assigned to ${assignedUserName}`,
                action_type: "STATUS_CHANGE",
                created_by: userId,
              },
            });

            if (!orderLoginLockIn && isAccountLocInEnabled) {
              orderLoginLockIn =
                await this.leadSuperAdminApprovalLockInService.createOrderLoginLockIn(
                  {
                    vendor_id: vendorId,
                    lead_id: leadId,
                    created_by: userId,
                    instance_id: updatedInstance.id,
                    clientBaseUrl: baseUrl,
                  },
                  tx,
                );
            }

            return {
              mode: "instance_and_lead_moved",
              instance_id: updatedInstance.id,
              is_tech_check_completed: updatedInstance.is_tech_check_completed,
              tech_check_completed_at: updatedInstance.tech_check_completed_at,
              updatedLead,
              mapping: instanceMapping,
              moved_to_order_login: true,
              assign_to_user_id: assignToUserId,
              account_id: effectiveAccountId,
              order_login_lock_in: orderLoginLockIn,
            };
          }
          return {
            mode: "instance",
            instance_id: updatedInstance.id,
            is_tech_check_completed: updatedInstance.is_tech_check_completed,
            tech_check_completed_at: updatedInstance.tech_check_completed_at,
          };
        }

        // 1️⃣ Get Order Login Status (Type 9)
        const orderLoginStatus = await tx.statusTypeMaster.findFirst({
          where: { vendor_id: vendorId, tag: "Type 9" },
          select: { id: true },
        });

        if (!orderLoginStatus) {
          throw new Error(
            `Order Login (Type 9) not configured for vendor ${vendorId}`,
          );
        }

        // 2️⃣ Update Lead status
        const updatedLead = await tx.leadMaster.update({
          where: { id: leadId },
          data: {
            status_id: orderLoginStatus.id,
            tech_check_completed_at: new Date(),
            updated_by: userId,
            updated_at: new Date(),
          },
        });

        // 3️⃣ Assign to Backend User
        const mapping = await tx.leadUserMapping.create({
          data: {
            vendor_id: vendorId,
            lead_id: leadId,
            account_id: accountId,
            user_id: assignToUserId,
            type: "order-login-stage",
            status: "active",
            created_by: userId,
          },
        });

        // ✅ Ensure assigned backend user is in lead chat members
        let chatRoom = await tx.leadChatRoom.findFirst({
          where: {
            lead_id: leadId,
            vendor_id: vendorId,
          },
          select: { id: true },
        });

        if (!chatRoom) {
          chatRoom = await tx.leadChatRoom.create({
            data: {
              lead_id: leadId,
              vendor_id: vendorId,
            },
            select: { id: true },
          });
        }

        const existingMember = await tx.leadChatMember.findFirst({
          where: {
            chat_room_id: chatRoom.id,
            user_id: assignToUserId,
          },
          select: { id: true },
        });

        if (existingMember) {
          logger.info(
            "[SERVICE] LeadChatMember already exists, skipping insert",
            {
              lead_id: leadId,
              chat_room_id: chatRoom.id,
              user_id: assignToUserId,
            },
          );
        } else {
          await tx.leadChatMember.create({
            data: {
              chat_room_id: chatRoom.id,
              user_id: assignToUserId,
              added_by: userId,
            },
          });
        }

        // 4️⃣ Log status change
        await tx.leadStatusLogs.create({
          data: {
            vendor_id: vendorId,
            lead_id: leadId,
            account_id: accountId,
            status_id: orderLoginStatus.id,
            created_by: userId,
          },
        });

        // 5️⃣ Detailed Logs
        const assignedUserForLog = await tx.userMaster.findUnique({
          where: { id: assignToUserId },
          select: { user_name: true },
        });
        const assignedUserNameForLog = assignedUserForLog?.user_name ?? `User #${assignToUserId}`;

        await tx.leadDetailedLogs.create({
          data: {
            vendor_id: vendorId,
            lead_id: leadId,
            account_id: accountId,
            action: `Tech Check approved. Lead moved to Order Login and assigned to ${assignedUserNameForLog}`,
            action_type: "STATUS_CHANGE",
            created_by: userId,
          },
        });

        const orderLoginLockIn = isAccountLocInEnabled
          ? await this.leadSuperAdminApprovalLockInService.createOrderLoginLockIn(
              {
                vendor_id: vendorId,
                lead_id: leadId,
                created_by: userId,
                clientBaseUrl: baseUrl,
              },
              tx,
            )
          : null;

        return { updatedLead, mapping, order_login_lock_in: orderLoginLockIn };
      },
    );

    const notify = async () => {
      // ✅ instance_id ke basis pe quantity_index fetch karo — dono blocks use karenge
      const leadCode = await resolveLeadCode(
        vendorId,
        leadId,
        productStructureInstanceId ?? undefined,
      );

      // ✅ redirectPath builder — accountId + instance_id (optional) dono include
      const buildRedirectPath = (leadAccountId: number | null) => {
        const queryParams = new URLSearchParams();
        if (leadAccountId) {
          queryParams.set("accountId", String(leadAccountId));
        }
        if (productStructureInstanceId) {
          queryParams.set("instance_id", String(productStructureInstanceId));
        }
        const queryString = queryParams.toString();
        return `/dashboard/leads/details/${leadId}${queryString ? `?${queryString}` : ""}`;
      };

      // ===============================
      // ORDER LOGIN STAGE → ADMIN NOTIFICATION
      // ===============================
      try {
        const actorId = userId;

        const lead = await prisma.leadMaster.findUnique({
          where: { id: leadId },
          select: {
            firstname: true,
            lastname: true,
            lead_code: true,
            vendor_id: true,
            account_id: true,
          },
        });

        if (!lead) return;

        const leadName =
          `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim();

        // ✅ redirectPath with instance_id
        const redirectPath = buildRedirectPath(lead.account_id);

        const admins = await prisma.userMaster.findMany({
          where: {
            vendor_id: lead.vendor_id,
            status: "active",
            user_type: {
              user_type: { in: ["admin"] },
            },
          },
          select: {
            id: true,
            user_name: true,
            user_email: true,
          },
        });

        for (const admin of admins) {
          if (admin.id === actorId) continue;

          await NotificationService.createAndSend({
            vendor_id: lead.vendor_id,
            user_id: admin.id,
            sender_id: actorId,
            type: NotificationType.LEAD_MILESTONE,
            title: "Lead Entered Order Login Stage",
            message: `${leadCode} - ${leadName} moved to Order Login stage.`,
            entity_type: "lead",
            entity_id: leadId,
            redirect_url: redirectPath, // ✅ instance_id included
          });

        }
      } catch (err: any) {
        logger.warn("⚠️ Order login admin notification failed", {
          lead_id: leadId,
          error: err?.message,
        });
      }

    };

    void notify();
    return result;
  }

  // ✅ Keep your existing method
  public async getLeadsWithStatusTechCheck(
    vendorId: number,
    userId: number,
    limit = 10,
    page = 1,
  ) {
    const skip = (page - 1) * limit;

    const techCheckStatus = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 8" },
      select: { id: true },
    });

    if (!techCheckStatus) {
      throw new Error(
        `Tech Check status (Type 8) not found for vendor ${vendorId}`,
      );
    }

    const creator = await prisma.userMaster.findUnique({
      where: { id: userId },
      include: { user_type: true },
    });

    const isAdmin = creator?.user_type?.user_type?.toLowerCase() === "admin";

    const baseWhere: any = {
      vendor_id: vendorId,
      is_deleted: false,
      status_id: techCheckStatus.id,
      activity_status: { in: ["onGoing", "lostApproval"] },
    };

    if (isAdmin) {
      const [total, leads] = await Promise.all([
        prisma.leadMaster.count({ where: baseWhere }),
        prisma.leadMaster.findMany({
          where: baseWhere,
          include: this.defaultIncludes(),
          orderBy: { created_at: Prisma.SortOrder.desc },
          skip,
          take: limit,
        }),
      ]);

      return { total, leads };
    }

    const mappedLeads = await prisma.leadUserMapping.findMany({
      where: { vendor_id: vendorId, user_id: userId, status: "active" },
      select: { lead_id: true },
    });

    const taskLeads = await prisma.userLeadTask.findMany({
      where: {
        vendor_id: vendorId,
        OR: [{ created_by: userId }, { user_id: userId }],
      },
      select: { lead_id: true },
    });

    const leadIds = [
      ...new Set([
        ...mappedLeads.map((m) => m.lead_id),
        ...taskLeads.map((t) => t.lead_id),
      ]),
    ];

    if (!leadIds.length) return { total: 0, leads: [] };

    const where = { ...baseWhere, id: { in: leadIds } };

    const [total, leads] = await Promise.all([
      prisma.leadMaster.count({ where }),
      prisma.leadMaster.findMany({
        where,
        include: this.defaultIncludes(),
        orderBy: { created_at: Prisma.SortOrder.desc },
        skip,
        take: limit,
      }),
    ]);

    return { total, leads };
  }

  // ✅ Approve Multiple Documents (Tech Check)
  public async approveMultipleDocuments(
    vendorId: number,
    leadId: number,
    userId: number,
    approvedDocs: number[],
    baseUrl: string,
    instanceId?: number,
  ) {
    // ===============================
    // 1️⃣ TRANSACTION LAYER
    // ===============================

    const result = await prisma.$transaction(async (tx) => {
      const accountId = (
        await tx.leadMaster.findUnique({
          where: { id: leadId },
          select: { account_id: true },
        })
      )?.account_id;

      if (!accountId) {
        throw new Error("Lead account not found");
      }

      const updateRes = await tx.leadDocuments.updateMany({
        where: {
          id: { in: approvedDocs },
          vendor_id: vendorId,
          documentType: {
            tag: { in: ["Type 11", "Type 12"] },
          },
        },
        data: {
          tech_check_status: "APPROVED",
        },
      });

      const detailedLog = await tx.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          action: `Tech check approved ${approvedDocs.length} documents`,
          action_type: "UPDATE",
          created_by: userId,
        },
      });

      if (approvedDocs.length) {
        const docLogsData = approvedDocs.map((docId) => ({
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          doc_id: docId,
          lead_logs_id: detailedLog.id,
          created_by: userId,
        }));

        await tx.leadDocumentLogs.createMany({
          data: docLogsData,
        });
      }

      return {
        accountId,
        updatedCount: updateRes.count,
      };
    });

    // ===============================
    // 2️⃣ NOTIFICATION + EMAIL LAYER
    // ===============================

    try {
      const [leadInfo, leadCode] = await Promise.all([
        prisma.leadMaster.findUnique({
          where: { id: leadId, vendor_id: vendorId },
          select: {
            lead_code: true,
            firstname: true,
            lastname: true,
            account_id: true,
          },
        }),

        resolveLeadCode(vendorId, leadId, instanceId), // ✅ helper call
      ]);

      if (!leadInfo) return result;

      const leadName =
        `${leadInfo.firstname ?? ""} ${leadInfo.lastname ?? ""}`.trim();

      // ✅ redirectPath — accountId + instance_id (optional) dono include
      const queryParams = new URLSearchParams();
      if (leadInfo.account_id) {
        queryParams.set("accountId", String(leadInfo.account_id));
      }
      if (instanceId) {
        queryParams.set("instance_id", String(instanceId));
      }
      const queryString = queryParams.toString();
      const redirectPath = `/dashboard/leads/details/${leadId}${queryString ? `?${queryString}` : ""}`;

      const mappings = await prisma.leadUserMapping.findMany({
        where: {
          vendor_id: vendorId,
          lead_id: leadId,
          status: "active",
        },
        select: { user_id: true },
      });

      const salesUserIds = [...new Set(mappings.map((m) => m.user_id))];

      if (!salesUserIds.length) return result;

      const salesExecutives = await prisma.userMaster.findMany({
        where: {
          id: { in: salesUserIds },
          status: "active",
          user_type: {
            user_type: { equals: "sales-executive", mode: "insensitive" },
          },
        },
        select: {
          id: true,
          user_name: true,
          user_email: true,
        },
      });

      await Promise.allSettled(
        salesExecutives.map(async (salesExec) => {
          // 🔔 In-App Notification
          await NotificationService.createAndSend({
            vendor_id: vendorId,
            user_id: salesExec.id,
            sender_id: userId,
            type: NotificationType.LEAD_ACTION,
            title: "Tech Check Document Approved",
            message: `The documents for ${leadCode} - ${leadName} have been approved by Tech Check.`,
            entity_type: "lead",
            entity_id: leadId,
            redirect_url: redirectPath,
          });
        }),
      );
    } catch (err: any) {
      logger.warn("⚠️ Tech Check approval notification failed", {
        lead_id: leadId,
        error: err?.message,
      });
    }

    return result;
  }

  public async rejectTechCheck(
    vendorId: number,
    leadId: number,
    userId: number,
    rejectedDocs: number[],
    baseUrl: string,
    instanceId?: number,
    remark?: string,
  ) {
    // ===============================
    // 1️⃣ TRANSACTION LAYER
    // ===============================

    console.log("instance id from reject techcheck: ", instanceId);

    const result = await prisma.$transaction(async (tx) => {
      const accountId = (
        await tx.leadMaster.findUnique({
          where: { id: leadId },
          select: { account_id: true },
        })
      )?.account_id;

      if (!accountId) {
        throw new Error("Lead account not found");
      }

      const actionText = remark
        ? `Tech check rejected ${rejectedDocs.length} documents — Remark: ${remark}`
        : `Tech check rejected ${rejectedDocs.length} documents`;

      const detailedLog = await tx.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          action: actionText,
          action_type: "UPDATE",
          created_by: userId,
        },
      });

      const updateRes = await tx.leadDocuments.updateMany({
        where: {
          id: { in: rejectedDocs },
          vendor_id: vendorId,
          documentType: {
            tag: { in: ["Type 11", "Type 12"] },
          },
        },
        data: {
          tech_check_status: "REJECTED",
        },
      });

      if (rejectedDocs.length) {
        const docLogsData = rejectedDocs.map((docId) => ({
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          doc_id: docId,
          lead_logs_id: detailedLog.id,
          created_by: userId,
        }));

        await tx.leadDocumentLogs.createMany({
          data: docLogsData,
        });
      }

      return {
        accountId,
        rejectedUpdated: updateRes.count,
      };
    });

    // ===============================
    // 2️⃣ NOTIFICATION + EMAIL LAYER
    // ===============================

    try {
      const [leadInfo, leadCode] = await Promise.all([
        prisma.leadMaster.findUnique({
          where: { id: leadId, vendor_id: vendorId },
          select: {
            lead_code: true,
            firstname: true,
            lastname: true,
            account_id: true,
          },
        }),

        resolveLeadCode(vendorId, leadId, instanceId), // ✅ helper call
      ]);

      if (!leadInfo) return result;

      const leadName =
        `${leadInfo.firstname ?? ""} ${leadInfo.lastname ?? ""}`.trim();

      // ✅ redirectPath — accountId + instance_id (optional) dono include
      const queryParams = new URLSearchParams();
      if (leadInfo.account_id) {
        queryParams.set("accountId", String(leadInfo.account_id));
      }
      if (instanceId) {
        queryParams.set("instance_id", String(instanceId));
      }
      const queryString = queryParams.toString();
      const redirectPath = `/dashboard/leads/details/${leadId}${queryString ? `?${queryString}` : ""}`;

      const mappings = await prisma.leadUserMapping.findMany({
        where: {
          vendor_id: vendorId,
          lead_id: leadId,
          status: "active",
        },
        select: { user_id: true },
      });

      const salesUserIds = [...new Set(mappings.map((m) => m.user_id))];

      if (!salesUserIds.length) return result;

      const salesExecutives = await prisma.userMaster.findMany({
        where: {
          id: { in: salesUserIds },
          status: "active",
          user_type: {
            user_type: { equals: "sales-executive", mode: "insensitive" },
          },
        },
        select: {
          id: true,
          user_name: true,
          user_email: true,
        },
      });

      await Promise.allSettled(
        salesExecutives.map(async (salesExec) => {
          await NotificationService.createAndSend({
            vendor_id: vendorId,
            user_id: salesExec.id,
            sender_id: userId,
            type: NotificationType.LEAD_ACTION,
            title: "Tech Check Document Rejected",
            message: `Documents for ${leadCode} - ${leadName} have been rejected by Tech Check.`,
            entity_type: "lead",
            entity_id: leadId,
            redirect_url: redirectPath,
          });

        }),
      );
    } catch (err: any) {
      logger.warn("⚠️ Tech Check rejection notification failed", {
        lead_id: leadId,
        error: err?.message,
      });
    }

    return result;
  }

  private defaultIncludes() {
    return {
      account: {
        select: { id: true, name: true, email: true, contact_no: true },
      },
      siteType: true,
      source: true,
      statusType: true,
      productMappings: { include: { productType: true } },
      leadProductStructureMapping: { include: { productStructure: true } },
      assignedTo: { select: { id: true, user_name: true } },
      createdBy: { select: { id: true, user_name: true } },
    };
  }
}
