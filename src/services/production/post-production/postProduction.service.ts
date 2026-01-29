import logger from "../../../../src/utils/logger";
import { prisma } from "../../../prisma/client";
import { generateSignedUrl } from "../../../utils/wasabiClient";
import { sendReadyToDispatchEmail } from "src/services/email/brevoEmail.service";
import { NotificationType } from "@prisma/client";
import { NotificationService } from "src/services/notification/notification.service";

export class PostProductionService {
  async uploadQcPhotos(
    vendorId: number,
    leadId: number,
    accountId: number | null,
    userId: number,
    files: { originalName: string; sysName: string }[],
  ) {
    if (!vendorId || !leadId || !userId)
      throw Object.assign(
        new Error("vendorId, leadId and userId are required"),
        { statusCode: 400 },
      );

    // 🔹 Get DocType for QC Photos (Type 15)
    const qcDocType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 15" },
    });

    if (!qcDocType)
      throw Object.assign(
        new Error("Document type (Type 15) not found for this vendor"),
        { statusCode: 404 },
      );

    const uploadedDocs = [];

    // 🔹 Iterate through files
    for (const file of files) {
      // 🔹 Create DB record
      const doc = await prisma.leadDocuments.create({
        data: {
          doc_og_name: file.originalName,
          doc_sys_name: file.sysName,
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          created_by: userId,
          doc_type_id: qcDocType.id, // Type 15 → QC Photos
        },
      });

      uploadedDocs.push(doc);
    }

    return uploadedDocs;
  }

  async uploadHardwarePackingDetails(
    vendorId: number,
    leadId: number,
    accountId: number | null,
    userId: number,
    remark: string | undefined,
    files: { originalName: string; sysName: string }[],
  ) {
    // ✅ 1. Verify Document Type exists (Type 16)
    const docType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 16" },
    });

    if (!docType)
      throw Object.assign(
        new Error("Document type (Type 16) not found for this vendor"),
        {
          statusCode: 404,
        },
      );

    const uploadedDocs = [];

    // ✅ 2. If remark provided, update LeadMaster
    if (remark && remark.trim() !== "") {
      await prisma.leadMaster.update({
        where: { id: leadId },
        data: { hardware_packing_details_remark: remark, updated_by: userId },
      });

      // Log the remark update
      await prisma.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId ?? 0,
          action: `Hardware Packing Details Remark added/updated: "${remark}"`,
          action_type: "UPDATE",
          created_by: userId,
        },
      });
    }

    // ✅ 3. Handle File Uploads
    if (files && files.length > 0) {
      for (const file of files) {
        const doc = await prisma.leadDocuments.create({
          data: {
            doc_og_name: file.originalName,
            doc_sys_name: file.sysName,
            vendor_id: vendorId,
            lead_id: leadId,
            account_id: accountId,
            created_by: userId,
            doc_type_id: docType.id, // ✅ Type 16
          },
        });

        uploadedDocs.push(doc);
      }
    }

    return {
      remark_updated: remark && remark.trim() !== "",
      files_uploaded: uploadedDocs.length,
      uploaded_docs: uploadedDocs,
    };
  }

  async uploadWoodworkPackingDetails(
    vendorId: number,
    leadId: number,
    accountId: number | null,
    userId: number,
    remark: string | undefined,
    files: { originalName: string; sysName: string }[],
  ) {
    const docType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 17" },
    });

    if (!docType)
      throw Object.assign(
        new Error("Document type (Type 17) not found for this vendor"),
        {
          statusCode: 404,
        },
      );

    const uploadedDocs = [];

    if (remark && remark.trim() !== "") {
      await prisma.leadMaster.update({
        where: { id: leadId },
        data: { woodwork_packing_details_remark: remark, updated_by: userId },
      });

      await prisma.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId ?? 0,
          action: `Woodwork Packing Details Remark added/updated: "${remark}"`,
          action_type: "UPDATE",
          created_by: userId,
        },
      });
    }

    if (files && files.length > 0) {
      for (const file of files) {
        const doc = await prisma.leadDocuments.create({
          data: {
            doc_og_name: file.originalName,
            doc_sys_name: file.sysName,
            vendor_id: vendorId,
            lead_id: leadId,
            account_id: accountId,
            created_by: userId,
            doc_type_id: docType.id,
          },
        });

        uploadedDocs.push(doc);
      }
    }

    return {
      remark_updated: remark && remark.trim() !== "",
      files_uploaded: uploadedDocs.length,
      uploaded_docs: uploadedDocs,
    };
  }

  // ✅ 1. GET QC Photos
  async getQcPhotos(vendorId: number, leadId: number) {
    const docType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 15" },
    });

    if (!docType)
      throw Object.assign(
        new Error("Document type (Type 15) not found for this vendor"),
        { statusCode: 404 },
      );

    const docs = await prisma.leadDocuments.findMany({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        doc_type_id: docType.id,
        is_deleted: false,
      },
      orderBy: { created_at: "asc" },
    });

    // Attach Signed URLs
    const withUrls = await Promise.all(
      docs.map(async (doc) => ({
        ...doc,
        signed_url: await generateSignedUrl(doc.doc_sys_name, 3600, "inline"),
      })),
    );

    return withUrls;
  }

  // ✅ 2. GET Hardware Packing Details
  async getHardwarePackingDetails(vendorId: number, leadId: number) {
    const docType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 16" },
    });

    if (!docType)
      throw Object.assign(
        new Error("Document type (Type 16) not found for this vendor"),
        { statusCode: 404 },
      );

    const docs = await prisma.leadDocuments.findMany({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        doc_type_id: docType.id,
        is_deleted: false,
      },
      orderBy: { created_at: "asc" },
    });

    const withUrls = await Promise.all(
      docs.map(async (doc) => ({
        ...doc,
        signed_url: await generateSignedUrl(doc.doc_sys_name, 3600, "inline"),
      })),
    );

    const hardwarePackingDetailsRemark = await prisma.leadMaster.findFirst({
      where: { id: leadId, vendor_id: vendorId },
      select: {
        id: true,
        firstname: true,
        lastname: true,
        hardware_packing_details_remark: true,
      },
    });

    return {
      remark:
        hardwarePackingDetailsRemark?.hardware_packing_details_remark || null,
      documents: withUrls,
    };
  }

  // ✅ 3. GET Woodwork Packing Details
  async getWoodworkPackingDetails(vendorId: number, leadId: number) {
    const docType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 17" },
    });

    if (!docType)
      throw Object.assign(
        new Error("Document type (Type 17) not found for this vendor"),
        { statusCode: 404 },
      );

    const docs = await prisma.leadDocuments.findMany({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        doc_type_id: docType.id,
        is_deleted: false,
      },
      orderBy: { created_at: "asc" },
    });

    const withUrls = await Promise.all(
      docs.map(async (doc) => ({
        ...doc,
        signed_url: await generateSignedUrl(doc.doc_sys_name, 3600, "inline"),
      })),
    );

    const woodWorkPackingDetailsRemark = await prisma.leadMaster.findFirst({
      where: { id: leadId, vendor_id: vendorId },
      select: {
        id: true,
        firstname: true,
        lastname: true,
        woodwork_packing_details_remark: true,
      },
    });

    return {
      remark:
        woodWorkPackingDetailsRemark?.woodwork_packing_details_remark || null,
      documents: withUrls,
    };
  }

  async updateNoOfBoxes(
    vendorId: number,
    leadId: number,
    accountId: number | null,
    userId: number,
    noOfBoxes: number,
  ) {
    // ✅ Validate Lead Exists
    const lead = await prisma.leadMaster.findFirst({
      where: { id: leadId, vendor_id: vendorId, is_deleted: false },
      select: { id: true, no_of_boxes: true },
    });

    if (!lead) {
      throw Object.assign(new Error("Lead not found for this vendor"), {
        statusCode: 404,
      });
    }

    // ✅ Update the number of boxes
    const updatedLead = await prisma.leadMaster.update({
      where: { id: leadId },
      data: {
        no_of_boxes: noOfBoxes,
        updated_by: userId,
        updated_at: new Date(),
      },
      select: {
        id: true,
        lead_code: true,
        no_of_boxes: true,
        updated_at: true,
      },
    });

    // ✅ Log the update
    await prisma.leadDetailedLogs.create({
      data: {
        vendor_id: vendorId,
        lead_id: leadId,
        account_id: accountId ?? 0,
        action: `Number of Boxes updated to ${noOfBoxes}`,
        action_type: "UPDATE",
        created_by: userId,
        created_at: new Date(),
      },
    });

    return updatedLead;
  }

  // ✅ Fetch No. of Boxes
  async getNoOfBoxes(vendorId: number, leadId: number) {
    const lead = await prisma.leadMaster.findFirst({
      where: { id: leadId, vendor_id: vendorId, is_deleted: false },
      select: {
        id: true,
        lead_code: true,
        no_of_boxes: true,
        updated_at: true,
      },
    });

    return lead;
  }

  // ✅ Check Post-Production Completeness
  async checkPostProductionCompleteness(vendorId: number, leadId: number) {
    // 🟦 1. QC Photos (Type 15)
    const qcDocType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 15" },
    });

    let qcPhotosExist = false;
    if (qcDocType) {
      const qcCount = await prisma.leadDocuments.count({
        where: {
          vendor_id: vendorId,
          lead_id: leadId,
          doc_type_id: qcDocType.id,
          is_deleted: false,
        },
      });
      qcPhotosExist = qcCount > 0;
    }

    // 🟩 2. Hardware Packing Details (Type 16)
    const hardwareDocType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 16" },
    });

    let hardwareDocsExist = false;
    let hardwareRemarkExist = false;
    if (hardwareDocType) {
      const hardwareCount = await prisma.leadDocuments.count({
        where: {
          vendor_id: vendorId,
          lead_id: leadId,
          doc_type_id: hardwareDocType.id,
          is_deleted: false,
        },
      });
      hardwareDocsExist = hardwareCount > 0;

      const hardwareRemark = await prisma.leadMaster.findFirst({
        where: { id: leadId, vendor_id: vendorId },
        select: { hardware_packing_details_remark: true },
      });
      hardwareRemarkExist = !!hardwareRemark?.hardware_packing_details_remark;
    }

    // 🟨 3. Woodwork Packing Details (Type 17)
    const woodworkDocType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 17" },
    });

    let woodworkDocsExist = false;
    let woodworkRemarkExist = false;
    if (woodworkDocType) {
      const woodworkCount = await prisma.leadDocuments.count({
        where: {
          vendor_id: vendorId,
          lead_id: leadId,
          doc_type_id: woodworkDocType.id,
          is_deleted: false,
        },
      });
      woodworkDocsExist = woodworkCount > 0;

      const woodworkRemark = await prisma.leadMaster.findFirst({
        where: { id: leadId, vendor_id: vendorId },
        select: { woodwork_packing_details_remark: true },
      });
      woodworkRemarkExist = !!woodworkRemark?.woodwork_packing_details_remark;
    }

    // 🧾 Return Combined Result
    return {
      qc_photos: qcPhotosExist,
      hardware_docs: hardwareDocsExist,
      hardware_remark: hardwareRemarkExist,
      woodwork_docs: woodworkDocsExist,
      woodwork_remark: woodworkRemarkExist,
      all_exists: qcPhotosExist && hardwareDocsExist && woodworkDocsExist,
    };
  }

  async moveLeadToReadyToDispatch(
    vendorId: number,
    leadId: number,
    updatedBy: number,
  ) {
    // ==========================
    // TRANSACTIONAL CORE
    // ==========================

    const result = await prisma.$transaction(async (tx) => {
      // 1️⃣ Fetch Ready To Dispatch status (Type 11)
      const readyToDispatchStatus = await tx.statusTypeMaster.findFirst({
        where: { vendor_id: vendorId, tag: "Type 11" },
        select: { id: true },
      });

      if (!readyToDispatchStatus) {
        throw new Error(
          `Ready To Dispatch status (Type 11) not found for vendor ${vendorId}`,
        );
      }

      // 2️⃣ Validate lead exists
      const currentLead = await tx.leadMaster.findFirst({
        where: { id: leadId, vendor_id: vendorId, is_deleted: false },
        select: {
          id: true,
          status_id: true,
          account_id: true,
          lead_code: true,
          firstname: true,
          lastname: true,
        },
      });

      if (!currentLead) {
        throw new Error(`Lead ${leadId} not found for vendor ${vendorId}`);
      }

      // 3️⃣ Update lead status
      const updatedLead = await tx.leadMaster.update({
        where: { id: leadId },
        data: {
          status_id: readyToDispatchStatus.id,
          updated_by: updatedBy,
        },
      });

      // 4️⃣ Audit log
      await tx.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: currentLead.account_id ?? 0,
          action: "Lead moved to Ready To Dispatch stage",
          action_type: "STATUS_CHANGE",
          created_by: updatedBy,
          created_at: new Date(),
        },
      });

      return {
        updatedLead,
        leadMeta: currentLead,
      };
    });

    // ==========================
    // COMMUNICATION LAYER
    // ==========================

    try {
      const { leadMeta } = result;

      // 5️⃣ Resolve Sales Executive role id
      const salesExecRole = await prisma.userTypeMaster.findFirst({
        where: {
          user_type: { equals: "sales-executive", mode: "insensitive" },
        },
        select: { id: true },
      });

      if (!salesExecRole) {
        logger.warn("Sales Executive role not configured", { vendorId });
        return result.updatedLead;
      }

      // 6️⃣ Fetch mapped Sales Executives
      const leadMappings = await prisma.leadUserMapping.findMany({
        where: {
          vendor_id: vendorId,
          lead_id: leadId,
          status: "active",
        },
        select: { user_id: true },
      });

      const salesUserIds = Array.from(
        new Set(leadMappings.map((m) => m.user_id)),
      ).filter((id) => id !== updatedBy);

      if (!salesUserIds.length) {
        logger.info("No Sales Executive mapped for Ready To Dispatch", {
          leadId,
        });
        return result.updatedLead;
      }

      // 7️⃣ Fetch Sales Executive user profiles
      const salesExecutives = await prisma.userMaster.findMany({
        where: {
          id: { in: salesUserIds },
          vendor_id: vendorId,
          status: "active",
          user_type_id: salesExecRole.id,
        },
        select: {
          id: true,
          user_name: true,
          user_email: true,
        },
      });

      // 8️⃣ Fetch actor (factory user)
      const actor = await prisma.userMaster.findUnique({
        where: { id: updatedBy },
        select: { user_name: true },
      });

      const leadCode =
        leadMeta.lead_code ?? `LEAD-${String(leadId).padStart(4, "0")}`;

      const leadName = `${leadMeta.firstname ?? ""} ${
        leadMeta.lastname ?? ""
      }`.trim();

      const markedBy = actor?.user_name ?? "Factory Team";

      const markedAt = new Date().toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      const redirectPath = leadMeta.account_id
        ? `/dashboard/leads/details/${leadId}?accountId=${leadMeta.account_id}`
        : `/dashboard/leads/details/${leadId}`;

      const baseUrl =
        process.env.CLIENT_BASE_URL ||
        process.env.FRONTEND_URL ||
        "http://localhost:3000";

      const projectUrl = `${baseUrl}${redirectPath}`;

      // ==========================
      // BROADCAST NOTIFICATION + EMAIL
      // ==========================

      await Promise.allSettled(
        salesExecutives.map(async (salesExec) => {
          // 🔔 In-App Notification
          await NotificationService.createAndSend({
            vendor_id: vendorId,
            user_id: salesExec.id,
            sender_id: updatedBy,
            type: NotificationType.LEAD_ACTION,
            title: "Ready to Dispatch",
            message: `Production for ${leadCode} - ${leadName} is complete and marked Ready to Dispatch by the factory.`,
            entity_type: "lead",
            entity_id: leadId,
            redirect_url: redirectPath,
          });

          // 📧 Email Notification
          if (!salesExec.user_email) return;

          await sendReadyToDispatchEmail({
            vendor_id: vendorId,
            toEmail: salesExec.user_email,
            toName: salesExec.user_name ?? undefined,
            leadCode,
            leadName,
            markedBy,
            markedAt,
            projectUrl,
          });
        }),
      );

      logger.info("Ready To Dispatch notifications dispatched", {
        vendorId,
        leadId,
        receivers: salesExecutives.length,
      });
    } catch (notifyError: any) {
      logger.warn("Ready To Dispatch notification failure", {
        leadId,
        vendorId,
        error: notifyError?.message,
      });
    }

    return result.updatedLead;
  }
}
