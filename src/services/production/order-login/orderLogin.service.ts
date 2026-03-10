import { prisma } from "../../../prisma/client";
import { generateSignedUrl } from "../../../utils/wasabiClient";
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
import { resolveLeadCode } from "../../../../src/utils/fileUtils";

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

export interface UploadOrderLoginPoFileInput {
  vendorId: number;
  leadId: number;
  orderLoginId: number;
  userId: number;
  files: {
    originalName: string;
    sysName: string;
  }[];
  instanceId?: number | null;
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

async function isOrderLoginCompleteForInstance(
  vendorId: number,
  leadId: number,
  instanceId: number,
): Promise<boolean> {
  const REQUIRED_ITEMS = ["Carcass", "Shutter", "Stock Hardware"];
  const normalize = (v: string) => v.trim().toLowerCase().replace(/\s+/g, "");

  const records = await prisma.orderLoginDetails.findMany({
    where: {
      vendor_id: vendorId,
      lead_id: leadId,
      instance_id: instanceId,
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
  userId: number,
  baseUrl: string,
  instanceId?: number | null,
) {
  const debugCtx = { vendorId, leadId, userId, instanceId };

  logger.info(
    "🔔 [PROD-NOTIF] triggerProductionStageNotification called",
    debugCtx,
  );

  // ─────────────────────────────────────────────────────────────
  // 1️⃣ Production Stage Check (instance-aware)
  // ─────────────────────────────────────────────────────────────
  let leadRecord: {
    firstname: string | null;
    lastname: string | null;
    lead_code: string | null;
    account_id: number | null;
  } | null = null;

  const instanceCode = await resolveLeadCode(
    vendorId,
    leadId,
    instanceId ?? undefined,
  );

  if (instanceId) {
    // ── Instance path ──
    const instance = await prisma.leadProductStructureInstance.findFirst({
      where: { id: instanceId, vendor_id: vendorId, lead_id: leadId },
      select: {
        quantity_index: true,
        is_order_login_completed: true,
        is_tech_check_completed: true,
        lead: {
          select: {
            firstname: true,
            lastname: true,
            lead_code: true,
            account_id: true,
          },
        },
      },
    });

    if (!instance) {
      logger.warn("⛔ [PROD-NOTIF] Instance not found in DB", debugCtx);
      return;
    }

    logger.info(
      `🔍 [PROD-NOTIF] Instance flags — is_order_login_completed: ${instance.is_order_login_completed}, is_tech_check_completed: ${instance.is_tech_check_completed}`,
      debugCtx,
    );

    // ✅ Dono flags true hone chahiye tabhi production stage
    const isInProductionStage =
      instance.is_order_login_completed === true &&
      instance.is_tech_check_completed === true;

    if (!isInProductionStage) {
      logger.info(
        "⛔ [PROD-NOTIF] Instance NOT in production stage yet (both flags must be true) — exiting",
        debugCtx,
      );
      return;
    }

    logger.info("✅ [PROD-NOTIF] Instance is in production stage", debugCtx);
    leadRecord = instance.lead;
  } else {
    // ── Non-instance path → lead level check (Type 10) ──
    const productionStage = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 10" },
      select: { id: true },
    });

    if (!productionStage) {
      logger.warn(
        "⛔ [PROD-NOTIF] Production stage (Type 10) not found",
        debugCtx,
      );
      return;
    }

    const lead = await prisma.leadMaster.findUnique({
      where: { id: leadId },
      select: {
        status_id: true,
        firstname: true,
        lastname: true,
        lead_code: true,
        account_id: true,
      },
    });

    if (!lead) {
      logger.warn("⛔ [PROD-NOTIF] Lead not found", debugCtx);
      return;
    }

    logger.info(
      `🔍 [PROD-NOTIF] Lead status_id = ${lead.status_id}, expected = ${productionStage.id}`,
      debugCtx,
    );

    if (lead.status_id !== productionStage.id) {
      logger.info(
        "⛔ [PROD-NOTIF] Lead NOT in production stage — exiting",
        debugCtx,
      );
      return;
    }

    leadRecord = lead;
  }

  logger.info(`✅ [PROD-NOTIF] instanceCode = ${instanceCode}`, debugCtx);

  // ─────────────────────────────────────────────────────────────
  // 2️⃣ Auto-close OL Task
  // ─────────────────────────────────────────────────────────────
  await closeOrderLoginTask(vendorId, leadId, userId);
  logger.info("✅ [PROD-NOTIF] closeOrderLoginTask done", debugCtx);

  // ─────────────────────────────────────────────────────────────
  // 3️⃣ Duplicate Protection
  // ─────────────────────────────────────────────────────────────
  const alreadySent = await prisma.notification.findFirst({
    where: {
      vendor_id: vendorId,
      entity_type: "lead",
      entity_id: leadId,
      type: NotificationType.LEAD_ACTION,
      title: "Order Login Completed",
      ...(instanceId
        ? { metadata: { path: ["instance_id"], equals: instanceId } }
        : {}),
    },
  });

  if (alreadySent) {
    logger.info("⛔ [PROD-NOTIF] Duplicate — notification already sent", {
      ...debugCtx,
      notif_id: alreadySent.id,
    });
    return;
  }

  // ─────────────────────────────────────────────────────────────
  // 4️⃣ Factory User
  // ─────────────────────────────────────────────────────────────
  const mapping = await prisma.leadUserMapping.findFirst({
    where: {
      vendor_id: vendorId,
      lead_id: leadId,
      status: "active",
      user: {
        user_type: {
          user_type: { equals: "factory", mode: "insensitive" },
        },
      },
    },
    select: {
      user: { select: { id: true, user_name: true, user_email: true } },
    },
  });

  logger.info(
    `🔍 [PROD-NOTIF] factory mapping found = ${!!mapping?.user}`,
    debugCtx,
  );

  if (!mapping?.user) {
    logger.warn(
      "⛔ [PROD-NOTIF] No active factory user mapping — exiting",
      debugCtx,
    );
    return;
  }

  const factoryUser = mapping.user;

  // ─────────────────────────────────────────────────────────────
  // 5️⃣ Actor + Lead Info
  // ─────────────────────────────────────────────────────────────
  const actorUser = await prisma.userMaster.findUnique({
    where: { id: userId },
    select: { user_name: true },
  });

  const updatedBy = actorUser?.user_name ?? "System";
  const leadName =
    `${leadRecord!.firstname ?? ""} ${leadRecord!.lastname ?? ""}`.trim();

  // ─────────────────────────────────────────────────────────────
  // 6️⃣ URLs
  // ─────────────────────────────────────────────────────────────
  const queryParams = new URLSearchParams();
  if (leadRecord!.account_id)
    queryParams.set("accountId", String(leadRecord!.account_id));
  if (instanceId) queryParams.set("instance_id", String(instanceId));

  const qs = queryParams.toString();
  const redirectUrl = `/dashboard/leads/details/${leadId}${qs ? `?${qs}` : ""}`;
  const projectUrl = `${baseUrl}${redirectUrl}`;

  logger.info(`🔗 [PROD-NOTIF] projectUrl = ${projectUrl}`, debugCtx);

  // ─────────────────────────────────────────────────────────────
  // 7️⃣ In-App Notification
  // ─────────────────────────────────────────────────────────────
  try {
    await NotificationService.createAndSend({
      vendor_id: vendorId,
      user_id: factoryUser.id,
      sender_id: userId,
      type: NotificationType.LEAD_ACTION,
      title: "Order Login Completed",
      message: `${instanceCode} - ${leadName} Order Login completed`,
      entity_type: "lead",
      entity_id: leadId,
      redirect_url: redirectUrl,
    });

    logger.info("✅ [PROD-NOTIF] In-app notification sent", {
      ...debugCtx,
      factory_user_id: factoryUser.id,
    });
  } catch (err: any) {
    logger.error("❌ [PROD-NOTIF] In-app notification failed", {
      ...debugCtx,
      error: err?.message,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 8️⃣ Email
  // ─────────────────────────────────────────────────────────────
  if (factoryUser.user_email) {
    try {
      await sendOrderLoginCompletedEmail({
        vendor_id: vendorId,
        toEmail: factoryUser.user_email,
        toName: factoryUser.user_name,
        leadCode: instanceCode,
        leadName,
        updatedBy,
        updatedAt: new Date().toLocaleString("en-IN"),
        projectUrl,
      });

      logger.info("✅ [PROD-NOTIF] Email sent", {
        ...debugCtx,
        toEmail: factoryUser.user_email,
      });
    } catch (err: any) {
      logger.error("❌ [PROD-NOTIF] Email send failed", {
        ...debugCtx,
        error: err?.message,
      });
    }
  } else {
    logger.warn("⚠️ [PROD-NOTIF] Factory user has no email — skipping", {
      ...debugCtx,
      factory_user_id: factoryUser.id,
    });
  }

  logger.info("🎉 [PROD-NOTIF] Done", { ...debugCtx, instanceCode });
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
      where: { vendor_id: vendorId, tag: "Type 36" },
    });

    if (!docType && createIfMissing) {
      docType = await prisma.documentTypeMaster.create({
        data: {
          vendor_id: vendorId,
          tag: "Type 36",
          type: "PO-files",
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

    await prisma.leadDetailedLogs.create({
      data: {
        vendor_id: vendorId,
        lead_id: Number(lead_id),
        account_id: Number(account_id),
        action: `Order Login entry created: ${item_type} — ${item_desc}`,
        action_type: "CREATE",
        created_by: Number(created_by),
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
        let record;
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
          record = await prisma.orderLoginDetails.update({
            where: { id: existing.id },
            data: {
              item_desc,
              company_vendor_id: company_vendor_id
                ? Number(company_vendor_id)
                : null,
              updated_by: Number(created_by),
              updated_at: new Date(),
              is_completed: true, // mark completed when updated
              completion_date: new Date(),
            },
          });
        } else {
          record = await prisma.orderLoginDetails.create({
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
        }

        results.push(record);
      } catch (err: any) {
        errors.push({ index, message: err.message });
      }
    }

    if (results.length > 0) {
      const firstCreatedBy = breakups.find((b) => b.created_by)?.created_by;
      await prisma.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          action: `Order Login entries submitted: ${results.length} created/updated`,
          action_type: "CREATE",
          created_by: Number(firstCreatedBy),
        },
      });
    }

    return { results, errors };
  }

  async getOrderLoginByLead(
    vendorId: number,
    leadId: number,
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

    // 2️⃣ Fetch instance-level flag (only if instanceId provided)
    let isOrderLoginFilled: boolean | null = null;

    if (instanceId) {
      const instance = await prisma.leadProductStructureInstance.findFirst({
        where: {
          id: instanceId,
          vendor_id: vendorId,
          lead_id: leadId,
        },
        select: {
          is_order_login_filled: true,
        },
      });

      isOrderLoginFilled = instance?.is_order_login_filled ?? false;
    }

    // 3️⃣ Return combined response
    return {
      list: orderLogins,
      hasData: orderLogins.length > 0,

      // ✅ EXTRA FIELD YOU NEEDED
      is_order_login_filled: isOrderLoginFilled,
    };
  }

  async updateOrderLogin(vendorId: number, orderLoginId: number, payload: any) {
    const {
      lead_id,
      item_type,
      item_desc,
      company_vendor_id,
      updated_by,
      instance_id,
    } = payload;

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

    // ✅ Ensure record exists
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

    // ------------------------------------------------------------
    // 🚫 Instance-Aware Duplicate Check (Corrected Logic)
    // ------------------------------------------------------------
    const duplicate = await prisma.orderLoginDetails.findFirst({
      where: {
        vendor_id: vendorId,
        lead_id: Number(lead_id),

        // 👇 critical fix — scope to same instance only
        instance_id: instance_id ?? existing.instance_id ?? null,

        item_type,

        // exclude self
        NOT: {
          id: orderLoginId,
        },
      },
    });

    if (duplicate) {
      const error = new Error(
        `Item type '${item_type}' already exists for this instance.`,
      );
      (error as any).statusCode = 409;
      throw error;
    }

    // ------------------------------------------------------------
    // ✅ Update Record
    // ------------------------------------------------------------
    const updated = await prisma.orderLoginDetails.update({
      where: { id: orderLoginId },
      data: {
        item_type,
        item_desc,
        company_vendor_id: company_vendor_id ? Number(company_vendor_id) : null,
        updated_by: Number(updated_by),
      },
    });

    await prisma.leadDetailedLogs.create({
      data: {
        vendor_id: vendorId,
        lead_id: Number(lead_id),
        account_id: existing.account_id,
        action: `Order Login entry updated: ${item_type} — ${item_desc}`,
        action_type: "UPDATE",
        created_by: Number(updated_by),
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

        await prisma.leadDetailedLogs.create({
          data: {
            vendor_id: vendorId,
            lead_id: leadId,
            account_id: existing.account_id,
            action: `Order Login entry updated: ${item_type} — ${item_desc}`,
            action_type: "UPDATE",
            created_by: Number(updated_by),
          },
        });

        results.push(updated);
      } catch (err: any) {
        errors.push({ index, message: err.message });
      }
    }

    return { results, errors };
  }

  async deleteOrderLogin(vendorId: number, orderLoginId: number, userId: number) {
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

    const deleted = await prisma.orderLoginDetails.delete({
      where: { id: orderLoginId },
    });

    await prisma.leadDetailedLogs.create({
      data: {
        vendor_id: vendorId,
        lead_id: existing.lead_id,
        account_id: existing.account_id,
        action: `Order Login entry deleted: ${existing.item_type} — ${existing.item_desc}`,
        action_type: "DELETE",
        created_by: userId,
      },
    });

    return deleted;
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

    if (accountId) {
      const detailedLog = await prisma.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          action: `Production files uploaded: ${files.length} file(s)`,
          action_type: "CREATE",
          created_by: userId,
        },
      });

      await prisma.leadDocumentLogs.createMany({
        data: uploadedDocs.map((doc) => ({
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          doc_id: doc.id,
          lead_logs_id: detailedLog.id,
          created_by: userId,
          created_at: new Date(),
        })),
      });
    }

    return uploadedDocs;
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
    baseUrl,
    userId,
    assignToUserId,
    requiredDate,
    instanceId,
  }: {
    vendorId: number;
    leadId: number;
    accountId: number;
    baseUrl: string;
    userId: number;
    assignToUserId: number;
    requiredDate: Date;
    instanceId?: number | null;
  }) {
    // ============================================================
    // BRANCH A — INSTANCE-LEVEL PATH
    // ============================================================
    if (instanceId) {
      // ──────────────────────────────────────────────────────────
      // ✅ PHASE 1: TRANSACTION — Only DB state changes (~40ms)
      // ──────────────────────────────────────────────────────────
      const txResult = await prisma.$transaction(async (tx) => {
        // 1. Fetch instance
        const instance = await tx.leadProductStructureInstance.findFirst({
          where: {
            id: instanceId,
            lead_id: leadId,
            vendor_id: vendorId,
            account_id: accountId || undefined,
          },
          select: {
            id: true,
            title: true,
            account_id: true,
            quantity_index: true,
          },
        });

        if (!instance) {
          throw new Error("Product structure instance not found for this lead");
        }

        const effectiveAccountId = accountId || instance.account_id;

        // 2. Fetch lead meta (minimal, needed for code generation)
        const leadMeta = await tx.leadMaster.findUnique({
          where: { id: leadId },
          select: {
            firstname: true,
            lastname: true,
            lead_code: true,
            vendor_id: true,
            account_id: true,
          },
        });

        // 3. Mark instance as order login completed
        const updatedInstance = await tx.leadProductStructureInstance.update({
          where: { id: instanceId },
          data: {
            is_order_login_completed: true,
            order_login_completed_at: new Date(),
            updated_by: userId,
            updated_at: new Date(),
          },
        });

        // 4. Create Production assignment mapping (if not exists)
        let productionMapping: any = null;
        if (assignToUserId && effectiveAccountId) {
          const existingMapping = await tx.leadUserMapping.findFirst({
            where: {
              vendor_id: vendorId,
              lead_id: leadId,
              account_id: effectiveAccountId,
              user_id: assignToUserId,
              type: "production-stage",
              status: "active",
            },
            select: { id: true },
          });

          if (!existingMapping) {
            productionMapping = await tx.leadUserMapping.create({
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
          }
        }

        // 5. Log instance action
        const rawLeadCode =
          leadMeta?.lead_code ?? `LEAD-${String(leadId).padStart(4, "0")}`;
        const totalInstanceCount = await tx.leadProductStructureInstance.count({
          where: { lead_id: leadId, vendor_id: vendorId },
        });
        const instanceCode =
          totalInstanceCount > 1 && instance.quantity_index
            ? `${rawLeadCode}.${instance.quantity_index}`
            : rawLeadCode;

        await tx.leadDetailedLogs.create({
          data: {
            vendor_id: vendorId,
            lead_id: leadId,
            account_id: effectiveAccountId,
            action: `Order Login stage completed for instance ${instance.title} (${instanceCode})`,
            action_type: "UPDATE",
            created_by: userId,
          },
        });

        // 6. Check pending instances
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

        // 7. If all instances done → move lead to Production
        let leadMoved = false;
        let updatedLead: any = null;

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

          updatedLead = await tx.leadMaster.update({
            where: { id: leadId },
            data: {
              status_id: statusType.id,
              client_required_order_login_complition_date: requiredDate,
              updated_by: userId,
              updated_at: new Date(),
            },
            include: { statusType: true },
          });

          // Chat room setup
          let chatRoom = await tx.leadChatRoom.findFirst({
            where: { lead_id: leadId, vendor_id: vendorId },
            select: { id: true },
          });

          if (!chatRoom) {
            chatRoom = await tx.leadChatRoom.create({
              data: { lead_id: leadId, vendor_id: vendorId },
              select: { id: true },
            });
          }

          const existingMember = await tx.leadChatMember.findFirst({
            where: { chat_room_id: chatRoom.id, user_id: assignToUserId },
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
              lead_id: leadId,
              account_id: effectiveAccountId,
              vendor_id: vendorId,
              status_id: statusType.id,
              created_by: userId,
            },
          });

          const assignedUserForProd = await tx.userMaster.findUnique({
            where: { id: assignToUserId },
            select: { user_name: true },
          });
          const assignedUserNameForProd = assignedUserForProd?.user_name ?? `User #${assignToUserId}`;

          await tx.leadDetailedLogs.create({
            data: {
              vendor_id: vendorId,
              lead_id: leadId,
              account_id: effectiveAccountId,
              action: `All instances order login completed. Lead moved to Production and assigned to ${assignedUserNameForProd}. Required completion date: ${requiredDate.toLocaleDateString()}`,
              action_type: "STATUS_CHANGE",
              created_by: userId,
            },
          });

          leadMoved = true;
        }

        // Return all data needed for Phase 2
        return {
          instance,
          updatedInstance,
          productionMapping,
          leadMeta,
          leadMoved,
          updatedLead,
          effectiveAccountId,
          instanceCode,
          rawLeadCode,
          pendingInstances,
        };
      });
      // ── Transaction ends here — DB lock released ──

      // ──────────────────────────────────────────────────────────
      // ✅ PHASE 2: BUSINESS LOGIC — Outside transaction (no timeout risk)
      // ──────────────────────────────────────────────────────────

      const {
        instance,
        updatedInstance,
        productionMapping,
        leadMeta,
        leadMoved,
        updatedLead,
        effectiveAccountId,
      } = txResult;

      const leadName =
        `${leadMeta?.firstname ?? ""} ${leadMeta?.lastname ?? ""}`.trim();
      const instanceCode = await resolveLeadCode(vendorId, leadId, instanceId);

      // Build URLs
      const queryParams = new URLSearchParams();
      if (leadMeta?.account_id) {
        queryParams.set("accountId", String(leadMeta.account_id));
      }
      queryParams.set("instance_id", String(instanceId));
      const queryString = queryParams.toString();
      const redirectUrl = `/dashboard/leads/details/${leadId}?${queryString}`;
      const projectUrl = `${baseUrl}${redirectUrl}`;

      const updatedAt = new Date().toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      // Fetch users for notifications (safe — outside transaction)
      const [actor, factoryUser, admins, backendMappingData] =
        await Promise.all([
          prisma.userMaster.findUnique({
            where: { id: userId },
            select: { user_name: true },
          }),
          prisma.userMaster.findUnique({
            where: { id: assignToUserId },
            select: { id: true, user_name: true, user_email: true },
          }),
          prisma.userMaster.findMany({
            where: {
              vendor_id: vendorId,
              status: "active",
              user_type: {
                user_type: { equals: "admin", mode: "insensitive" },
              },
            },
            select: { id: true, user_name: true, user_email: true },
          }),
          prisma.leadUserMapping.findFirst({
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
                select: { id: true, user_name: true, user_email: true },
              },
            },
          }),
        ]);

      // Validate order login status (safe — outside transaction)
      // 🔑 Direct DB truth source
      const instanceRecord =
        await prisma.leadProductStructureInstance.findFirst({
          where: {
            id: instanceId,
            vendor_id: vendorId,
            lead_id: leadId,
          },
          select: {
            is_order_login_filled: true,
          },
        });

      const instanceOrderLoginComplete =
        instanceRecord?.is_order_login_filled === true;

      let missingTypes: string[] = [];

      if (!instanceOrderLoginComplete) {
        missingTypes = await this.getMissingRequiredOrderLoginTypes(
          vendorId,
          leadId,
          instanceId,
        );
      }

      // ── NOTIFICATION MATRIX ──
      if (instanceOrderLoginComplete) {
        for (const admin of admins) {
          try {
            await NotificationService.createAndSend({
              vendor_id: vendorId,
              user_id: admin.id,
              sender_id: userId,
              type: NotificationType.LEAD_MILESTONE,
              title: "Production Started",
              message: `${instanceCode} - ${leadName} is now in Production.`,
              entity_type: "lead",
              entity_id: leadId,
              redirect_url: redirectUrl,
            });

            if (admin.user_email) {
              await sendLeadMovedToProductionEmail({
                vendor_id: vendorId,
                toEmail: admin.user_email,
                toName: admin.user_name,
                leadCode: instanceCode,
                leadName,
                updatedBy: actor?.user_name ?? "System",
                updatedAt,
                projectUrl,
              });
            }
          } catch (err: any) {
            console.error(`❌ Admin ${admin.id} failed:`, err.message);
          }
        }

        if (factoryUser?.id) {
          try {
            await NotificationService.createAndSend({
              vendor_id: vendorId,
              user_id: factoryUser.id,
              sender_id: userId,
              type: NotificationType.LEAD_ASSIGNED,
              title: "Moved to Production",
              message: `${instanceCode} - ${leadName} has entered Production.`,
              entity_type: "lead",
              entity_id: leadId,
              redirect_url: redirectUrl,
            });

            if (factoryUser.user_email) {
              await sendMovedToProductionWithOrderLoginEmail({
                vendor_id: vendorId,
                toEmail: factoryUser.user_email,
                toName: factoryUser.user_name,
                leadCode: instanceCode,
                leadName,
                updatedBy: actor?.user_name ?? "System",
                updatedAt,
                projectUrl,
              });
            }
            console.log("✅ Factory notified");
          } catch (err: any) {
            console.error("❌ Factory notification failed:", err.message);
          }
        }
      } else {
        // ❌ OL INCOMPLETE → Admin + Factory + Backend
        console.log("❌ Instance OL Incomplete - Sending 3 emails");

        for (const admin of admins) {
          try {
            await NotificationService.createAndSend({
              vendor_id: vendorId,
              user_id: admin.id,
              sender_id: userId,
              type: NotificationType.LEAD_MILESTONE,
              title: "Production Started",
              message: `${instanceCode} - ${leadName} is now in Production.`,
              entity_type: "lead",
              entity_id: leadId,
              redirect_url: redirectUrl,
            });

            if (admin.user_email) {
              await sendLeadMovedToProductionEmail({
                vendor_id: vendorId,
                toEmail: admin.user_email,
                toName: admin.user_name,
                leadCode: instanceCode,
                leadName,
                updatedBy: actor?.user_name ?? "System",
                updatedAt,
                projectUrl,
              });
            }
            console.log(`✅ Admin ${admin.id} notified`);
          } catch (err: any) {
            console.error(`❌ Admin ${admin.id} failed:`, err.message);
          }
        }

        if (factoryUser?.id) {
          try {
            await NotificationService.createAndSend({
              vendor_id: vendorId,
              user_id: factoryUser.id,
              sender_id: userId,
              type: NotificationType.LEAD_ACTION,
              title: "Project Assigned – Order Login Pending",
              message: `You've been assigned ${instanceCode} - ${leadName} for Order Login. Upload production files and order login details.`,
              entity_type: "lead",
              entity_id: leadId,
              redirect_url: redirectUrl,
            });

            if (factoryUser.user_email) {
              await sendMovedToProductionOrderLoginPendingEmail({
                vendor_id: vendorId,
                toEmail: factoryUser.user_email,
                toName: factoryUser.user_name,
                leadCode: instanceCode,
                leadName,
                projectUrl,
              });
            }
            console.log("✅ Factory notified");
          } catch (err: any) {
            console.error("❌ Factory notification failed:", err.message);
          }
        }

        if (backendMappingData?.user?.id) {
          try {
            await NotificationService.createAndSend({
              vendor_id: vendorId,
              user_id: backendMappingData.user.id,
              sender_id: userId,
              type: NotificationType.LEAD_ACTION,
              title: "Moved to Production (Order Login Pending)",
              message: `${instanceCode} - ${leadName} has entered Production. Production files are available, but Order Login details are pending.`,
              entity_type: "lead",
              entity_id: leadId,
              redirect_url: redirectUrl,
            });

            if (backendMappingData.user.user_email) {
              await sendMovedToProductionWithoutOrderLoginEmail({
                vendor_id: vendorId,
                toEmail: backendMappingData.user.user_email,
                toName: backendMappingData.user.user_name,
                leadCode: instanceCode,
                leadName,
                projectUrl,
              });
            }
            console.log("✅ Backend notified");
          } catch (err: any) {
            console.error("❌ Backend notification failed:", err.message);
          }
        } else {
          console.log("ℹ️ No backend user found for this lead");
        }
      }

      if (missingTypes.length > 0 && instanceId) {
        const leadFranchise = await prisma.leadMaster.findUnique({
          where: { id: leadId },
          select: { franchise_id: true },
        });
        const backendTaskMapping = await prisma.leadUserMapping.findFirst({
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
          select: { user_id: true },
        });

        if (backendTaskMapping?.user_id) {
          // 🔑 Check existing task for THIS INSTANCE
          const existingTask = await prisma.userLeadTask.findFirst({
            where: {
              vendor_id: vendorId,
              lead_id: leadId,
              instance_id: instanceId, // ✅ Instance specific
              user_id: backendTaskMapping.user_id,
              task_type: "Order Login",
              status: "open",
            },
            select: { id: true },
          });

          if (!existingTask) {
            await prisma.userLeadTask.create({
              data: {
                lead_id: leadId,
                account_id: effectiveAccountId,
                vendor_id: vendorId,
                franchise_id: leadFranchise?.franchise_id ?? null,
                user_id: backendTaskMapping.user_id,
                instance_id: instanceId, // ✅ Bind to instance
                task_type: "Order Login",
                lead_stage: "order-login-stage",
                due_date: new Date(Date.now() + 24 * 60 * 60 * 1000),
                remark: `Missing order login items for ${instanceCode}: ${missingTypes.join(", ")}`,
                status: "open",
                created_by: userId,
              },
            });
          }
        }
      }

      // ── Return result ──
      if (leadMoved) {
        return {
          mode: "instance_and_lead_moved",
          instance_id: updatedInstance.id,
          instance_code: instanceCode,
          is_order_login_completed: updatedInstance.is_order_login_completed,
          order_login_completed_at: updatedInstance.order_login_completed_at,
          moved_to_production: true,
          lead: updatedLead,
          leadUserMapping: txResult.productionMapping,
        };
      }

      return {
        mode: "instance",
        instance_id: updatedInstance.id,
        instance_code: instanceCode,
        is_order_login_completed: updatedInstance.is_order_login_completed,
        order_login_completed_at: updatedInstance.order_login_completed_at,
        moved_to_production: false,
      };
    }

    // ============================================================
    // BRANCH B — NO INSTANCE (LEAD-LEVEL PATH)
    // No transaction needed here — already sequential, no atomicity risk
    // ============================================================

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

    const updatedLead = await prisma.leadMaster.update({
      where: { id: leadId },
      data: {
        status_id: statusType.id,
        client_required_order_login_complition_date: requiredDate,
        updated_by: userId,
        updated_at: new Date(),
      },
      include: { statusType: true },
    });

    const missingTypes = await this.getMissingRequiredOrderLoginTypes(
      vendorId,
      leadId,
    );

    if (missingTypes.length > 0) {
      const leadFranchise = await prisma.leadMaster.findUnique({
        where: { id: leadId },
        select: { franchise_id: true },
      });
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
        select: { user_id: true },
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
              franchise_id: leadFranchise?.franchise_id ?? null,
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

    let chatRoom = await prisma.leadChatRoom.findFirst({
      where: { lead_id: leadId, vendor_id: vendorId },
      select: { id: true },
    });

    if (!chatRoom) {
      chatRoom = await prisma.leadChatRoom.create({
        data: { lead_id: leadId, vendor_id: vendorId },
        select: { id: true },
      });
    }

    const existingMember = await prisma.leadChatMember.findFirst({
      where: { chat_room_id: chatRoom.id, user_id: assignToUserId },
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

    await prisma.leadStatusLogs.create({
      data: {
        lead_id: leadId,
        account_id: accountId,
        vendor_id: vendorId,
        status_id: statusType.id,
        created_by: userId,
      },
    });

    const assignedUserForLog = await prisma.userMaster.findUnique({
      where: { id: assignToUserId },
      select: { user_name: true },
    });
    const assignedUserNameForLog = assignedUserForLog?.user_name ?? `User #${assignToUserId}`;

    await prisma.leadDetailedLogs.create({
      data: {
        vendor_id: vendorId,
        lead_id: leadId,
        account_id: accountId,
        action: `Lead moved to Production Stage and assigned to ${assignedUserNameForLog}. Required completion date: ${requiredDate.toLocaleDateString()}`,
        action_type: "STATUS_CHANGE",
        created_by: userId,
      },
    });

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
    const leadCode = leadMeta.lead_code;
    const projectUrl = leadMeta.account_id
      ? `${baseUrl}/dashboard/leads/details/${leadId}?accountId=${leadMeta.account_id}`
      : `${baseUrl}/dashboard/leads/details/${leadId}`;
    const redirectUrl = leadMeta.account_id
      ? `/dashboard/leads/details/${leadId}?accountId=${leadMeta.account_id}`
      : `/dashboard/leads/details/${leadId}`;

    try {
      const actor = await prisma.userMaster.findUnique({
        where: { id: userId },
        select: { user_name: true },
      });

      const updatedAt = new Date().toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      const admins = await prisma.userMaster.findMany({
        where: {
          vendor_id: leadMeta.vendor_id,
          status: "active",
          user_type: {
            user_type: { equals: "admin", mode: "insensitive" },
          },
        },
        select: { id: true, user_name: true, user_email: true },
      });

      for (const admin of admins) {
        await NotificationService.createAndSend({
          vendor_id: leadMeta.vendor_id,
          user_id: admin.id,
          sender_id: userId,
          type: NotificationType.LEAD_MILESTONE,
          title: "Lead Entered Production Stage",
          message: `${leadCode} - ${leadName} moved to Production stage.`,
          entity_type: "lead",
          entity_id: leadId,
          redirect_url: redirectUrl,
        });

        if (admin.user_email) {
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
      }
    } catch (err: any) {
      logger.warn("⚠️ Production stage admin notification failed", {
        lead_id: leadId,
        error: err?.message,
      });
    }

    const orderLoginCompleted = await isOrderLoginComplete(vendorId, leadId);

    const factoryUser = await prisma.userMaster.findUnique({
      where: { id: assignToUserId },
      select: { id: true, user_name: true, user_email: true },
    });

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
          select: { id: true, user_name: true, user_email: true },
        },
      },
    });

    if (!orderLoginCompleted) {
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

    if (orderLoginCompleted) {
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

      if (factoryUser?.user_email) {
        const actor = await prisma.userMaster.findUnique({
          where: { id: userId },
          select: { user_name: true },
        });

        const updatedAt = new Date().toLocaleString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
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

  async uploadOrderLoginPoFile({
    vendorId,
    leadId,
    userId,
    orderLoginId,
    files,
    instanceId,
  }: UploadOrderLoginPoFileInput) {
    if (!vendorId || !leadId || !userId || !orderLoginId) {
      const error = new Error(
        "vendorId, leadId, orderLoginId, and userId are required",
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
    if (!docType) throw new Error("Doc Type (Type 36) not found");

    const uploadedDocs: { mapping_id: number; document_id: number; file_name: string | null; file_path: string }[] = [];

    await prisma.$transaction(async (tx) => {
      for (const file of files) {
        const savedDoc = await tx.leadDocuments.create({
          data: {
            doc_og_name: file.originalName,
            doc_sys_name: file.sysName,
            created_by: userId,
            vendor_id: vendorId,
            lead_id: leadId,
            doc_type_id: docType.id,
            product_structure_instance_id:
              typeof instanceId !== "undefined" ? instanceId : null,
          },
        });

        const mapping = await tx.orderLoginPoFileMapping.create({
          data: {
            orderlogin_id: orderLoginId,
            lead_id: leadId,
            document_id: savedDoc.id,
            created_by: userId,
          },
        });

        uploadedDocs.push({
          mapping_id: mapping.id,
          document_id: savedDoc.id,
          file_name: savedDoc.doc_og_name,
          file_path: savedDoc.doc_sys_name,
        });
      }

      const [lead, orderLoginRecord] = await Promise.all([
        tx.leadMaster.findUnique({
          where: { id: leadId },
          select: { account_id: true },
        }),
        tx.orderLoginDetails.findUnique({
          where: { id: orderLoginId },
          select: { item_type: true },
        }),
      ]);

      if (lead?.account_id) {
        const orderLoginLabel = orderLoginRecord?.item_type ?? `Order Login #${orderLoginId}`;
        const detailedLog = await tx.leadDetailedLogs.create({
          data: {
            vendor_id: vendorId,
            lead_id: leadId,
            account_id: lead.account_id,
            action: `PO files uploaded for "${orderLoginLabel}": ${files.length} file(s)`,
            action_type: "CREATE",
            created_by: userId,
          },
        });

        await tx.leadDocumentLogs.createMany({
          data: uploadedDocs.map((doc) => ({
            vendor_id: vendorId,
            lead_id: leadId,
            account_id: lead.account_id!,
            doc_id: doc.document_id,
            lead_logs_id: detailedLog.id,
            created_by: userId,
            created_at: new Date(),
          })),
        });
      }
    });
  }

  async getOrderLoginPoFile(
    vendorId: number,
    leadId: number,
    orderLoginId: number,
  ) {
    if (!vendorId || !leadId || !orderLoginId) {
      const error = new Error("vendorId, leadId and orderLoginId are required");
      (error as any).statusCode = 400;
      throw error;
    }

    const records = await prisma.orderLoginPoFileMapping.findMany({
      where: {
        orderlogin_id: orderLoginId,
        lead_id: leadId,
        is_deleted: false,
        lead: {
          vendor_id: vendorId,
        },
      },
      include: {
        document: true,
        createdBy: {
          select: {
            id: true,
            user_name: true,
          },
        },
      },
      orderBy: {
        created_at: "desc",
      },
    });

    logger.info("[OrderLoginPoFiles] Fetch", {
      vendorId,
      leadId,
      orderLoginId,
      count: records.length,
      bucket: process.env.WASABI_BUCKET_NAME,
      endpoint: process.env.WASABI_ENDPOINT,
      region: process.env.WASABI_REGION,
    });

    return await Promise.all(
      records.map(async (r) => {
        const fileName = r.document.doc_og_name ?? "";
        const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
        const inlineExts = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
        const disposition = inlineExts.has(ext) ? "inline" : "attachment";

        const key = r.document.doc_sys_name;
        let signedUrl = "";
        try {
          signedUrl = await generateSignedUrl(key, 3600, disposition);
          logger.info("[OrderLoginPoFiles] Signed URL generated", {
            vendorId,
            leadId,
            orderLoginId,
            documentId: r.document.id,
            key,
            disposition,
            signedUrlPreview: signedUrl.slice(0, 120),
          });
        } catch (err: any) {
          logger.error("[OrderLoginPoFiles] Signed URL generation failed", {
            vendorId,
            leadId,
            orderLoginId,
            documentId: r.document.id,
            key,
            disposition,
            error: err?.message || err,
          });
          throw err;
        }

        return {
          id: r.document.id,
          doc_og_name: r.document.doc_og_name,
          created_at: r.document.created_at,
          file_path: r.document.doc_sys_name,
          signed_url: signedUrl,
        };
      }),
    );
  }

  async deleteOrderLoginPoFile({
    vendorId,
    documentId,
    userId,
  }: {
    vendorId: number;
    documentId: number;
    userId: number;
  }) {
    if (!vendorId || !documentId || !userId) {
      const error = new Error("Required parameters missing");
      (error as any).statusCode = 400;
      throw error;
    }

    return await prisma.$transaction(async (tx) => {
      /**
       * Validate Mapping Exists & Belongs To Tenant
       */
      const mapping = await tx.orderLoginPoFileMapping.findUnique({
        where: { id: documentId },
        include: {
          lead: { select: { vendor_id: true, id: true, account_id: true } },
          document: true,
        },
      });

      if (!mapping) {
        const error = new Error("PO file not found");
        (error as any).statusCode = 404;
        throw error;
      }

      /**
       * Soft Delete Mapping
       */
      await tx.orderLoginPoFileMapping.update({
        where: { id: documentId },
        data: {
          is_deleted: true,
          deleted_at: new Date(),
          deleted_by: userId,
        },
      });

      await tx.leadDocuments.update({
        where: { id: mapping.document_id },
        data: {
          is_deleted: true,
          deleted_at: new Date(),
          deleted_by: userId,
        },
      });

      if (mapping.lead?.account_id) {
        const detailedLog = await tx.leadDetailedLogs.create({
          data: {
            vendor_id: vendorId,
            lead_id: mapping.lead_id,
            account_id: mapping.lead.account_id,
            action: `PO file deleted: ${mapping.document.doc_og_name ?? "Unknown file"}`,
            action_type: "DELETE",
            created_by: userId,
          },
        });

        await tx.leadDocumentLogs.create({
          data: {
            vendor_id: vendorId,
            lead_id: mapping.lead_id,
            account_id: mapping.lead.account_id,
            doc_id: mapping.document_id,
            lead_logs_id: detailedLog.id,
            created_by: userId,
            created_at: new Date(),
          },
        });
      }

      return { success: true };
    });
  }

  async markOrderLoginFilled(
    vendorId: number,
    leadId: number,
    instanceId: number,
    updatedBy: number,
    baseUrl: string,
  ) {
    logger.info("[OrderLoginInstanceService] markOrderLoginFilled called", {
      vendorId,
      leadId,
      instanceId,
    });

    // ✅ Validate instance belongs to vendor + lead
    const instance = await prisma.leadProductStructureInstance.findFirst({
      where: {
        id: instanceId,
        vendor_id: vendorId,
        lead_id: leadId,
      },
      select: { id: true, title: true, is_order_login_filled: true },
    });

    if (!instance) {
      throw new Error("Instance not found for this vendor/lead");
    }

    // ✅ Prevent unnecessary writes
    if (instance.is_order_login_filled === true) {
      return { message: "Already marked as filled" };
    }

    // ✅ Update flag
    const updated = await prisma.leadProductStructureInstance.update({
      where: { id: instanceId },
      data: {
        is_order_login_filled: true,
        updated_by: updatedBy,
        updated_at: new Date(),
      },
    });

    const leadForLog = await prisma.leadMaster.findUnique({
      where: { id: leadId },
      select: { account_id: true },
    });

    if (leadForLog?.account_id) {
      await prisma.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: leadForLog.account_id,
          action: `Order Login marked as filled for instance "${instance.title}"`,
          action_type: "UPDATE",
          created_by: updatedBy,
        },
      });
    }

    await triggerOrderLoginCompletionNotification(
      vendorId,
      leadId,
      updatedBy,
      baseUrl,
      instanceId,
    );
    logger.info("[OrderLoginInstanceService] Updated successfully", {
      instanceId,
    });

    return updated;
  }

  // ─────────────────────────────────────────────────────────────
  // Production Files Remark (order_login_prod_files_remark on LeadMaster)
  // ─────────────────────────────────────────────────────────────

  async getProductionFilesRemark(vendorId: number, leadId: number) {
    const lead = await prisma.leadMaster.findFirst({
      where: { id: leadId, vendor_id: vendorId },
      select: { order_login_prod_files_remark: true },
    });

    if (!lead) {
      const error = new Error("Lead not found.");
      (error as any).statusCode = 404;
      throw error;
    }

    return lead.order_login_prod_files_remark ?? "N/A";
  }

  async upsertProductionFilesRemark(
    vendorId: number,
    leadId: number,
    remark: string,
    updatedBy: number,
  ) {
    const lead = await prisma.leadMaster.findFirst({
      where: { id: leadId, vendor_id: vendorId },
      select: { id: true, account_id: true },
    });

    if (!lead) {
      const error = new Error("Lead not found.");
      (error as any).statusCode = 404;
      throw error;
    }

    const updated = await prisma.leadMaster.update({
      where: { id: leadId },
      data: {
        order_login_prod_files_remark: remark.trim() || "N/A",
        updated_by: updatedBy,
        updated_at: new Date(),
      },
      select: { id: true, order_login_prod_files_remark: true },
    });

    if (lead.account_id) {
      await prisma.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: lead.account_id,
          action: `Production files remark updated: ${remark.trim() || "N/A"}`,
          action_type: "UPDATE",
          created_by: updatedBy,
        },
      });
    }

    return updated;
  }
}
