import { prisma } from "../../../prisma/client";
import { generateSignedUrl } from "../../../utils/wasabiClient";

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
        { statusCode: 400 }
      );

    // 🔹 Get DocType for QC Photos (Type 15)
    const qcDocType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 15" },
    });

    if (!qcDocType)
      throw Object.assign(
        new Error("Document type (Type 15) not found for this vendor"),
        { statusCode: 404 }
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
        }
      );

    const uploadedDocs = [];

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
            product_structure_instance_id:
              typeof instanceId !== "undefined" ? instanceId : null,
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
        }
      );

    const uploadedDocs = [];

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

      await prisma.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId ?? 0,
          action: instanceId
            ? `Woodwork Packing Details Remark added/updated for instance ${instanceId}: "${remark}"`
            : `Woodwork Packing Details Remark added/updated: "${remark}"`,
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
            product_structure_instance_id:
              typeof instanceId !== "undefined" ? instanceId : null,
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
        { statusCode: 404 }
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
      }))
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
        { statusCode: 404 }
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
      }))
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
        { statusCode: 404 }
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
      }))
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
        select: { id: true, no_of_boxes: true },
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

      await prisma.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId ?? 0,
          action: `Number of Boxes updated to ${noOfBoxes} for instance ${instanceId}`,
          action_type: "UPDATE",
          created_by: userId,
          created_at: new Date(),
        },
      });

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
      all_exists:
        qcPhotosExist &&
        hardwareDocsExist &&
        woodworkDocsExist
    };
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

    await prisma.leadDetailedLogs.create({
      data: {
        vendor_id: vendorId,
        lead_id: leadId,
        account_id: instance.account_id ?? 0,
        action: `Production completed for instance ${instance.title}`,
        action_type: "UPDATE",
        created_by: updatedBy,
        created_at: new Date(),
      },
    });

    return updatedInstance;
  }

  async moveLeadToReadyToDispatch(
    vendorId: number,
    leadId: number,
    updatedBy: number
  ) {
    // 1️⃣ Get Ready To Dispatch status
    const readyToDispatchStatus = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 11" },
      select: { id: true },
    });

    if (!readyToDispatchStatus) {
      throw new Error(
        `Ready To Dispatch status (Type 11) not found for vendor ${vendorId}`
      );
    }

    // 2️⃣ Validate the lead exists in Production stage (Type 10)
    const currentLead = await prisma.leadMaster.findFirst({
      where: { id: leadId, vendor_id: vendorId, is_deleted: false },
      select: { id: true, status_id: true, account_id: true },
    });

    if (!currentLead) {
      throw new Error(`Lead ${leadId} not found for vendor ${vendorId}`);
    }

    // 3️⃣ Update status to Ready To Dispatch
    const updatedLead = await prisma.leadMaster.update({
      where: { id: leadId },
      data: {
        status_id: readyToDispatchStatus.id,
        updated_by: updatedBy,
      },
    });

    // 4️⃣ Log transition
    await prisma.leadDetailedLogs.create({
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

    return updatedLead;
  }
}
