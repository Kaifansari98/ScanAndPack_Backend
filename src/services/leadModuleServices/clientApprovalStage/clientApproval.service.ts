import { prisma } from "../../../prisma/client";
import { ClientApprovalDto } from "../../../types/clientApproval.dto";
import { BackendData } from "../../../types/leadModule.types";
import { formatIndianCurrency } from "../../../utils/formatIndianCurrency";
import { generateSignedUrl } from "../../../utils/wasabiClient";
import { NotificationType, Prisma } from "../../../prisma/generated";
import logger from '../../../utils/logger'
import { NotificationService } from "../../notification/notification.service";
import { getFranchiseAdminRecipients } from "../../notification/adminRecipients.service";
import { sendPaymentAddedEmail } from "../../email/brevoEmail.service";
import { ensureLeadStatusLog } from "../../../utils/leadStatusLog";
import { createLeadLog } from "../../../utils/leadDetailedLog";

export class ClientApprovalService {
  public async addApprovalDocuments(data: {
    lead_id: number;
    vendor_id: number;
    account_id: number;
    created_by: number;
    documents: { originalName: string; sysName: string }[];
  }) {
    if (!data.documents || data.documents.length === 0) {
      return [];
    }

    const approvalDocType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: data.vendor_id, tag: "Type 13" },
    });
    if (!approvalDocType) throw new Error("Doc Type (Type 13) not found");

    const createdDocs: any[] = [];
    for (const doc of data.documents) {
      const docEntry = await prisma.leadDocuments.create({
        data: {
          doc_og_name: doc.originalName,
          doc_sys_name: doc.sysName,
          created_by: data.created_by,
          doc_type_id: approvalDocType.id,
          account_id: data.account_id,
          lead_id: data.lead_id,
          vendor_id: data.vendor_id,
        },
      });
      createdDocs.push(docEntry);
    }

    return createdDocs;
  }

  public async submitClientApproval(data: ClientApprovalDto) {
    const response: any = { screenshots: [], paymentInfo: null, ledger: null };

    // ✅ Step 1: Upload Client Approval Screenshots
    const approvalDocType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: data.vendor_id, tag: "Type 13" },
    });
    if (!approvalDocType) throw new Error("Doc Type (Type 13) not found");

    for (const doc of data.approvalScreenshots) {
      const docEntry = await prisma.leadDocuments.create({
        data: {
          doc_og_name: doc.originalName,
          doc_sys_name: doc.sysName,
          created_by: data.created_by,
          doc_type_id: approvalDocType.id,
          account_id: data.account_id,
          lead_id: data.lead_id,
          vendor_id: data.vendor_id,
        },
      });
      response.screenshots.push(docEntry);
    }

    // ✅ Step 2: Update Lead flags (but NOT status)
    await prisma.leadMaster.update({
      where: { id: data.lead_id },
      data: {
        is_client_approval_submitted: true,
        advance_payment_date: data.advance_payment_date
          ? new Date(data.advance_payment_date)
          : undefined,
        updated_by: data.created_by,
        updated_at: new Date(),
      },
    });

    // ✅ Step 3: If amount is provided → create payment + ledger + update pending
    if (data.amount_paid && data.amount_paid > 0) {
      const paymentType = await prisma.paymentTypeMaster.findFirst({
        where: { vendor_id: data.vendor_id, tag: "Type 3" }, // Client Approval Payment
      });
      if (!paymentType) throw new Error("Payment Type (Type 3) not found");

      let paymentFileId: number | null = null;

      // If payment files uploaded → store them
      if (data.payment_files && data.payment_files.length > 0) {
        const uploadedPaymentDocs = [];
        for (const doc of data.payment_files) {
          const docEntry = await prisma.leadDocuments.create({
            data: {
              doc_og_name: doc.originalName,
              doc_sys_name: doc.sysName,
              created_by: data.created_by,
              doc_type_id: approvalDocType.id,
              account_id: data.account_id,
              lead_id: data.lead_id,
              vendor_id: data.vendor_id,
            },
          });
          uploadedPaymentDocs.push(docEntry);
        }
        paymentFileId = uploadedPaymentDocs[0]?.id || null;
      }

      const leadForPayment = await prisma.leadMaster.findUnique({
        where: { id: data.lead_id },
        select: { status_id: true },
      });

      // ✅ Payment Entry
      const paymentInfo = await prisma.paymentInfo.create({
        data: {
          lead_id: data.lead_id,
          vendor_id: data.vendor_id,
          account_id: data.account_id,
          created_by: data.created_by,
          status_id: leadForPayment?.status_id ?? null,
          payment_type_id: paymentType.id,
          amount: data.amount_paid,
          payment_text: data.payment_text,
          payment_file_id: paymentFileId,
          payment_date: new Date(data.advance_payment_date),
        },
      });

      // ✅ Ledger Entry
      const ledger = await prisma.ledger.create({
        data: {
          lead_id: data.lead_id,
          vendor_id: data.vendor_id,
          account_id: data.account_id,
          client_id: data.client_id,
          created_by: data.created_by,
          amount: data.amount_paid,
          payment_date: new Date(data.advance_payment_date),
          type: "credit",
        },
      });

      response.paymentInfo = paymentInfo;
      response.ledger = ledger;

      // ✅ Step 4: Update pending amount
      const leadRecord = await prisma.leadMaster.findUnique({
        where: { id: data.lead_id },
        select: { pending_amount: true },
      });

      if (leadRecord) {
        const updatedPending =
          (leadRecord.pending_amount || 0) - data.amount_paid;
        await prisma.leadMaster.update({
          where: { id: data.lead_id },
          data: {
            pending_amount: updatedPending < 0 ? 0 : updatedPending,
            updated_by: data.created_by,
            updated_at: new Date(),
          },
        });
      }

      // ✅ Step 5: Log this event in LeadDetailedLogs
      await createLeadLog(prisma, {
        vendor_id: data.vendor_id,
        lead_id: data.lead_id,
        account_id: data.account_id,
        action: `₹${formatIndianCurrency(
          data.amount_paid
        )} has been received during Client Approval`,
        action_type: "CREATE",
        created_by: data.created_by,
      });

      try {
        const [leadInfo, updatedByUser] = await Promise.all([
          prisma.leadMaster.findUnique({
            where: { id: data.lead_id },
            select: {
              lead_code: true,
              firstname: true,
              lastname: true,
              account_id: true,
              franchise_id: true,
            },
          }),
          prisma.userMaster.findUnique({
            where: { id: data.created_by },
            select: { user_name: true },
          }),
        ]);

        const { recipients: admins, isSuperAdminFallback } = await getFranchiseAdminRecipients({
          vendorId: data.vendor_id,
          franchiseId: leadInfo?.franchise_id ?? null,
          excludeUserId: data.created_by,
        });

        const leadCode =
          leadInfo?.lead_code ?? `LEAD-${String(data.lead_id).padStart(4, "0")}`;
        const leadName = `${leadInfo?.firstname ?? ""} ${
          leadInfo?.lastname ?? ""
        }`.trim();
        const updatedByName = updatedByUser?.user_name ?? "User";
        const amountText = `₹${data.amount_paid.toLocaleString("en-IN")}`;
        const paymentTypeName = paymentType.type || "Payment";
        const baseUrl =
          process.env.CLIENT_BASE_URL ||
          process.env.FRONTEND_URL ||
          "http://localhost:3000";
        const leadUrl = leadInfo?.account_id
          ? `${baseUrl}/dashboard/leads/details/${data.lead_id}?accountId=${leadInfo.account_id}`
          : `${baseUrl}/dashboard/leads/details/${data.lead_id}`;
        const franchiseId = leadInfo?.franchise_id ?? null;

        await Promise.allSettled(
          admins.map(async (admin) => {
            await NotificationService.createAndSend({
              vendor_id: data.vendor_id,
              user_id: admin.id,
              sender_id: data.created_by,
              type: NotificationType.LEAD_ACTION,
              title: "Payment added",
              message: `Payment added for ${leadCode} - ${leadName} by ${updatedByName}.`,
              entity_type: "lead",
              entity_id: data.lead_id,
              redirect_url: `/dashboard/leads/details/${data.lead_id}${
                leadInfo?.account_id ? `?accountId=${leadInfo.account_id}` : ""
              }`,
            });

            if (!admin.user_email) return;

            await sendPaymentAddedEmail({
              vendor_id: data.vendor_id,
              franchise_id: franchiseId,
              allowSuperAdmin: isSuperAdminFallback,
              toEmail: admin.user_email,
              toName: admin.user_name ?? undefined,
              leadCode,
              leadName: leadName || "Lead",
              amount: amountText,
              paymentType: paymentTypeName,
              updatedBy: updatedByName,
              leadUrl,
            });
          })
        );
      } catch (notifyError: any) {
        logger.warn("⚠️ Failed to send payment notifications", {
          error: notifyError?.message,
          lead_id: data.lead_id,
        });
      }
    }

    return response;
  }

  public async getBackendUsersByVendor(
    vendorId: number
  ): Promise<BackendData[]> {
    try {
      console.log(
        `[SERVICE] Fetching Backend Users for vendor ID: ${vendorId}`
      );

      const vendor = await prisma.vendorMaster.findUnique({
        where: { id: vendorId },
        select: { is_this_vendor_is_custom_usertype_only: true },
      });

      const useCustomUsersOnly =
        vendor?.is_this_vendor_is_custom_usertype_only === true;

      let backendUsers;

      if (useCustomUsersOnly) {
        backendUsers = await prisma.userMaster.findMany({
          where: {
            vendor_id: vendorId,
            status: "active",
            user_type: {
              user_type: {
                equals: "custom",
                mode: "insensitive",
              },
            },
            userPrivilegeMappings: {
              some: {
                is_allowed: true,
                privilege: {
                  code: "production.order_login.order_login_details.enable_disable",
                  is_active: true,
                },
              },
            },
          },
          include: {
            user_type: true,
            documents: true,
          },
          orderBy: {
            created_at: "desc",
          },
        });
      } else {
        // First, find the user type ID for 'backend'
        const BackendUserType = await prisma.userTypeMaster.findFirst({
          where: {
            user_type: {
              equals: "backend",
              mode: "insensitive",
            },
          },
        });

        if (!BackendUserType) {
          console.log("[SERVICE] Backend user type not found");
          return [];
        }

        console.log(
          `[SERVICE] Found BackendUserType type ID: ${BackendUserType.id}`
        );

        // Fetch all users with backend role for the specified vendor
        backendUsers = await prisma.userMaster.findMany({
          where: {
            vendor_id: vendorId,
            user_type_id: BackendUserType.id,
            status: "active",
          },
          include: {
            user_type: true,
            documents: true,
          },
          orderBy: {
            created_at: "desc",
          },
        });
      }

      console.log(`[SERVICE] Found ${backendUsers.length} Site Supervisors`);

      // Transform the data to match our interface
      const transformedData: BackendData[] = backendUsers.map((user) => ({
        id: user.id,
        vendor_id: user.vendor_id,
        user_name: user.user_name,
        user_contact: user.user_contact,
        user_email: user.user_email,
        user_timezone: user.user_timezone,
        status: user.status,
        created_at: user.created_at,
        updated_at: user.updated_at,
        user_type: {
          id: user.user_type.id,
          user_type: user.user_type.user_type,
        },
        documents: user.documents.map((doc) => ({
          id: doc.id,
          document_name: doc.document_name,
          document_number: doc.document_number,
          filename: doc.filename,
        })),
      }));

      return transformedData;
    } catch (error: any) {
      console.error("[SERVICE] Error fetching Backend Users:", error);
      throw new Error(`Failed to fetch Backend Users: ${error.message}`);
    }
  }

  public async getLeadsWithStatusClientApproval(
    vendorId: number,
    userId: number
  ) {
    // 1. Resolve status ID dynamically for Type 7
    const clientApprovalStatus = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 7" },
      select: { id: true },
    });

    if (!clientApprovalStatus) {
      throw new Error(
        `Client Approval status (Type 7) not found for vendor ${vendorId}`
      );
    }

    // 2. Check if user is admin
    const creator = await prisma.userMaster.findUnique({
      where: { id: userId },
      include: { user_type: true },
    });
    const isAdmin = creator?.user_type?.user_type?.toLowerCase() === "admin";

    // ============= Admin Flow =============
    if (isAdmin) {
      return prisma.leadMaster.findMany({
        where: {
          vendor_id: vendorId,
          is_deleted: false,
          status_id: clientApprovalStatus.id,
          activity_status: { in: ["onGoing", "lostApproval"] }, // ✅ allow both
        },
        include: this.defaultIncludes(),
        orderBy: { created_at: Prisma.SortOrder.desc },
      });
    }

    // ============= Non-Admin Flow =============
    // Leads via LeadUserMapping
    const mappedLeads = await prisma.leadUserMapping.findMany({
      where: { vendor_id: vendorId, user_id: userId, status: "active" },
      select: { lead_id: true },
    });

    // Leads via UserLeadTask
    const taskLeads = await prisma.userLeadTask.findMany({
      where: {
        vendor_id: vendorId,
        OR: [{ created_by: userId }, { user_id: userId }],
      },
      select: { lead_id: true },
    });

    // ✅ Union
    const leadIds = [
      ...new Set([
        ...mappedLeads.map((m) => m.lead_id),
        ...taskLeads.map((t) => t.lead_id),
      ]),
    ];
    if (!leadIds.length) return [];

    return prisma.leadMaster.findMany({
      where: {
        id: { in: leadIds },
        vendor_id: vendorId,
        is_deleted: false,
        status_id: clientApprovalStatus.id,
        activity_status: { in: ["onGoing", "lostApproval"] }, // ✅ allow both
      },
      include: this.defaultIncludes(),
      orderBy: { created_at: Prisma.SortOrder.desc },
    });
  }

  public async getClientApprovalDetails(vendorId: number, leadId: number) {
    // Step 1️⃣. Fetch DocType for approval screenshots
    const approvalDocType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 13" }, // Client Approval Documents
      select: { id: true },
    });

    // Step 2️⃣. Fetch Payment Info (to exclude its file from screenshots)
    const paymentInfo = await prisma.paymentInfo.findFirst({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        paymentType: { tag: "Type 3" },
      },
      orderBy: { created_at: "desc" },
    });

    // Step 3️⃣. Screenshots (exclude payment_file_id if exists)
    let screenshots: any[] = [];
    if (approvalDocType) {
      const docs = await prisma.leadDocuments.findMany({
        where: {
          vendor_id: vendorId,
          lead_id: leadId,
          doc_type_id: approvalDocType.id,
          is_deleted: false,
          NOT: paymentInfo?.payment_file_id
            ? { id: paymentInfo.payment_file_id }
            : undefined, // exclude payment proof file
        },
        orderBy: { created_at: "desc" },
      });

      // ✅ Add signed URLs
      screenshots = await Promise.all(
        docs.map(async (doc) => {
          const signedUrl = doc.doc_sys_name
            ? await generateSignedUrl(doc.doc_sys_name, 3600, "inline")
            : null;
          return { ...doc, signedUrl };
        })
      );
    }

    // Step 4️⃣. Fetch Payment File separately
    let paymentFile: any = null;
    if (paymentInfo?.payment_file_id) {
      const file = await prisma.leadDocuments.findUnique({
        where: { id: paymentInfo.payment_file_id },
      });

      if (file) {
        const signedUrl = file.doc_sys_name
          ? await generateSignedUrl(file.doc_sys_name, 3600, "inline")
          : null;
        paymentFile = { ...file, signedUrl };
      }
    }

    // Step 5️⃣. LeadUserMapping with User details (only user_type_id = 5)
    const leadUserMapping = await prisma.leadUserMapping.findFirst({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        status: "active",
        user: { user_type_id: 5 },
      },
      include: {
        user: { select: { id: true, user_name: true } },
      },
      orderBy: { created_at: "desc" },
    });

    // Step 6️⃣. LeadMaster basic details
    const leadMaster = await prisma.leadMaster.findUnique({
      where: { id: leadId, vendor_id: vendorId },
      select: {
        id: true,
        firstname: true,
        lastname: true,
        total_project_amount: true,
        advance_payment_date: true,
      },
    });

    // Merge first + last name for response
    const lead = leadMaster
      ? {
          id: leadMaster.id,
          name: `${leadMaster.firstname ?? ""} ${
            leadMaster.lastname ?? ""
          }`.trim(),
          total_project_amount: leadMaster.total_project_amount,
          advance_payment_date: leadMaster.advance_payment_date,
        }
      : null;

    return {
      lead,
      screenshots,
      paymentInfo,
      paymentFile,
      leadUserMapping,
    };
  }

  // ✅ Common include
  private defaultIncludes() {
    return {
      siteType: true,
      source: true,
      statusType: true,
      createdBy: { select: { id: true, user_name: true } },
      updatedBy: true,
      assignedTo: { select: { id: true, user_name: true } },
      assignedBy: { select: { id: true, user_name: true } },
      productMappings: {
        select: {
          productType: { select: { id: true, type: true, tag: true } },
        },
      },
      leadProductStructureMapping: {
        select: { productStructure: { select: { id: true, type: true } } },
      },
      // documents: {
      //   where: { is_deleted: false },
      //   include: {
      //     documentType: { select: { id: true, type: true, tag: true } },
      //     createdBy: { select: { id: true, user_name: true } },
      //   },
      // },
      tasks: {
        where: { task_type: "Follow Up" },
        select: {
          id: true,
          task_type: true,
          due_date: true,
          remark: true,
          status: true,
          created_at: true,
        },
        orderBy: { created_at: Prisma.SortOrder.desc }, // ✅ fixed typing
      },
    };
  }

  public async requestToTechCheck(data: {
    lead_id: number;
    vendor_id: number;
    account_id: number;
    assign_to_user_id: number;
    created_by: number;
  }) {
    const response: any = {};

    // Step 1. Get Tech Check Status (Type 8)
    const techCheckStatus = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id: data.vendor_id, tag: "Type 8" },
      select: { id: true },
    });

    if (!techCheckStatus) {
      throw new Error(
        `Tech Check Status (Type 8) not found for vendor ${data.vendor_id}`
      );
    }

    // Step 2. Update lead status
    const updatedLead = await prisma.leadMaster.update({
      where: { id: data.lead_id },
      data: {
        status_id: techCheckStatus.id,
        tech_check_reached_at: new Date(),
        updated_by: data.created_by,
        updated_at: new Date(),
      },
    });

    await ensureLeadStatusLog(prisma, {
      vendorId: data.vendor_id,
      leadId: data.lead_id,
      accountId: data.account_id,
      statusId: techCheckStatus.id,
      createdBy: data.created_by,
    });

    // Step 3. Create LeadUserMapping (assign to backend user)
    const leadUserMapping = await prisma.leadUserMapping.create({
      data: {
        account_id: data.account_id,
        lead_id: data.lead_id,
        vendor_id: data.vendor_id,
        user_id: data.assign_to_user_id,
        type: "tech-check",
        status: "active",
        created_by: data.created_by,
      },
    });

    // ✅ Ensure assigned tech-check user is in lead chat members
    let chatRoom = await prisma.leadChatRoom.findFirst({
      where: {
        lead_id: data.lead_id,
        vendor_id: data.vendor_id,
      },
      select: { id: true },
    });

    if (!chatRoom) {
      chatRoom = await prisma.leadChatRoom.create({
        data: {
          lead_id: data.lead_id,
          vendor_id: data.vendor_id,
        },
        select: { id: true },
      });
    }

    const existingMember = await prisma.leadChatMember.findFirst({
      where: {
        chat_room_id: chatRoom.id,
        user_id: data.assign_to_user_id,
      },
      select: { id: true },
    });

    if (existingMember) {
      logger.info("[SERVICE] LeadChatMember already exists, skipping insert", {
        lead_id: data.lead_id,
        chat_room_id: chatRoom.id,
        user_id: data.assign_to_user_id,
      });
    } else {
      await prisma.leadChatMember.create({
        data: {
          chat_room_id: chatRoom.id,
          user_id: data.assign_to_user_id,
          added_by: data.created_by,
        },
      });
    }

    // Step 4. Log the action
    await createLeadLog(prisma, {
      vendor_id: data.vendor_id,
      lead_id: data.lead_id,
      account_id: data.account_id,
      action: `Client approval received, lead is requested for Tech-Check.`,
      action_type: "UPDATE",
      created_by: data.created_by,
    });

    response.lead = updatedLead;
    response.leadUserMapping = leadUserMapping;

    return response;
  }

  public async getTechCheckUsersByVendor(
    vendorId: number
  ): Promise<BackendData[]> {
    try {
      console.log(
        `[SERVICE] Fetching Tech-Check Users for vendor ID: ${vendorId}`
      );

      const vendor = await prisma.vendorMaster.findUnique({
        where: { id: vendorId },
        select: { is_this_vendor_is_custom_usertype_only: true },
      });

      const useCustomUsersOnly =
        vendor?.is_this_vendor_is_custom_usertype_only === true;

      let techCheckUsers;

      if (useCustomUsersOnly) {
        techCheckUsers = await prisma.userMaster.findMany({
          where: {
            vendor_id: vendorId,
            status: "active",
            user_type: {
              user_type: {
                equals: "custom",
                mode: "insensitive",
              },
            },
            userPrivilegeMappings: {
              some: {
                is_allowed: true,
                privilege: {
                  code: "production.tech_check.tech_check_action.tech_check_workflow_action",
                  is_active: true,
                },
              },
            },
          },
          include: {
            user_type: true,
            documents: true,
          },
          orderBy: {
            created_at: "desc",
          },
        });
      } else {
        // 1. Find the user type ID for 'tech-check'
        const techCheckUserType = await prisma.userTypeMaster.findFirst({
          where: {
            user_type: {
              equals: "tech-check",
              mode: "insensitive",
            },
          },
        });

        if (!techCheckUserType) {
          console.log("[SERVICE] Tech-Check user type not found");
          return [];
        }

        console.log(
          `[SERVICE] Found Tech-Check user type ID: ${techCheckUserType.id}`
        );

        // 2. Fetch all users with tech-check role for the specified vendor
        techCheckUsers = await prisma.userMaster.findMany({
          where: {
            vendor_id: vendorId,
            user_type_id: techCheckUserType.id,
            status: "active",
          },
          include: {
            user_type: true,
            documents: true,
          },
          orderBy: {
            created_at: "desc",
          },
        });
      }

      console.log(`[SERVICE] Found ${techCheckUsers.length} Tech-Check Users`);

      // 3. Transform data to match interface
      const transformedData: BackendData[] = techCheckUsers.map((user) => ({
        id: user.id,
        vendor_id: user.vendor_id,
        user_name: user.user_name,
        user_contact: user.user_contact,
        user_email: user.user_email,
        user_timezone: user.user_timezone,
        status: user.status,
        created_at: user.created_at,
        updated_at: user.updated_at,
        user_type: {
          id: user.user_type.id,
          user_type: user.user_type.user_type,
        },
        documents: user.documents.map((doc) => ({
          id: doc.id,
          document_name: doc.document_name,
          document_number: doc.document_number,
          filename: doc.filename,
        })),
      }));

      return transformedData;
    } catch (error: any) {
      console.error("[SERVICE] Error fetching Tech-Check Users:", error);
      throw new Error(`Failed to fetch Tech-Check Users: ${error.message}`);
    }
  }
}
