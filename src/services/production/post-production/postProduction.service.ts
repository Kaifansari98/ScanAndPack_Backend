import logger from "../../../../src/utils/logger";
import { prisma } from "../../../prisma/client";
import { generateSignedUrl } from "../../../utils/wasabiClient";
import { sendReadyToDispatchEmail } from "../../../../src/services/email/brevoEmail.service";
import { NotificationType } from "../../../prisma/generated";
import { NotificationService } from "../../../../src/services/notification/notification.service";
import { getFranchiseAdminRecipients } from "../../../../src/services/notification/adminRecipients.service";
import { STAGE_PATH_BY_TAG } from "../../../../src/services/leadModuleServices/leadsGeneration/leadActivityStatus.service";
import { ensureLeadStatusLog } from "../../../utils/leadStatusLog";

export class PostProductionService {
  async uploadQcPhotos(
    vendorId: number,
    leadId: number,
    accountId: number | null,
    userId: number,
    files: { originalName: string; sysName: string }[],
    instanceId?: number | null
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
          product_structure_instance_id:
            typeof instanceId !== "undefined" ? instanceId : null,
        },
      });

      uploadedDocs.push(doc);
    }

    if (accountId) {
      let instanceTitle: string | undefined;
      if (instanceId) {
        const inst = await prisma.leadProductStructureInstance.findFirst({
          where: { id: instanceId, lead_id: leadId, vendor_id: vendorId },
          select: { title: true },
        });
        instanceTitle = inst?.title ?? undefined;
      }

      const detailedLog = await prisma.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          action: `QC Photos uploaded: ${files.length} file(s)${instanceTitle ? ` for instance "${instanceTitle}"` : ""}`,
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
        })),
      });
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
    instanceId?: number | null
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
    let instanceTitle: string | undefined;

    // ✅ 2. If remark provided, update LeadMaster
    if (remark && remark.trim() !== "") {
      if (instanceId) {
        const instance =
          await prisma.leadProductStructureInstance.findFirst({
            where: {
              id: instanceId,
              lead_id: leadId,
              vendor_id: vendorId,
            },
            select: { id: true, title: true },
          });

        if (!instance) {
          throw new Error("Product structure instance not found for this lead");
        }

        instanceTitle = instance.title ?? undefined;

        await prisma.leadProductStructureInstance.update({
          where: { id: instanceId },
          data: {
            hardware_packing_details_remark: remark,
            updated_by: userId,
            updated_at: new Date(),
          },
        });

        const remaining = await prisma.leadProductStructureInstance.count({
          where: {
            lead_id: leadId,
            vendor_id: vendorId,
            OR: [
              { hardware_packing_details_remark: null },
              { hardware_packing_details_remark: "" },
            ],
          },
        });

        if (remaining === 0) {
          await prisma.leadMaster.update({
            where: { id: leadId },
            data: {
              hardware_packing_details_remark:
                "hardware packing details added",
              updated_by: userId,
              updated_at: new Date(),
            },
          });
        }
      }

      // Log the remark update
      if (accountId) {
        await prisma.leadDetailedLogs.create({
          data: {
            vendor_id: vendorId,
            lead_id: leadId,
            account_id: accountId,
            action: `Hardware Packing Details remark added/updated${instanceTitle ? ` for instance "${instanceTitle}"` : ""}: "${remark}"`,
            action_type: "UPDATE",
            created_by: userId,
          },
        });
      }
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
            product_structure_instance_id:
              typeof instanceId !== "undefined" ? instanceId : null,
          },
        });

        uploadedDocs.push(doc);
      }

      if (accountId) {
        if (instanceId && !instanceTitle) {
          const inst = await prisma.leadProductStructureInstance.findFirst({
            where: { id: instanceId, lead_id: leadId, vendor_id: vendorId },
            select: { title: true },
          });
          instanceTitle = inst?.title ?? undefined;
        }

        const detailedLog = await prisma.leadDetailedLogs.create({
          data: {
            vendor_id: vendorId,
            lead_id: leadId,
            account_id: accountId,
            action: `Hardware Packing Details files uploaded: ${files.length} file(s)${instanceTitle ? ` for instance "${instanceTitle}"` : ""}`,
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
          })),
        });
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
    instanceId?: number | null
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
    let instanceTitle: string | undefined;

    if (remark && remark.trim() !== "") {
      if (instanceId) {
        const instance =
          await prisma.leadProductStructureInstance.findFirst({
            where: {
              id: instanceId,
              lead_id: leadId,
              vendor_id: vendorId,
            },
            select: { id: true, title: true },
          });

        if (!instance) {
          throw new Error("Product structure instance not found for this lead");
        }

        instanceTitle = instance.title ?? undefined;

        await prisma.leadProductStructureInstance.update({
          where: { id: instanceId },
          data: {
            woodwork_packing_details_remark: remark,
            updated_by: userId,
            updated_at: new Date(),
          },
        });

        const remaining = await prisma.leadProductStructureInstance.count({
          where: {
            lead_id: leadId,
            vendor_id: vendorId,
            OR: [
              { woodwork_packing_details_remark: null },
              { woodwork_packing_details_remark: "" },
            ],
          },
        });

        if (remaining === 0) {
          await prisma.leadMaster.update({
            where: { id: leadId },
            data: {
              woodwork_packing_details_remark:
                "woodwork packing details added",
              updated_by: userId,
              updated_at: new Date(),
            },
          });
        }
      }

      if (accountId) {
        await prisma.leadDetailedLogs.create({
          data: {
            vendor_id: vendorId,
            lead_id: leadId,
            account_id: accountId,
            action: instanceTitle
              ? `Woodwork Packing Details remark added/updated for instance "${instanceTitle}": "${remark}"`
              : `Woodwork Packing Details remark added/updated: "${remark}"`,
            action_type: "UPDATE",
            created_by: userId,
          },
        });
      }
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
            product_structure_instance_id:
              typeof instanceId !== "undefined" ? instanceId : null,
          },
        });

        uploadedDocs.push(doc);
      }

      if (accountId) {
        if (instanceId && !instanceTitle) {
          const inst = await prisma.leadProductStructureInstance.findFirst({
            where: { id: instanceId, lead_id: leadId, vendor_id: vendorId },
            select: { title: true },
          });
          instanceTitle = inst?.title ?? undefined;
        }

        const detailedLog = await prisma.leadDetailedLogs.create({
          data: {
            vendor_id: vendorId,
            lead_id: leadId,
            account_id: accountId,
            action: `Woodwork Packing Details files uploaded: ${files.length} file(s)${instanceTitle ? ` for instance "${instanceTitle}"` : ""}`,
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
          })),
        });
      }
    }

    return {
      remark_updated: remark && remark.trim() !== "",
      files_uploaded: uploadedDocs.length,
      uploaded_docs: uploadedDocs,
    };
  }

  // ✅ 1. GET QC Photos
  async getQcPhotos(
    vendorId: number,
    leadId: number,
    instanceId?: number | null
  ) {
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
        ...(typeof instanceId !== "undefined"
          ? { product_structure_instance_id: instanceId ?? null }
          : {}),
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
  async getHardwarePackingDetails(
    vendorId: number,
    leadId: number,
    instanceId?: number | null
  ) {
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
        ...(typeof instanceId !== "undefined"
          ? { product_structure_instance_id: instanceId ?? null }
          : {}),
      },
      orderBy: { created_at: "asc" },
    });

    const withUrls = await Promise.all(
      docs.map(async (doc) => ({
        ...doc,
        signed_url: await generateSignedUrl(doc.doc_sys_name, 3600, "inline"),
      })),
    );

    let remark: string | null = null;
    if (typeof instanceId !== "undefined") {
      const instance = await prisma.leadProductStructureInstance.findFirst({
        where: { id: instanceId ?? 0, lead_id: leadId, vendor_id: vendorId },
        select: {
          id: true,
          hardware_packing_details_remark: true,
        },
      });
      remark = instance?.hardware_packing_details_remark || null;
    } else {
      const hardwarePackingDetailsRemark = await prisma.leadMaster.findFirst({
        where: { id: leadId, vendor_id: vendorId },
        select: {
          id: true,
          firstname: true,
          lastname: true,
          hardware_packing_details_remark: true,
        },
      });
      remark =
        hardwarePackingDetailsRemark?.hardware_packing_details_remark || null;
    }

    return {
      remark,
      documents: withUrls,
    };
  }

  // ✅ 3. GET Woodwork Packing Details
  async getWoodworkPackingDetails(
    vendorId: number,
    leadId: number,
    instanceId?: number | null
  ) {
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
        ...(typeof instanceId !== "undefined"
          ? { product_structure_instance_id: instanceId ?? null }
          : {}),
      },
      orderBy: { created_at: "asc" },
    });

    const withUrls = await Promise.all(
      docs.map(async (doc) => ({
        ...doc,
        signed_url: await generateSignedUrl(doc.doc_sys_name, 3600, "inline"),
      })),
    );

    let remark: string | null = null;
    if (typeof instanceId !== "undefined") {
      const instance = await prisma.leadProductStructureInstance.findFirst({
        where: { id: instanceId ?? 0, lead_id: leadId, vendor_id: vendorId },
        select: {
          id: true,
          woodwork_packing_details_remark: true,
        },
      });
      remark = instance?.woodwork_packing_details_remark || null;
    } else {
      const woodWorkPackingDetailsRemark = await prisma.leadMaster.findFirst({
        where: { id: leadId, vendor_id: vendorId },
        select: {
          id: true,
          firstname: true,
          lastname: true,
          woodwork_packing_details_remark: true,
        },
      });
      remark =
        woodWorkPackingDetailsRemark?.woodwork_packing_details_remark || null;
    }

    return {
      remark,
      documents: withUrls,
    };
  }

  async updateNoOfBoxes(
    vendorId: number,
    leadId: number,
    accountId: number | null,
    userId: number,
    noOfBoxes: number,
    instanceId?: number | null
  ) {
    if (instanceId) {
      const instance = await prisma.leadProductStructureInstance.findFirst({
        where: {
          id: instanceId,
          lead_id: leadId,
          vendor_id: vendorId,
        },
        select: { id: true, title: true, no_of_boxes: true },
      });

      if (!instance) {
        throw Object.assign(
          new Error("Product structure instance not found for this lead"),
          {
            statusCode: 404,
          }
        );
      }

      const updatedInstance = await prisma.leadProductStructureInstance.update({
        where: { id: instanceId },
        data: {
          no_of_boxes: noOfBoxes,
          updated_by: userId,
          updated_at: new Date(),
        },
        select: {
          id: true,
          no_of_boxes: true,
          updated_at: true,
        },
      });

      if (accountId) {
        await prisma.leadDetailedLogs.create({
          data: {
            vendor_id: vendorId,
            lead_id: leadId,
            account_id: accountId,
            action: `Number of boxes updated to ${noOfBoxes} for instance "${instance.title}"`,
            action_type: "UPDATE",
            created_by: userId,
          },
        });
      }

      return updatedInstance;
    }

    const lead = await prisma.leadMaster.findFirst({
      where: { id: leadId, vendor_id: vendorId, is_deleted: false },
      select: { id: true, no_of_boxes: true },
    });

    if (!lead) {
      throw Object.assign(new Error("Lead not found for this vendor"), {
        statusCode: 404,
      });
    }

    const updatedLead = await prisma.leadMaster.update({
      where: { id: leadId },
      data: {
        no_of_boxes: noOfBoxes,
        updated_by: userId,
        updated_at: new Date(),
      },
      select: {
        id: true,
        no_of_boxes: true,
        updated_at: true,
      },
    });

    // ✅ Log the update
    if (accountId) {
      await prisma.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          action: `Number of boxes updated to ${noOfBoxes}`,
          action_type: "UPDATE",
          created_by: userId,
        },
      });
    }

    return updatedLead;
  }

  // ✅ Fetch No. of Boxes
  async getNoOfBoxes(
    vendorId: number,
    leadId: number,
    instanceId?: number | null
  ) {
    if (instanceId) {
      const instance = await prisma.leadProductStructureInstance.findFirst({
        where: { id: instanceId, vendor_id: vendorId, lead_id: leadId },
        select: {
          id: true,
          no_of_boxes: true,
          updated_at: true,
        },
      });

      if (instance?.no_of_boxes != null) {
        return { ...instance, source: "instance" as const };
      }
    }

    const lead = await prisma.leadMaster.findFirst({
      where: { id: leadId, vendor_id: vendorId, is_deleted: false },
      select: {
        id: true,
        no_of_boxes: true,
        updated_at: true,
      },
    });

    return lead ? { ...lead, source: "lead" as const } : null;
  }

  // ✅ Check Post-Production Completeness
  async checkPostProductionCompleteness(
    vendorId: number,
    leadId: number,
    instanceId?: number | null
  ) {
    const instances = await prisma.leadProductStructureInstance.findMany({
      where: { lead_id: leadId, vendor_id: vendorId },
      select: {
        id: true,
        title: true,
        is_production_completed: true,
        no_of_boxes: true,
      },
    });

    const incompleteProduction = instances.filter(
      (instance) => instance.is_production_completed !== true
    );
    const incompleteBoxes = instances.filter(
      (instance) => !instance.no_of_boxes || instance.no_of_boxes <= 0
    );

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
          ...(typeof instanceId !== "undefined"
            ? { product_structure_instance_id: instanceId ?? null }
            : {}),
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
          ...(typeof instanceId !== "undefined"
            ? { product_structure_instance_id: instanceId ?? null }
            : {}),
        },
      });
      hardwareDocsExist = hardwareCount > 0;

      if (typeof instanceId !== "undefined") {
        const instance = await prisma.leadProductStructureInstance.findFirst({
          where: { id: instanceId ?? 0, lead_id: leadId, vendor_id: vendorId },
          select: { id: true, hardware_packing_details_remark: true },
        });
        hardwareRemarkExist = !!instance?.hardware_packing_details_remark;
      } else {
        const hardwareRemark = await prisma.leadMaster.findFirst({
          where: { id: leadId, vendor_id: vendorId },
          select: { hardware_packing_details_remark: true },
        });
        hardwareRemarkExist = !!hardwareRemark?.hardware_packing_details_remark;
      }
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
          ...(typeof instanceId !== "undefined"
            ? { product_structure_instance_id: instanceId ?? null }
            : {}),
        },
      });
      woodworkDocsExist = woodworkCount > 0;

      if (typeof instanceId !== "undefined") {
        const instance = await prisma.leadProductStructureInstance.findFirst({
          where: { id: instanceId ?? 0, lead_id: leadId, vendor_id: vendorId },
          select: { id: true, woodwork_packing_details_remark: true },
        });
        woodworkRemarkExist = !!instance?.woodwork_packing_details_remark;
      } else {
        const woodworkRemark = await prisma.leadMaster.findFirst({
          where: { id: leadId, vendor_id: vendorId },
          select: { woodwork_packing_details_remark: true },
        });
        woodworkRemarkExist = !!woodworkRemark?.woodwork_packing_details_remark;
      }
    }

    // 🧾 Return Combined Result
    return {
      qc_photos: qcPhotosExist,
      hardware_docs: hardwareDocsExist,
      hardware_remark: hardwareRemarkExist,
      woodwork_docs: woodworkDocsExist,
      woodwork_remark: woodworkRemarkExist,
      instances_ready: incompleteProduction.length === 0,
      boxes_ready: incompleteBoxes.length === 0,
      missing_production_titles: incompleteProduction.map(
        (instance) => instance.title
      ),
      missing_boxes_titles: incompleteBoxes.map((instance) => instance.title),
      all_exists: qcPhotosExist && hardwareDocsExist && woodworkDocsExist,
    };
  }

  async uploadPreProductionFiles(
    vendorId: number,
    leadId: number,
    accountId: number | null,
    userId: number,
    files: { originalName: string; sysName: string }[],
    instanceId?: number | null
  ) {
    const docType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 38" },
    });

    if (!docType)
      throw Object.assign(
        new Error("Document type (Type 38) not found for this vendor"),
        { statusCode: 404 },
      );

    const uploadedDocs = [];

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
          product_structure_instance_id:
            typeof instanceId !== "undefined" ? instanceId : null,
        },
      });
      uploadedDocs.push(doc);
    }

    if (accountId) {
      let instanceTitle: string | undefined;
      if (instanceId) {
        const inst = await prisma.leadProductStructureInstance.findFirst({
          where: { id: instanceId, lead_id: leadId, vendor_id: vendorId },
          select: { title: true },
        });
        instanceTitle = inst?.title ?? undefined;
      }

      const detailedLog = await prisma.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          action: `Pre-production files uploaded: ${files.length} file(s)${instanceTitle ? ` for instance "${instanceTitle}"` : ""}`,
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
        })),
      });
    }

    return uploadedDocs;
  }

  async markPreProdDone(
    vendorId: number,
    leadId: number,
    instanceId: number,
    userId: number,
  ) {
    const instance = await prisma.leadProductStructureInstance.findFirst({
      where: { id: instanceId, lead_id: leadId, vendor_id: vendorId },
      select: { id: true, is_pre_prod_done: true, is_order_login_filled: true },
    });

    if (!instance) {
      throw Object.assign(new Error("Instance not found"), { statusCode: 404 });
    }

    if (instance.is_pre_prod_done) {
      throw Object.assign(new Error("Pre-prod already marked as done"), { statusCode: 400 });
    }

    await prisma.leadProductStructureInstance.update({
      where: { id: instanceId },
      data: {
        is_pre_prod_done: true,
        pre_prod_done_at: new Date(),
        ...(instance.is_order_login_filled === true
          ? {
              is_under_production: true,
              under_production_at: new Date(),
            }
          : {}),
      },
    });

    const leadMeta = await prisma.leadMaster.findUnique({
      where: { id: leadId },
      select: {
        account_id: true,
        franchise_id: true,
        firstname: true,
        lastname: true,
      },
    });

    const factoryMapping = await prisma.leadUserMapping.findFirst({
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
      select: { user_id: true },
    });

    if (factoryMapping?.user_id && leadMeta?.account_id) {
      const existingTask = await prisma.userLeadTask.findFirst({
        where: {
          vendor_id: vendorId,
          lead_id: leadId,
          instance_id: instanceId,
          user_id: factoryMapping.user_id,
          task_type: "Pre Prod Completed",
          status: { in: ["open", "in_progress"] },
        },
        select: { id: true },
      });

      if (!existingTask) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 1);

        await prisma.userLeadTask.create({
          data: {
            lead_id: leadId,
            account_id: leadMeta.account_id,
            vendor_id: vendorId,
            franchise_id: leadMeta.franchise_id ?? null,
            user_id: factoryMapping.user_id,
            instance_id: instanceId,
            task_type: "Pre Prod Completed",
            lead_stage: "production-stage",
            due_date: dueDate,
            remark: "Pre Prod Completed",
            status: "open",
            created_by: userId,
          },
        });
      }
    }

    return {
      instanceId,
      is_pre_prod_done: true,
      is_under_production: instance.is_order_login_filled === true,
    };
  }

  async getPreProductionFiles(
    vendorId: number,
    leadId: number,
    instanceId?: number | null
  ) {
    const docType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 38" },
    });

    if (!docType) return [];

    const docs = await prisma.leadDocuments.findMany({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        doc_type_id: docType.id,
        is_deleted: false,
        ...(typeof instanceId !== "undefined"
          ? { product_structure_instance_id: instanceId ?? null }
          : {}),
      },
      orderBy: { created_at: "asc" },
    });

    const withUrls = await Promise.all(
      docs.map(async (doc) => ({
        ...doc,
        signed_url: await generateSignedUrl(doc.doc_sys_name, 3600, "inline"),
      })),
    );

    return withUrls;
  }

  async checkPreProductionFilesReady(
    vendorId: number,
    leadId: number,
    instanceId?: number | null
  ) {
    const docType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 38" },
    });

    if (!docType) return { readyForUnderProduction: false };

    const count = await prisma.leadDocuments.count({
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

    return { readyForUnderProduction: count > 0 };
  }

  async markProductionCompleted(
    vendorId: number,
    leadId: number,
    instanceId: number,
    updatedBy: number
  ) {
    const instance = await prisma.leadProductStructureInstance.findFirst({
      where: {
        id: instanceId,
        lead_id: leadId,
        vendor_id: vendorId,
      },
      select: {
        id: true,
        title: true,
        account_id: true,
        is_production_completed: true,
      },
    });

    if (!instance) {
      throw new Error("Product structure instance not found for this lead");
    }

    const updatedInstance = await prisma.leadProductStructureInstance.update({
      where: { id: instanceId },
      data: {
        is_production_completed: true,
        production_completed_at: new Date(),
        updated_by: updatedBy,
        updated_at: new Date(),
      },
    });

    if (instance.account_id) {
      await prisma.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: instance.account_id,
          action: `Production marked as completed for instance "${instance.title}"`,
          action_type: "UPDATE",
          created_by: updatedBy,
        },
      });
    }

    return updatedInstance;
  }

  async moveLeadToReadyToDispatch(
    vendorId: number,
    leadId: number,
    updatedBy: number,
    baseUrl: string,
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

      await ensureLeadStatusLog(tx, {
        vendorId,
        leadId,
        accountId: currentLead.account_id,
        statusId: readyToDispatchStatus.id,
        createdBy: updatedBy,
      });

      // 4️⃣ Audit log
      if (currentLead.account_id) {
        await tx.leadDetailedLogs.create({
          data: {
            vendor_id: vendorId,
            lead_id: leadId,
            account_id: currentLead.account_id,
            action: "Lead moved to Ready To Dispatch stage",
            action_type: "STATUS_CHANGE",
            created_by: updatedBy,
          },
        });
      }

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
      });

      const firstInstance = await prisma.leadProductStructureInstance.findFirst({
        where: { lead_id: leadId, vendor_id: vendorId },
        select: { id: true },
        orderBy: [{ product_structure_id: "asc" }, { quantity_index: "asc" }],
      });

      const leadDetailsBase = `/dashboard/leads/details/${leadId}`;
      const rtdParams = new URLSearchParams();
      if (leadMeta.account_id) rtdParams.set("accountId", String(leadMeta.account_id));
      if (firstInstance?.id) rtdParams.set("instance_id", String(firstInstance.id));
      const rtdQs = rtdParams.toString();
      const redirectPath = rtdQs ? `${leadDetailsBase}?${rtdQs}` : leadDetailsBase;

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

    // ==========================
    // READY TO DISPATCH → ADMIN NOTIFICATION
    // ==========================

    try {
      const actorId = updatedBy; // factory user who marked dispatch ready

      const lead = await prisma.leadMaster.findUnique({
        where: { id: leadId },
        select: {
          firstname: true,
          lastname: true,
          lead_code: true,
          vendor_id: true,
          account_id: true,
          franchise_id: true,
        },
      });

      // Safety guard
      if (!lead) return result.updatedLead;

      const leadName = `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim();

      const leadCode =
        lead.lead_code ?? `LEAD-${String(leadId).padStart(4, "0")}`;

      const adminFirstInstance = await prisma.leadProductStructureInstance.findFirst({
        where: { lead_id: leadId, vendor_id: lead.vendor_id },
        select: { id: true },
        orderBy: [{ product_structure_id: "asc" }, { quantity_index: "asc" }],
      });

      const adminLeadDetailsBase = `/dashboard/leads/details/${leadId}`;
      const adminRtdParams = new URLSearchParams();
      if (lead.account_id) adminRtdParams.set("accountId", String(lead.account_id));
      if (adminFirstInstance?.id) adminRtdParams.set("instance_id", String(adminFirstInstance.id));
      const adminRtdQs = adminRtdParams.toString();
      const redirectPath = adminRtdQs ? `${adminLeadDetailsBase}?${adminRtdQs}` : adminLeadDetailsBase;

      // Fetch Active Admin Users for the lead franchise only
      const admins = await getFranchiseAdminRecipients({
        vendorId: lead.vendor_id,
        franchiseId: lead.franchise_id ?? null,
        excludeUserId: actorId,
      });

      for (const admin of admins) {
        // 🔔 In-App Notification (ADMIN)
        await NotificationService.createAndSend({
          vendor_id: lead.vendor_id,
          user_id: admin.id,
          sender_id: actorId,
          type: NotificationType.LEAD_MILESTONE,
          title: "Ready To Dispatch",
          message: `${leadCode} - ${leadName} marked Ready to Dispatch by Factory.`,
          entity_type: "lead",
          entity_id: leadId,
          redirect_url: redirectPath,
        });

      }
    } catch (adminNotifyErr: any) {
      logger.warn("⚠️ Ready To Dispatch admin notification failed", {
        leadId,
        vendorId,
        error: adminNotifyErr?.message,
      });
    }

    return result.updatedLead;
  }
}
