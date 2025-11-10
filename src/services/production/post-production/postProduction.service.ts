import { prisma } from "../../../prisma/client";
import {
  generateSignedUrl,
  uploadToWasabiProductionFilesHardwarePackingDocs,
  uploadToWasabiProductionFilesQcPhotos,
  uploadToWasabiProductionFilesWoodworkPackingDocs,
} from "../../../utils/wasabiClient";

export class PostProductionService {
  async uploadQcPhotos(
    vendorId: number,
    leadId: number,
    accountId: number | null,
    userId: number,
    files: Express.Multer.File[]
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
      const sysName = await uploadToWasabiProductionFilesQcPhotos(
        file.buffer,
        vendorId,
        leadId,
        file.originalname
      );

      // 🔹 Create DB record
      const doc = await prisma.leadDocuments.create({
        data: {
          doc_og_name: file.originalname,
          doc_sys_name: sysName,
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
    files: Express.Multer.File[]
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
        const sysName = await uploadToWasabiProductionFilesHardwarePackingDocs(
          file.buffer,
          vendorId,
          leadId,
          file.originalname
        );

        const doc = await prisma.leadDocuments.create({
          data: {
            doc_og_name: file.originalname,
            doc_sys_name: sysName,
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
    files: Express.Multer.File[]
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
        const sysName = await uploadToWasabiProductionFilesWoodworkPackingDocs(
          file.buffer,
          vendorId,
          leadId,
          file.originalname
        );

        const doc = await prisma.leadDocuments.create({
          data: {
            doc_og_name: file.originalname,
            doc_sys_name: sysName,
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
        { statusCode: 404 }
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
      }))
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
        { statusCode: 404 }
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
      }))
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
        { statusCode: 404 }
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
      }))
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
    noOfBoxes: number
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
      any_exists:
        qcPhotosExist ||
        hardwareDocsExist ||
        woodworkDocsExist
    };
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
