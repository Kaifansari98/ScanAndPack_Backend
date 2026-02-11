import { prisma } from "../../../prisma/client";
import { sanitizeFilename } from "../../../utils/sanitizeFilename";
import logger from "../../../utils/logger";
import { NotificationType } from "../../../prisma/generated";
import { NotificationService } from "../../../../src/services/notification/notification.service";
import { sendLeadMovedToProductionEmail } from "../../../../src/services/email/brevoEmail.service";
import {
  sendMovedToProductionOrderLoginPendingEmail,
  sendMovedToProductionWithOrderLoginEmail,
  sendMovedToProductionWithoutOrderLoginEmail,
  sendOrderLoginCompletedEmail,
} from "../../../../src/services/email/brevoEmail2.service";

// 🧩 Define this at the top of your service file

interface BackendData {
  id: number;
  vendor_id: number;
  user_name: string;
  user_contact: string | null;
  user_email: string | null;
  user_timezone: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
  user_type: {
    id: number;
    user_type: string;
  };
  documents: {
    id: number;
    document_name: string | null;
    document_number: string | null;
    filename: string | null;
  }[];
}

export async function isOrderLoginComplete(vendorId: number, leadId: number) {
  const REQUIRED_ORDER_LOGIN_TYPES = [
    "Carcass",
    "Shutter",
    "Stock Hardware",
  ] as const;

  const normalize = (value: string) =>
    value.trim().toLowerCase().replace(/\s+/g, "");

  const records = await prisma.orderLoginDetails.findMany({
    where: {
      vendor_id: vendorId,
      lead_id: leadId,
      is_completed: false,
    },
    select: {
      item_type: true,
      company_vendor_id: true,
      item_desc: true,
    },
  });

  logger.info("OrderLogin Records Found", {
    leadId,
    count: records.length,
  });

  for (const requiredType of REQUIRED_ORDER_LOGIN_TYPES) {
    const item = records.find(
      (r) => normalize(r.item_type) === normalize(requiredType),
    );

    // ❌ Missing mandatory item
    if (!item) {
      logger.info(`Missing OrderLogin Item: ${requiredType}`);
      return false;
    }

    // ❌ Vendor not selected
    if (!item.company_vendor_id) {
      logger.info(`Vendor missing for: ${requiredType}`);
      return false;
    }

    // ❌ Remark not filled
    if (!item.item_desc || item.item_desc.trim() === "") {
      logger.info(`Remark missing for: ${requiredType}`);
      return false;
    }
  }

  // ✅ All validations passed
  return true;
}

export async function isOrderLoginComplete2(vendorId: number, leadId: number) {
  const REQUIRED_ITEMS = ["Carcass", "Shutter", "Stock Hardware"];

  const normalize = (v: string) => v.trim().toLowerCase().replace(/\s+/g, "");

  const records = await prisma.orderLoginDetails.findMany({
    where: {
      vendor_id: vendorId,
      lead_id: leadId,
    },
    select: {
      item_type: true,
      company_vendor_id: true,
      item_desc: true,
    },
  });

  for (const required of REQUIRED_ITEMS) {
    const item = records.find(
      (r) => normalize(r.item_type) === normalize(required),
    );

    if (!item) return false;
    if (!item.company_vendor_id) return false;
    if (!item.item_desc || item.item_desc.trim() === "") return false;
  }

  return true;
}

async function closeOrderLoginTask(
  vendorId: number,
  leadId: number,
  closedByUserId: number,
) {
  const updated = await prisma.userLeadTask.updateMany({
    where: {
      vendor_id: vendorId,
      lead_id: leadId,
      task_type: "Order Login",
      status: "open",
    },
    data: {
      status: "closed",
      closed_by: closedByUserId,
      closed_at: new Date(),
      updated_by: closedByUserId,
    },
  });

  return updated.count;
}

export async function triggerOrderLoginCompletionNotification(
  vendorId: number,
  leadId: number,
  accountId: number,
) {
  // 1️⃣ Check order login completed AFTER SAVE
  const completed = await isOrderLoginComplete2(vendorId, leadId);

  if (!completed) {
    logger.info("Mandatory 3 not completed yet");
    return;
  }

  // 2️⃣ Check Production Stage
  const productionStage = await prisma.statusTypeMaster.findFirst({
    where: {
      vendor_id: vendorId,
      tag: "Type 10", // verify in DB
    },
    select: { id: true },
  });

  if (!productionStage) return;

  const lead = await prisma.leadMaster.findUnique({
    where: { id: leadId },
    select: {
      status_id: true,
      firstname: true,
      lastname: true,
      lead_code: true,
    },
  });

  if (!lead) return;

  if (lead.status_id !== productionStage.id) {
    logger.info("Lead not in production stage");
    return;
  }

  // ✅ Auto close Order Login Task
  await closeOrderLoginTask(vendorId, leadId, accountId);

  // 3️⃣ Duplicate protection
  const alreadySent = await prisma.notification.findFirst({
    where: {
      vendor_id: vendorId,
      entity_type: "lead",
      entity_id: leadId,
      type: NotificationType.LEAD_ACTION,
      title: "Order Login Completed",
    },
  });

  if (alreadySent) {
    logger.info("Notification already sent");
    return;
  }

  // 4️⃣ Factory user fetch
  const mapping = await prisma.leadUserMapping.findFirst({
    where: {
      vendor_id: vendorId,
      lead_id: leadId,
      status: "active",
      user: {
        user_type: {
          user_type: {
            equals: "factory",
            mode: "insensitive",
          },
        },
      },
    },
    select: {
      user: {
        select: {
          id: true,
          user_name: true,
          user_email: true,
        },
      },
    },
  });

  if (!mapping?.user) return;

  const factoryUser = mapping.user;

  const leadCode = lead.lead_code ?? `LEAD-${String(leadId).padStart(4, "0")}`;

  const leadName = `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim();

  // 5️⃣ In-App
  await NotificationService.createAndSend({
    vendor_id: vendorId,
    user_id: factoryUser.id,
    sender_id: accountId,
    type: NotificationType.LEAD_ACTION,
    title: "Order Login Completed",
    message: `${leadCode} - ${leadName} Order Login completed`,
    entity_type: "lead",
    entity_id: leadId,
    redirect_url: `/dashboard/leads/details/${leadId}`,
  });

  // 6️⃣ Email
  if (factoryUser.user_email) {
    await sendOrderLoginCompletedEmail({
      vendor_id: vendorId,
      toEmail: factoryUser.user_email,
      toName: factoryUser.user_name,
      leadCode,
      leadName,
      updatedBy: "System",
      updatedAt: new Date().toLocaleString("en-IN"),
      projectUrl: `${process.env.CLIENT_BASE_URL}/dashboard/leads/details/${leadId}`,
    });
  }

  logger.info("ORDER LOGIN NOTIFICATION SENT");
}

export class OrderLoginService {
  private readonly REQUIRED_ORDER_LOGIN_TYPES = [
    "Carcass",
    "Shutter",
    "Stock Hardware",
  ] as const;

  private async getMissingRequiredOrderLoginTypes(
    vendorId: number,
    leadId: number,
    instanceId?: number | null,
  ) {
    const existing = await prisma.orderLoginDetails.findMany({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        ...(typeof instanceId !== "undefined"
          ? { instance_id: instanceId ?? null }
          : {}),
        is_completed: false,
      },
      select: { item_type: true },
    });

    const presentSet = new Set(existing.map((e) => e.item_type));
    return this.REQUIRED_ORDER_LOGIN_TYPES.filter((t) => !presentSet.has(t));
  }

  private async getOrderLoginPoDocType(
    vendorId: number,
    createIfMissing: boolean = true,
  ) {
    let docType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 18" },
    });

    if (!docType && createIfMissing) {
      docType = await prisma.documentTypeMaster.create({
        data: {
          vendor_id: vendorId,
          tag: "Type 18",
          type: "Order Login PO Files",
        },
      });
    }

    return docType;
  }

  async uploadFileBreakups(vendorId: number, payload: any) {
    const {
      lead_id,
      account_id,
      instance_id,
      item_type,
      item_desc,
      company_vendor_id,
      created_by,
    } = payload;

    // 🧾 Validation
    const missing: string[] = [];
    if (!vendorId) missing.push("vendor_id");
    if (!lead_id) missing.push("lead_id");
    if (!account_id) missing.push("account_id");
    if (!item_type) missing.push("item_type");
    if (!item_desc) missing.push("item_desc");
    if (!created_by) missing.push("created_by");

    if (missing.length > 0) {
      const error = new Error(
        `Missing required field(s): ${missing.join(", ")}`,
      );
      (error as any).statusCode = 400;
      throw error;
    }

    // 🔍 Check uniqueness (item_type per lead)
    const existing = await prisma.orderLoginDetails.findFirst({
      where: {
        vendor_id: vendorId,
        lead_id: Number(lead_id),
        instance_id: instance_id ? Number(instance_id) : null,
        item_type: item_type,
        is_completed: false,
      },
    });

    if (existing) {
      const error = new Error("Item type already exists for this lead.");
      (error as any).statusCode = 409;
      throw error;
    }

    // ✅ Create record
    const newOrderLogin = await prisma.orderLoginDetails.create({
      data: {
        vendor_id: vendorId,
        lead_id: Number(lead_id),
        account_id: Number(account_id),
        instance_id: instance_id ? Number(instance_id) : null,
        item_type,
        item_desc,
        company_vendor_id: company_vendor_id ? Number(company_vendor_id) : null,
        created_by: Number(created_by),
      },
      include: {
        companyVendor: {
          select: { id: true, company_name: true },
        },
        lead: {
          select: { lead_code: true, firstname: true, lastname: true },
        },
      },
    });

    return newOrderLogin;
  }

  async uploadMultipleFileBreakupsByLead(
    vendorId: number,
    leadId: number,
    accountId: number,
    breakups: any[],
  ) {
    if (!vendorId || !leadId)
      throw Object.assign(new Error("vendorId and leadId are required"), {
        statusCode: 400,
      });

    if (!Array.isArray(breakups) || breakups.length === 0)
      throw Object.assign(new Error("breakups array is required"), {
        statusCode: 400,
      });

    // ===============================
    // CORE DB OPERATION LAYER
    // ===============================

    const results: any[] = [];
    const errors: any[] = [];

    for (const [index, payload] of breakups.entries()) {
      try {
        const { item_type, item_desc, company_vendor_id, created_by } = payload;
        const instance_id = payload.instance_id;

        // validation
        const missing = [];
        if (!item_type) missing.push("item_type");
        if (!item_desc) missing.push("item_desc");
        if (!created_by) missing.push("created_by");
        if (missing.length)
          throw new Error(
            `Missing field(s) in record #${index + 1}: ${missing.join(", ")}`,
          );

        // duplicate check
        const existing = await prisma.orderLoginDetails.findFirst({
          where: {
            vendor_id: vendorId,
            lead_id: leadId,
            instance_id: instance_id ? Number(instance_id) : null,
            item_type,
            is_completed: false,
          },
        });

        if (existing) {
          throw new Error(`Item ${item_type} already exists`);
        }

        const record = await prisma.orderLoginDetails.create({
          data: {
            vendor_id: vendorId,
            lead_id: leadId,
            account_id: accountId,
            instance_id: instance_id ? Number(instance_id) : null,
            item_type,
            item_desc,
            company_vendor_id: company_vendor_id
              ? Number(company_vendor_id)
              : null,
            created_by: Number(created_by),
          },
        });

        results.push(record);
      } catch (err: any) {
        errors.push({ index, message: err.message });
      }
    }

    // ❌ Notification trigger REMOVED
    // await triggerOrderLoginCompletionNotification(vendorId, leadId, accountId);

    return { results, errors };
  }

  async getOrderLoginByLead(
    vendorId: number,
    leadId: number,
    senderUserId: number,
    instanceId?: number | null,
  ) {
    if (!vendorId || !leadId) {
      const error = new Error("vendor_id and lead_id are required");
      (error as any).statusCode = 400;
      throw error;
    }

    // 1️⃣ Fetch order login list
    const orderLogins = await prisma.orderLoginDetails.findMany({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        ...(typeof instanceId !== "undefined"
          ? { instance_id: instanceId ?? null }
          : {}),
      },
      orderBy: {
        created_at: "asc",
      },
      include: {
        companyVendor: {
          select: {
            id: true,
            company_name: true,
            contact_no: true,
          },
        },
      },
    });

    // 2️⃣ Trigger notification SAFELY
    await triggerOrderLoginCompletionNotification(
      vendorId,
      leadId,
      senderUserId,
    );

    return {
      list: orderLogins,
      hasData: orderLogins.length > 0,
    };
  }

  async updateOrderLogin(vendorId: number, orderLoginId: number, payload: any) {
    const { lead_id, item_type, item_desc, company_vendor_id, updated_by } =
      payload;

    // 🧾 Validation
    const missingFields: string[] = [];
    if (!vendorId) missingFields.push("vendor_id");
    if (!orderLoginId) missingFields.push("order_login_id");
    if (!lead_id) missingFields.push("lead_id");
    if (!item_type) missingFields.push("item_type");
    if (!item_desc) missingFields.push("item_desc");
    if (!updated_by) missingFields.push("updated_by");

    if (missingFields.length > 0) {
      const error = new Error(
        `Missing required field(s): ${missingFields.join(", ")}`,
      );
      (error as any).statusCode = 400;
      throw error;
    }

    // ✅ Check if record exists
    const existing = await prisma.orderLoginDetails.findFirst({
      where: {
        id: orderLoginId,
        vendor_id: vendorId,
      },
    });

    if (!existing) {
      const error = new Error("Order login record not found.");
      (error as any).statusCode = 404;
      throw error;
    }

    // 🚫 Duplicate validation: item_type unique per lead_id
    const duplicate = await prisma.orderLoginDetails.findFirst({
      where: {
        vendor_id: vendorId,
        lead_id: Number(lead_id),
        item_type: item_type,
        NOT: { id: orderLoginId },
      },
    });

    if (duplicate) {
      const error = new Error(
        `Item type '${item_type}' already exists for this lead.`,
      );
      (error as any).statusCode = 409;
      throw error;
    }

    // ✅ Update record
    const updated = await prisma.orderLoginDetails.update({
      where: { id: orderLoginId },
      data: {
        item_type,
        item_desc,
        company_vendor_id: company_vendor_id ? Number(company_vendor_id) : null,
        updated_by: Number(updated_by),
      },
    });

    return updated;
  }

  async updateMultipleOrderLogins(
    vendorId: number,
    leadId: number,
    updates: any[],
  ) {
    if (!vendorId || !leadId)
      throw Object.assign(new Error("vendorId and leadId are required"), {
        statusCode: 400,
      });

    if (!Array.isArray(updates) || updates.length === 0)
      throw Object.assign(new Error("updates array is required"), {
        statusCode: 400,
      });

    const results = [];
    const errors = [];

    for (const [index, payload] of updates.entries()) {
      try {
        const { id, item_type, item_desc, company_vendor_id, updated_by } =
          payload;
        const instance_id = payload.instance_id;

        const missing = [];
        if (!id) missing.push("id");
        if (!item_type) missing.push("item_type");
        if (!item_desc) missing.push("item_desc");
        if (!updated_by) missing.push("updated_by");
        if (missing.length)
          throw new Error(
            `Missing field(s) in record #${index + 1}: ${missing.join(", ")}`,
          );

        // Check if record exists
        const existing = await prisma.orderLoginDetails.findFirst({
          where: { id: Number(id), vendor_id: vendorId },
        });

        if (!existing)
          throw new Error(
            `Order login record #${id} not found for vendor ${vendorId}`,
          );

        // Duplicate check (unique item_type per lead)
        const duplicate = await prisma.orderLoginDetails.findFirst({
          where: {
            vendor_id: vendorId,
            lead_id: leadId,
            instance_id: instance_id ? Number(instance_id) : null,
            item_type,
            NOT: { id: Number(id) },
          },
        });

        if (duplicate)
          throw new Error(
            `Item type '${item_type}' already exists for this lead. (record #${id})`,
          );

        // Update
        const updated = await prisma.orderLoginDetails.update({
          where: { id: Number(id) },
          data: {
            item_type,
            item_desc,
            company_vendor_id: company_vendor_id
              ? Number(company_vendor_id)
              : null,
            updated_by: Number(updated_by),
          },
        });

        results.push(updated);
      } catch (err: any) {
        errors.push({ index, message: err.message });
      }
    }

    return { results, errors };
  }

  async deleteOrderLogin(vendorId: number, orderLoginId: number) {
    if (!vendorId || !orderLoginId) {
      const error = new Error("vendorId and orderLoginId are required");
      (error as any).statusCode = 400;
      throw error;
    }

    const existing = await prisma.orderLoginDetails.findFirst({
      where: { id: orderLoginId, vendor_id: vendorId },
    });

    if (!existing) {
      const error = new Error("Order login record not found.");
      (error as any).statusCode = 404;
      throw error;
    }

    return prisma.orderLoginDetails.delete({
      where: { id: orderLoginId },
    });
  }

  async getLeadsWithStatusOrderLogin(
    vendorId: number,
    userId: number,
    limit = 10,
    page = 1,
  ) {
    const skip = (page - 1) * limit;

    // 🔹 Fetch Order Login Status (Type 9)
    const orderLoginStatus = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 9" },
      select: { id: true },
    });

    if (!orderLoginStatus) {
      throw new Error(
        `Order Login status (Type 9) not found for vendor ${vendorId}`,
      );
    }

    // 🔹 Identify user role
    const creator = await prisma.userMaster.findUnique({
      where: { id: userId },
      include: { user_type: true },
    });

    const isAdmin =
      creator?.user_type?.user_type?.toLowerCase() === "admin" ||
      creator?.user_type?.user_type?.toLowerCase() === "super-admin";

    const baseWhere: any = {
      vendor_id: vendorId,
      is_deleted: false,
      status_id: orderLoginStatus.id,
      activity_status: { in: ["onGoing", "lostApproval"] },
    };

    // 🔹 If Admin → Return all leads
    if (isAdmin) {
      const [total, leads] = await Promise.all([
        prisma.leadMaster.count({ where: baseWhere }),
        prisma.leadMaster.findMany({
          where: baseWhere,
          include: this.defaultIncludes(),
          orderBy: { created_at: "desc" },
          skip,
          take: limit,
        }),
      ]);
      return { total, leads };
    }

    // 🔹 Non-admin: Fetch mapped & task-based leads
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
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      }),
    ]);

    return { total, leads };
  }

  // ✅ Default includes (same as techCheck)
  private defaultIncludes() {
    return {
      account: true,
      siteType: true,
      source: true,
      statusType: true,
      assignedTo: { select: { id: true, user_name: true } },
      leadProductStructureMapping: {
        include: { productStructure: true },
      },
      productMappings: {
        include: { productType: true },
      },
    };
  }

  async uploadProductionFiles(
    vendorId: number,
    leadId: number,
    accountId: number | null,
    userId: number,
    files: { originalName: string; sysName: string }[],
    instanceId?: number | null,
  ) {
    if (!vendorId || !leadId || !userId) {
      const error = new Error("vendorId, leadId, and userId are required");
      (error as any).statusCode = 400;
      throw error;
    }

    if (!files || files.length === 0) {
      const error = new Error("No files provided for upload");
      (error as any).statusCode = 400;
      throw error;
    }

    const uploadedDocs = [];

    // ✅ Step 1: Upload Client Approval Screenshots
    const ProductionDocType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 14" },
    });
    if (!ProductionDocType) throw new Error("Doc Type (Type 14) not found");

    for (const file of files) {
      // ✅ Store record in DB
      const savedDoc = await prisma.leadDocuments.create({
        data: {
          doc_og_name: file.originalName,
          doc_sys_name: file.sysName,
          created_by: userId,
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId || null,
          doc_type_id: ProductionDocType.id, // ✅ Type 14 = Production Files
          product_structure_instance_id:
            typeof instanceId !== "undefined" ? instanceId : null,
        },
      });

      uploadedDocs.push(savedDoc);
    }

    return uploadedDocs;
  }

  async uploadOrderLoginPoFiles(
    vendorId: number,
    leadId: number,
    accountId: number,
    userId: number,
    files: { originalName: string; sysName: string }[],
    instanceId?: number | null,
  ) {
    if (!vendorId || !leadId || !accountId || !userId) {
      const error = new Error(
        "vendorId, leadId, accountId, and userId are required",
      );
      (error as any).statusCode = 400;
      throw error;
    }

    if (!files || files.length === 0) {
      const error = new Error("No files provided for upload");
      (error as any).statusCode = 400;
      throw error;
    }

    const docType = await this.getOrderLoginPoDocType(vendorId);
    if (!docType) throw new Error("Doc Type (Type 18) not found");

    const uploadedDocs = [];

    for (const file of files) {
      const savedDoc = await prisma.leadDocuments.create({
        data: {
          doc_og_name: file.originalName,
          doc_sys_name: file.sysName,
          created_by: userId,
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          doc_type_id: docType.id,
          product_structure_instance_id:
            typeof instanceId !== "undefined" ? instanceId : null,
        },
      });

      uploadedDocs.push(savedDoc);
    }

    return uploadedDocs;
  }

  async getOrderLoginPoFiles(
    vendorId: number,
    leadId: number,
    orderLoginId: number,
  ) {
    if (!vendorId || !leadId || !orderLoginId) {
      const error = new Error(
        "vendorId, leadId, and orderLoginId are required",
      );
      (error as any).statusCode = 400;
      throw error;
    }

    const orderLogin = await prisma.orderLoginDetails.findFirst({
      where: { id: orderLoginId, vendor_id: vendorId, lead_id: leadId },
    });

    if (!orderLogin) {
      const error = new Error("Order login record not found.");
      (error as any).statusCode = 404;
      throw error;
    }

    const docType = await this.getOrderLoginPoDocType(vendorId, false);
    if (!docType) {
      return [];
    }

    const safeCardName = sanitizeFilename(orderLogin.item_type || "card");
    const instanceIdValue = orderLogin.instance_id ?? null;
    let instanceFolder: string | undefined;

    if (instanceIdValue) {
      const instance = await prisma.leadProductStructureInstance.findFirst({
        where: {
          id: Number(instanceIdValue),
          vendor_id: vendorId,
          lead_id: leadId,
        },
        select: { title: true },
      });

      if (instance) {
        instanceFolder =
          instance.title?.trim() || `instance-${instanceIdValue}`;
      }
    }

    const prefix = instanceFolder
      ? `order_login_po/${vendorId}/${leadId}/${sanitizeFilename(
          instanceFolder,
        )}/${safeCardName}/`
      : `order_login_po/${vendorId}/${leadId}/${safeCardName}/`;

    return prisma.leadDocuments.findMany({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        doc_type_id: docType.id,
        is_deleted: false,
        ...(instanceIdValue
          ? { product_structure_instance_id: instanceIdValue }
          : {}),
        doc_sys_name: { startsWith: prefix },
      },
      orderBy: { created_at: "asc" },
      select: {
        id: true,
        doc_og_name: true,
        doc_sys_name: true,
        created_at: true,
      },
    });
  }

  async getLeadProductionReadiness(
    vendorId: number,
    leadId: number,
    instanceId?: number | null,
  ) {
    if (!vendorId || !leadId) {
      const error = new Error("vendorId and leadId are required");
      (error as any).statusCode = 400;
      throw error;
    }

    // --- Check required OrderLoginDetails (three items) ---
    const missing = await this.getMissingRequiredOrderLoginTypes(
      vendorId,
      leadId,
      instanceId,
    );

    const carcass = !missing.includes("Carcass");
    const shutter = !missing.includes("Shutter");
    const stockHardware = !missing.includes("Stock Hardware");

    // --- Check if at least 1 Production File (Type 14) exists ---
    const docType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 14" },
      select: { id: true },
    });

    let productionFilesCount = 0;

    if (docType?.id) {
      productionFilesCount = await prisma.leadDocuments.count({
        where: {
          vendor_id: vendorId,
          lead_id: leadId,
          doc_type_id: docType.id,
          is_deleted: false,
          ...(typeof instanceId !== "undefined"
            ? { product_structure_instance_id: instanceId ?? null }
            : {}),
        },
      });
    }

    const hasAnyProductionFiles = productionFilesCount > 0;

    // You asked for “true/false” overall; returning detailed + overall flags
    return {
      orderLogin: {
        carcass,
        shutter,
        stockHardware,
        allThree: carcass && shutter && stockHardware,
        missing,
      },
      productionFiles: {
        hasAny: hasAnyProductionFiles,
        count: productionFilesCount,
        docTypeFound: Boolean(docType?.id), // helpful for diagnosing vendor setup
      },
      readyForProduction: hasAnyProductionFiles,
    };
  }

  async getFactoryUsersByVendor(vendorId: number): Promise<BackendData[]> {
    try {
      console.log(
        `[SERVICE] Fetching Factory Users for vendor ID: ${vendorId}`,
      );

      // 1. Find the user type ID for 'factory'
      const factoryUserType = await prisma.userTypeMaster.findFirst({
        where: {
          user_type: {
            equals: "factory",
            mode: "insensitive",
          },
        },
      });

      if (!factoryUserType) {
        console.log("[SERVICE] Factory user type not found");
        return [];
      }

      console.log(
        `[SERVICE] Found Factory user type ID: ${factoryUserType.id}`,
      );

      // 2. Fetch all users with factory role for the specified vendor
      const factoryUsers = await prisma.userMaster.findMany({
        where: {
          vendor_id: vendorId,
          user_type_id: factoryUserType.id,
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

      console.log(`[SERVICE] Found ${factoryUsers.length} Factory Users`);

      // 3. Transform data
      const transformedData: BackendData[] = factoryUsers.map((user) => ({
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
      console.error("[SERVICE] Error fetching Factory Users:", error);
      throw new Error(`Failed to fetch Factory Users: ${error.message}`);
    }
  }

  async updateLeadToProductionStage({
    vendorId,
    leadId,
    accountId,
    userId,
    assignToUserId,
    requiredDate,
    instanceId,
  }: {
    vendorId: number;
    leadId: number;
    accountId: number;
    userId: number;
    assignToUserId: number;
    requiredDate: Date;
    instanceId?: number | null;
  }) {
    if (instanceId) {
      return await prisma.$transaction(async (tx) => {
        const instance = await tx.leadProductStructureInstance.findFirst({
          where: {
            id: instanceId,
            lead_id: leadId,
            vendor_id: vendorId,
            account_id: accountId || undefined,
          },
          select: { id: true, title: true, account_id: true },
        });

        if (!instance) {
          throw new Error("Product structure instance not found for this lead");
        }

        const effectiveAccountId = accountId || instance.account_id;

        const updatedInstance = await tx.leadProductStructureInstance.update({
          where: { id: instanceId },
          data: {
            is_order_login_completed: true,
            order_login_completed_at: new Date(),
            updated_by: userId,
            updated_at: new Date(),
          },
        });

        await tx.leadDetailedLogs.create({
          data: {
            vendor_id: vendorId,
            lead_id: leadId,
            account_id: effectiveAccountId,
            action: `Order Login completed for instance ${instance.title}`,
            action_type: "UPDATE",
            created_by: userId,
          },
        });

        const pendingInstances = await tx.leadProductStructureInstance.count({
          where: {
            lead_id: leadId,
            vendor_id: vendorId,
            OR: [
              { is_order_login_completed: false },
              { is_order_login_completed: null },
            ],
          },
        });

        if (pendingInstances === 0) {
          if (!assignToUserId || !effectiveAccountId) {
            throw new Error(
              "assign_to_user_id and account_id are required to move lead to Production",
            );
          }

          const statusType = await tx.statusTypeMaster.findFirst({
            where: { vendor_id: vendorId, tag: "Type 10" },
          });

          if (!statusType) {
            const error = new Error(
              "Production Stage (Type 10) not configured for this vendor.",
            );
            (error as any).statusCode = 404;
            throw error;
          }

          const updatedLead = await tx.leadMaster.update({
            where: { id: leadId },
            data: {
              status_id: statusType.id,
              client_required_order_login_complition_date: requiredDate,
              updated_by: userId,
              updated_at: new Date(),
            },
            include: {
              statusType: true,
            },
          });

          const missingTypes = await this.getMissingRequiredOrderLoginTypes(
            vendorId,
            leadId,
          );

          if (missingTypes.length > 0) {
            const backendMapping = await tx.leadUserMapping.findFirst({
              where: {
                vendor_id: vendorId,
                lead_id: leadId,
                status: "active",
                user: {
                  user_type: {
                    user_type: { equals: "backend", mode: "insensitive" },
                  },
                },
              },
              select: {
                user_id: true,
              },
            });

            if (backendMapping?.user_id) {
              const existingTask = await tx.userLeadTask.findFirst({
                where: {
                  vendor_id: vendorId,
                  lead_id: leadId,
                  user_id: backendMapping.user_id,
                  task_type: "Order Login",
                  status: "open",
                },
                select: { id: true },
              });

              if (!existingTask) {
                await tx.userLeadTask.create({
                  data: {
                    lead_id: leadId,
                    account_id: effectiveAccountId,
                    vendor_id: vendorId,
                    user_id: backendMapping.user_id,
                    task_type: "Order Login",
                    lead_stage: "order-login-stage",
                    due_date: new Date(Date.now() + 24 * 60 * 60 * 1000),
                    remark: `Missing order login items: ${missingTypes.join(", ")}`,
                    status: "open",
                    created_by: userId,
                  },
                });
              }
            }
          }

          const leadUserMapping = await tx.leadUserMapping.create({
            data: {
              account_id: effectiveAccountId,
              lead_id: leadId,
              vendor_id: vendorId,
              user_id: assignToUserId,
              type: "production-stage",
              status: "active",
              created_by: userId,
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

          await tx.leadStatusLogs.create({
            data: {
              lead_id: leadId,
              account_id: effectiveAccountId,
              vendor_id: vendorId,
              status_id: statusType.id,
              created_by: userId,
            },
          });

          await tx.leadDetailedLogs.create({
            data: {
              vendor_id: vendorId,
              lead_id: leadId,
              account_id: effectiveAccountId,
              action: `All instances order login completed. Lead moved to Production and assigned to user ID ${assignToUserId}. Required completion date: ${requiredDate.toLocaleDateString()}`,
              action_type: "UPDATE",
              created_by: userId,
            },
          });

          return {
            mode: "instance_and_lead_moved",
            instance_id: updatedInstance.id,
            is_order_login_completed: updatedInstance.is_order_login_completed,
            order_login_completed_at: updatedInstance.order_login_completed_at,
            moved_to_production: true,
            lead: updatedLead,
            leadUserMapping,
          };
        }

        return {
          mode: "instance",
          instance_id: updatedInstance.id,
          is_order_login_completed: updatedInstance.is_order_login_completed,
          order_login_completed_at: updatedInstance.order_login_completed_at,
          moved_to_production: false,
        };
      });
    }

    // ✅ 1. Fetch StatusTypeMaster entry for Production Stage (Type 10)
    const statusType = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 10" },
    });

    if (!statusType) {
      const error = new Error(
        "Production Stage (Type 10) not configured for this vendor.",
      );
      (error as any).statusCode = 404;
      throw error;
    }

    // ✅ 2. Update LeadMaster → move to Production Stage
    const updatedLead = await prisma.leadMaster.update({
      where: { id: leadId },
      data: {
        status_id: statusType.id,
        client_required_order_login_complition_date: requiredDate,
        updated_by: userId,
        updated_at: new Date(),
      },
      include: {
        statusType: true,
      },
    });

    // ✅ If required order-login items are missing, create a backend task
    const missingTypes = await this.getMissingRequiredOrderLoginTypes(
      vendorId,
      leadId,
    );

    if (missingTypes.length > 0) {
      const backendMapping = await prisma.leadUserMapping.findFirst({
        where: {
          vendor_id: vendorId,
          lead_id: leadId,
          status: "active",
          user: {
            user_type: {
              user_type: { equals: "backend", mode: "insensitive" },
            },
          },
        },
        select: {
          user_id: true,
        },
      });

      if (backendMapping?.user_id) {
        const existingTask = await prisma.userLeadTask.findFirst({
          where: {
            vendor_id: vendorId,
            lead_id: leadId,
            user_id: backendMapping.user_id,
            task_type: "Order Login",
            status: "open",
          },
          select: { id: true },
        });

        if (!existingTask) {
          await prisma.userLeadTask.create({
            data: {
              lead_id: leadId,
              account_id: accountId,
              vendor_id: vendorId,
              user_id: backendMapping.user_id,
              task_type: "Order Login",
              lead_stage: "order-login-stage",
              due_date: new Date(Date.now() + 24 * 60 * 60 * 1000),
              remark: `Missing order login items: ${missingTypes.join(", ")}`,
              status: "open",
              created_by: userId,
            },
          });
        }
      }
    }

    // ✅ 3. Assign this lead to the Factory user via LeadUserMapping
    const leadUserMapping = await prisma.leadUserMapping.create({
      data: {
        account_id: accountId,
        lead_id: leadId,
        vendor_id: vendorId,
        user_id: assignToUserId,
        type: "production-stage",
        status: "active",
        created_by: userId,
      },
    });

    // ✅ Ensure assigned production user is in lead chat members
    let chatRoom = await prisma.leadChatRoom.findFirst({
      where: {
        lead_id: leadId,
        vendor_id: vendorId,
      },
      select: { id: true },
    });

    if (!chatRoom) {
      chatRoom = await prisma.leadChatRoom.create({
        data: {
          lead_id: leadId,
          vendor_id: vendorId,
        },
        select: { id: true },
      });
    }

    const existingMember = await prisma.leadChatMember.findFirst({
      where: {
        chat_room_id: chatRoom.id,
        user_id: assignToUserId,
      },
      select: { id: true },
    });

    if (existingMember) {
      logger.info("[SERVICE] LeadChatMember already exists, skipping insert", {
        lead_id: leadId,
        chat_room_id: chatRoom.id,
        user_id: assignToUserId,
      });
    } else {
      await prisma.leadChatMember.create({
        data: {
          chat_room_id: chatRoom.id,
          user_id: assignToUserId,
          added_by: userId,
        },
      });
    }

    // ✅ 4. Log in LeadStatusLogs
    await prisma.leadStatusLogs.create({
      data: {
        lead_id: leadId,
        account_id: accountId,
        vendor_id: vendorId,
        status_id: statusType.id,
        created_by: userId,
      },
    });

    // ✅ 5. Log in LeadDetailedLogs
    await prisma.leadDetailedLogs.create({
      data: {
        vendor_id: vendorId,
        lead_id: leadId,
        account_id: accountId,
        action: `Lead moved to Production Stage and assigned to user ID ${assignToUserId}. Required completion date: ${requiredDate.toLocaleDateString()}`,
        action_type: "UPDATE",
        created_by: userId,
      },
    });

    // ===============================
    // COMMON LEAD META
    // ===============================

    const leadMeta = await prisma.leadMaster.findUnique({
      where: { id: leadId },
      select: {
        firstname: true,
        lastname: true,
        lead_code: true,
        vendor_id: true,
        account_id: true,
      },
    });

    if (!leadMeta) {
      return { lead: updatedLead, leadUserMapping };
    }

    const leadName =
      `${leadMeta.firstname ?? ""} ${leadMeta.lastname ?? ""}`.trim();

    const leadCode =
      leadMeta.lead_code ?? `LEAD-${String(leadId).padStart(4, "0")}`;

    const baseUrl =
      process.env.CLIENT_BASE_URL ||
      process.env.FRONTEND_URL ||
      "http://localhost:3000";

    const projectUrl = leadMeta.account_id
      ? `${baseUrl}/dashboard/leads/details/${leadId}?accountId=${leadMeta.account_id}`
      : `${baseUrl}/dashboard/leads/details/${leadId}`;

    const redirectUrl = leadMeta.account_id
      ? `/dashboard/leads/details/${leadId}?accountId=${leadMeta.account_id}`
      : `/dashboard/leads/details/${leadId}`;

    // ===============================
    // PRODUCTION STAGE → ADMIN NOTIFICATION
    // ===============================

    // ===============================
    // ADMIN NOTIFICATION
    // ===============================

    try {
      const actorId = userId;

      const actor = await prisma.userMaster.findUnique({
        where: { id: actorId },
        select: { user_name: true },
      });

      const updatedAt = new Date().toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      const admins = await prisma.userMaster.findMany({
        where: {
          vendor_id: leadMeta.vendor_id,
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

        // 🔔 In-App
        await NotificationService.createAndSend({
          vendor_id: leadMeta.vendor_id,
          user_id: admin.id,
          sender_id: actorId,
          type: NotificationType.LEAD_MILESTONE,
          title: "Lead Entered Production Stage",
          message: `${leadCode} - ${leadName} moved to Production stage.`,
          entity_type: "lead",
          entity_id: leadId,
          redirect_url: redirectUrl,
        });

        // 📧 Email
        if (!admin.user_email) continue;

        await sendLeadMovedToProductionEmail({
          vendor_id: leadMeta.vendor_id,
          toEmail: admin.user_email,
          toName: admin.user_name,
          leadCode,
          leadName,
          updatedBy: actor?.user_name ?? "System",
          updatedAt,
          projectUrl,
        });
      }
    } catch (err: any) {
      logger.warn("⚠️ Production stage admin notification failed", {
        lead_id: leadId,
        error: err?.message,
      });
    }

    // ===============================
    // FACTORY + BACKEND NOTIFICATIONS
    // ===============================

    // 1️⃣ Check Order Login Completion
    const orderLoginCompleted = await isOrderLoginComplete(vendorId, leadId);

    // ===============================
    // FETCH FACTORY USER (COMMON)
    // ===============================

    const factoryUser = await prisma.userMaster.findUnique({
      where: { id: assignToUserId },
      select: {
        id: true,
        user_name: true,
        user_email: true,
      },
    });

    // ===============================
    // FETCH BACKEND USER (ONLY IF REQUIRED)
    // ===============================

    const backendMapping = await prisma.leadUserMapping.findFirst({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        status: "active",
        user: {
          user_type: {
            user_type: { equals: "backend", mode: "insensitive" },
          },
        },
      },
      select: {
        user: {
          select: {
            id: true,
            user_name: true,
            user_email: true,
          },
        },
      },
    });

    // ===============================
    // CASE A — ORDER LOGIN ❌ INCOMPLETE
    // ===============================

    if (!orderLoginCompleted) {
      // 🔔 FACTORY — IN APP
      if (factoryUser?.id) {
        await NotificationService.createAndSend({
          vendor_id: vendorId,
          user_id: factoryUser.id,
          sender_id: userId,
          type: NotificationType.LEAD_MILESTONE,
          title: "Moved to Production (Order Login Pending)",
          message: `${leadCode} - ${leadName} entered Production. Files available but Order Login is pending.`,
          entity_type: "lead",
          entity_id: leadId,
          redirect_url: redirectUrl,
        });
      }

      // 📧 FACTORY — EMAIL
      if (factoryUser?.user_email) {
        await sendMovedToProductionOrderLoginPendingEmail({
          vendor_id: vendorId,
          toEmail: factoryUser.user_email,
          toName: factoryUser.user_name,
          leadCode,
          leadName,
          projectUrl,
        });
      }

      // 🔔 BACKEND — IN APP
      if (backendMapping?.user?.id) {
        await NotificationService.createAndSend({
          vendor_id: vendorId,
          user_id: backendMapping.user.id,
          sender_id: userId,
          type: NotificationType.LEAD_ACTION,
          title: "Order Login Pending",
          message: `${leadCode} - ${leadName} moved to Production without Order Login completion. Action required.`,
          entity_type: "lead",
          entity_id: leadId,
          redirect_url: redirectUrl,
        });
      }

      // 📧 BACKEND — EMAIL
      if (backendMapping?.user?.user_email) {
        await sendMovedToProductionWithoutOrderLoginEmail({
          vendor_id: vendorId,
          toEmail: backendMapping.user.user_email,
          toName: backendMapping.user.user_name,
          leadCode,
          leadName,
          projectUrl,
        });
      }
    }

    // ===============================
    // CASE B — ORDER LOGIN ✅ COMPLETE
    // ===============================

    if (orderLoginCompleted) {
      // 🔔 FACTORY — OPTIONAL IN APP (Recommended UX)
      if (factoryUser?.id) {
        await NotificationService.createAndSend({
          vendor_id: vendorId,
          user_id: factoryUser.id,
          sender_id: userId,
          type: NotificationType.LEAD_ACTION,
          title: "Moved to Production",
          message: `${leadCode} - ${leadName} has entered Production.`,
          entity_type: "lead",
          entity_id: leadId,
          redirect_url: redirectUrl,
        });
      }

      // 📧 FACTORY — EMAIL (MAIN REQUIREMENT)
      if (factoryUser?.user_email) {
        const actor = await prisma.userMaster.findUnique({
          where: { id: userId },
          select: { user_name: true },
        });

        const updatedAt = new Date().toLocaleString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });

        await sendMovedToProductionWithOrderLoginEmail({
          vendor_id: vendorId,
          toEmail: factoryUser.user_email,
          toName: factoryUser.user_name,
          leadCode,
          leadName,
          updatedBy: actor?.user_name ?? "System",
          updatedAt,
          projectUrl,
        });
      }
    }
    return { lead: updatedLead, leadUserMapping };
  }
}
