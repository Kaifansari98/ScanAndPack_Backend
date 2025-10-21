import { Request, Response } from "express";
import { validationResult } from "express-validator";
import { ApiResponse } from "../../../utils/apiResponse";
import { DesigingStage } from "../../../services/leadModuleServices/desigingStage/designing-stage.service";
import { prisma } from "../../../prisma/client";
import {
  generateSignedUrl,
  uploadToWasabi,
  uploadToWasabiMeetingDocs,
  uploadToWasabStage1Desings,
} from "../../../utils/wasabiClient";

export class DesigingStageController {
  public static async addToDesigingStage(req: Request, res: Response) {
    try {
      // ✅ Validate
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json(
            ApiResponse.validationError(errors.array().map((err) => err.msg))
          );
      }

      const { lead_id, user_id, vendor_id } = req.body;

      const result = await DesigingStage.addToDesigingStage(
        Number(lead_id),
        Number(user_id),
        Number(vendor_id)
      );

      return res
        .status(200)
        .json(
          ApiResponse.success(
            result,
            "Lead status updated to 3 and log created"
          )
        );
    } catch (error: any) {
      if (error.message.includes("Unauthorized")) {
        return res.status(401).json(ApiResponse.unauthorized(error.message));
      }
      if (error.message.includes("not found")) {
        return res.status(404).json(ApiResponse.notFound(error.message));
      }
      return res.status(500).json(ApiResponse.error(error.message));
    }
  }

  public static async getLeadsByStatus(req: Request, res: Response) {
    try {
      const { vendorId } = req.params;
      const { page = "1", limit = "10", userId } = req.query;

      if (!vendorId || !userId) {
        return res
          .status(400)
          .json(
            ApiResponse.validationError("vendorId and userId are required")
          );
      }

      const result = await DesigingStage.getLeadsByStatus(
        Number(vendorId),
        Number(userId),
        Number(page),
        Number(limit)
      );

      return res
        .status(200)
        .json(ApiResponse.success(result, "Leads fetched successfully"));
    } catch (error: any) {
      return res.status(500).json(ApiResponse.error(error.message));
    }
  }

  public static async upload(req: Request, res: Response) {
    try {
      const { vendorId, leadId, userId, accountId } = req.body;

      if (
        !req.files ||
        !(req.files instanceof Array) ||
        req.files.length === 0
      ) {
        return res
          .status(400)
          .json({ success: false, message: "At least one file is required" });
      }

      const buffers = (req.files as Express.Multer.File[]).map((f) => f.buffer);
      const originalNames = (req.files as Express.Multer.File[]).map(
        (f) => f.originalname
      );

      const docs = await DesigingStage.uploadQuotation({
        fileBuffer: buffers, // now array of Buffers
        originalName: originalNames, // now array of strings
        vendorId: Number(vendorId),
        leadId: Number(leadId),
        userId: Number(userId),
        accountId: Number(accountId),
      });

      res.json({
        success: true,
        message: `${docs.length} quotation${
          docs.length > 1 ? "s" : ""
        } uploaded successfully`,
        documents: docs,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async getDesignQuotationDocuments(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
          logs: ["Missing required parameters: vendorId and leadId"],
        });
      }

      const logs: any[] = [];

      // 1️⃣ Validate lead exists and belongs to vendor
      const lead = await prisma.leadMaster.findFirst({
        where: {
          id: Number(leadId),
          vendor_id: Number(vendorId),
          is_deleted: false,
        },
      });

      if (!lead) {
        return res.status(404).json({
          success: false,
          message: "Lead not found or access denied",
          logs: [
            "Lead verification failed: Lead not found or doesn't belong to vendor",
          ],
        });
      }
      logs.push("Lead verified successfully");

      // 2️⃣ Find the document type for "design-quotation"
      const designQuotationDocType = await prisma.documentTypeMaster.findFirst({
        where: {
          vendor_id: Number(vendorId),
          tag: "Type 5",
        },
      });

      if (!designQuotationDocType) {
        return res.status(404).json({
          success: false,
          message: "Design quotation document type not found for this vendor",
          logs: ["Document type 'design-quotation' not found for vendor"],
        });
      }
      logs.push("Design quotation document type found");

      // 3️⃣ Fetch all design-quotation documents for the lead
      const documents = await prisma.leadDocuments.findMany({
        where: {
          lead_id: Number(leadId),
          vendor_id: Number(vendorId),
          doc_type_id: designQuotationDocType.id,
          is_deleted: false,
        },
        orderBy: { created_at: "desc" },
        include: {
          documentType: {
            select: {
              id: true,
              type: true,
              tag: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              user_name: true,
              user_email: true,
              user_contact: true,
            },
          },
          deletedBy: {
            select: {
              id: true,
              user_name: true,
              user_email: true,
            },
          },
        },
      });

      // 4️⃣ Generate signed URLs for documents
      const documentsWithSignedUrls = await Promise.all(
        documents.map(async (doc: any) => {
          const signedUrl = await generateSignedUrl(doc.doc_sys_name);
          return {
            ...doc,
            signedUrl,
          };
        })
      );

      logs.push(
        `Found ${documents.length} design quotation documents for lead ${leadId}`
      );

      return res.status(200).json({
        success: true,
        message: "Design quotation documents fetched successfully",
        logs,
        data: {
          lead_id: Number(leadId),
          vendor_id: Number(vendorId),
          document_type: designQuotationDocType.type,
          total_documents: documents.length,
          documents: documentsWithSignedUrls,
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        logs: [error.message],
      });
    }
  }

  public static async getDesignStageDocuments(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
          logs: ["Missing required parameters: vendorId and leadId"],
        });
      }

      const logs: any[] = [];

      // 1️⃣ Validate lead exists and belongs to vendor
      const lead = await prisma.leadMaster.findFirst({
        where: {
          id: Number(leadId),
          vendor_id: Number(vendorId),
          is_deleted: false,
        },
        include: { statusType: true },
      });

      if (!lead) {
        return res.status(404).json({
          success: false,
          message: "Lead not found or access denied",
          logs: [
            "Lead verification failed: Lead not found or doesn't belong to vendor",
          ],
        });
      }
      logs.push("Lead verified successfully");

      const leadStage = lead?.statusType?.type || "Unknown Stage";

      // 2️⃣ Find the document type for "design-quotation"
      const designType = await prisma.documentTypeMaster.findFirst({
        where: {
          vendor_id: Number(vendorId),
          tag: "Type 6",
        },
      });

      if (!designType) {
        return res.status(404).json({
          success: false,
          message: "Design document type not found for this vendor",
          logs: ["Document type 'stage-1-design' not found for vendor"],
        });
      }
      logs.push("stage-1-design document type found");

      // 3️⃣ Fetch all design-quotation documents for the lead
      const documents = await prisma.leadDocuments.findMany({
        where: {
          lead_id: Number(leadId),
          vendor_id: Number(vendorId),
          doc_type_id: designType.id,
          is_deleted: false,
        },
        orderBy: { created_at: "desc" },
        include: {
          documentType: {
            select: {
              id: true,
              type: true,
              tag: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              user_name: true,
              user_email: true,
              user_contact: true,
            },
          },
          deletedBy: {
            select: {
              id: true,
              user_name: true,
              user_email: true,
            },
          },
        },
      });

      // 4️⃣ Generate signed URLs for documents
      const documentsWithSignedUrls = await Promise.all(
        documents.map(async (doc: any) => {
          const signedUrl = await generateSignedUrl(doc.doc_sys_name);
          return {
            ...doc,
            signedUrl,
          };
        })
      );

      logs.push(
        `Found ${documents.length} design quotation documents for lead ${leadId}`
      );

      return res.status(200).json({
        success: true,
        message: "Design quotation documents fetched successfully",
        logs,
        data: {
          lead_id: Number(leadId),
          vendor_id: Number(vendorId),
          document_type: designType.type,
          total_documents: documents.length,
          documents: documentsWithSignedUrls,
          leadStage: lead?.statusType?.type || "Unknown Stage",
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        logs: [error.message],
      });
    }
  }

  public static async addDesignMeeting(req: Request, res: Response) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, logs: errors.array() });
      }

      const { leadId, vendorId, userId, accountId, date, desc } = req.body;
      const logs: any[] = [];
      const files = (req.files as Express.Multer.File[]) || [];

      // 1️⃣ Verify user belongs to vendor
      const user = await prisma.userMaster.findFirst({
        where: { id: Number(userId), vendor_id: Number(vendorId) },
      });
      if (!user)
        return res
          .status(401)
          .json({ success: false, logs: ["Unauthorized: User not in vendor"] });
      logs.push("User verified");

      // 2️⃣ Check lead existence
      const lead = await prisma.leadMaster.findFirst({
        where: {
          id: Number(leadId),
          vendor_id: Number(vendorId),
          is_deleted: false,
        },
      });
      if (!lead)
        return res
          .status(404)
          .json({ success: false, logs: ["Lead not found"] });
      logs.push("Lead verified");

      // 3️⃣ Create Design Meeting entry
      const meeting = await prisma.leadDesignMeeting.create({
        data: {
          lead_id: Number(leadId),
          account_id: Number(accountId),
          vendor_id: Number(vendorId),
          date: new Date(date),
          desc,
          created_by: Number(userId),
        },
      });
      logs.push({ meetingCreated: meeting });

      const documents: any[] = [];
      const mapping: any[] = [];

      // 4️⃣ Upload documents (if any)
      if (files.length > 0) {
        for (const file of files) {
          const sysName = await uploadToWasabiMeetingDocs(
            file.buffer,
            Number(vendorId),
            Number(leadId),
            file.originalname
          );
          logs.push({ fileUploaded: file.originalname, sysName });

          const meetingDocType = await prisma.documentTypeMaster.findFirst({
            where: { vendor_id: Number(vendorId), tag: "Type 7" },
          });

          if (!meetingDocType) {
            return res.status(404).json({
              success: false,
              message:
                "Document type for meeting documents (Type 7) not found for this vendor",
            });
          }

          const doc = await prisma.leadDocuments.create({
            data: {
              doc_og_name: file.originalname,
              doc_sys_name: sysName,
              vendor_id: Number(vendorId),
              lead_id: Number(leadId),
              account_id: Number(accountId),
              doc_type_id: meetingDocType.id,
              created_by: Number(userId),
            },
          });
          documents.push(doc);
          logs.push({ documentCreated: doc });

          const map = await prisma.leadDesignMeetingDocumentsMapping.create({
            data: {
              lead_id: Number(leadId),
              account_id: Number(accountId),
              vendor_id: Number(vendorId),
              meeting_id: meeting.id,
              document_id: doc.id,
              created_at: new Date(),
              created_by: Number(userId),
            },
          });
          mapping.push(map);
          logs.push({ mappingCreated: map });
        }
      } else {
        logs.push("No files uploaded");
      }

      // 5️⃣ Create LeadDetailedLogs entry
      const formattedDate = new Date(date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      const actionMessage = `Meeting scheduled on ${formattedDate} has been added successfully.`;
      const remarkText = desc || "No description provided.";

      const detailedLog = await prisma.leadDetailedLogs.create({
        data: {
          vendor_id: Number(vendorId),
          lead_id: Number(leadId),
          account_id: Number(accountId),
          action: actionMessage,
          action_type: "CREATE",
          created_by: Number(userId),
          created_at: new Date(),
        },
      });

      logs.push({ leadDetailedLogCreated: detailedLog });

      // 6️⃣ Create LeadDocumentLogs (only if files were uploaded)
      if (documents.length > 0) {
        const docLogsData = documents.map((doc) => ({
          vendor_id: Number(vendorId),
          lead_id: Number(leadId),
          account_id: Number(accountId),
          doc_id: doc.id,
          lead_logs_id: detailedLog.id,
          created_by: Number(userId),
          created_at: new Date(),
        }));

        await prisma.leadDocumentLogs.createMany({ data: docLogsData });
        logs.push("LeadDocumentLogs created");
      }

      return res.status(201).json({
        success: true,
        logs,
        meeting,
        documents,
        mapping,
        message: "Meeting created and logged successfully",
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, logs: [error.message] });
    }
  }

  public static async addMeetingDocs(req: Request, res: Response) {
    try {
      const { vendorId, leadId, userId, accountId, meetingId } = req.body;
      const files = req.files as Express.Multer.File[];

      if (!meetingId)
        return res
          .status(400)
          .json({ success: false, message: "meetingId is required" });

      if (!files || files.length === 0)
        return res
          .status(400)
          .json({ success: false, message: "No files uploaded" });

      // ✅ 1. Check meeting exists
      const meeting = await prisma.leadDesignMeeting.findFirst({
        where: { id: Number(meetingId), vendor_id: Number(vendorId) },
      });
      if (!meeting)
        return res
          .status(404)
          .json({ success: false, message: "Meeting not found" });

      const meetingDocType = await prisma.documentTypeMaster.findFirst({
        where: { vendor_id: Number(vendorId), tag: "Type 7" },
      });

      if (!meetingDocType) {
        return res.status(404).json({
          success: false,
          message:
            "Document type for meeting documents (Type 7) not found for this vendor",
        });
      }

      // ✅ 2. Upload and save docs
      const uploadedDocs = [];
      for (const file of files) {
        const sysName = await uploadToWasabiMeetingDocs(
          file.buffer,
          Number(vendorId),
          Number(leadId),
          file.originalname
        );

        const doc = await prisma.leadDocuments.create({
          data: {
            doc_og_name: file.originalname,
            doc_sys_name: sysName,
            vendor_id: Number(vendorId),
            lead_id: Number(leadId),
            account_id: Number(accountId),
            doc_type_id: meetingDocType.id /* Type 7 - Meeting Doc */,
            created_by: Number(userId),
          },
        });

        uploadedDocs.push(doc);

        await prisma.leadDesignMeetingDocumentsMapping.create({
          data: {
            vendor_id: Number(vendorId),
            lead_id: Number(leadId),
            account_id: Number(accountId),
            meeting_id: Number(meetingId),
            document_id: doc.id,
            created_by: Number(userId),
            created_at: new Date(),
          },
        });
      }

      // ✅ 3. Log into LeadDetailedLogs
      const actionMsg = `${uploadedDocs.length} meeting file(s) added`;
      const logEntry = await prisma.leadDetailedLogs.create({
        data: {
          vendor_id: Number(vendorId),
          lead_id: Number(leadId),
          account_id: Number(accountId),
          action: actionMsg,
          action_type: "UPDATE",
          created_by: Number(userId),
          created_at: new Date(),
        },
      });

      // ✅ 4. Link documents to logs
      await prisma.leadDocumentLogs.createMany({
        data: uploadedDocs.map((doc) => ({
          vendor_id: Number(vendorId),
          lead_id: Number(leadId),
          account_id: Number(accountId),
          doc_id: doc.id,
          lead_logs_id: logEntry.id,
          created_by: Number(userId),
          created_at: new Date(),
        })),
      });

      return res.status(201).json({
        success: true,
        message: "Files added to meeting successfully",
        uploadedDocs,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async getDesignMeetings(req: Request, res: Response) {
    try {
      const { leadId, vendorId } = req.params;

      if (!leadId || !vendorId) {
        return res.status(400).json({
          success: false,
          logs: ["leadId and vendorId are required"],
        });
      }

      const meetings = await prisma.leadDesignMeeting.findMany({
        where: {
          lead_id: Number(leadId),
          vendor_id: Number(vendorId),
        },
        include: {
          designMeetingDocsMapping: true,
        },
        orderBy: { created_at: "desc" },
      });

      // Attach signed URLs to documents
      const meetingsWithUrls = await Promise.all(
        meetings.map(async (meeting: any) => {
          const mappings = (meeting as any).designMeetingDocsMapping as any[];
          const docsWithUrls = await Promise.all(
            mappings.map(async (map: any) => {
              const document = await prisma.leadDocuments.findUnique({
                where: { id: map.document_id },
              });
              const signedUrl = document
                ? await generateSignedUrl(document.doc_sys_name, 3600, "inline") // 👈 always inline
                : null;

              return {
                ...map,
                document: document ? { ...document, signedUrl } : null,
              };
            })
          );

          return {
            ...meeting,
            designMeetingDocsMapping: docsWithUrls,
          };
        })
      );

      return res.status(200).json({
        success: true,
        logs: [`Fetched ${meetings.length} meetings for lead ${leadId}`],
        meetings: meetingsWithUrls,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        logs: [error.message],
      });
    }
  }

  public static async uploadDesigns(req: Request, res: Response) {
    try {
      const { vendorId, leadId, userId, accountId } = req.body;

      if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
        return res
          .status(400)
          .json({ success: false, message: "At least one file is required" });
      }

      const files = req.files as Express.Multer.File[];
      const uploadedDocs: any[] = [];

      // ✅ Validate vendor & account existence
      const account = await prisma.accountMaster.findUnique({
        where: { id: Number(accountId) },
      });

      if (!account) {
        return res.status(400).json({
          success: false,
          message: `Invalid account_id: ${accountId}`,
        });
      }

      const designDocType = await prisma.documentTypeMaster.findFirst({
        where: {
          vendor_id: Number(vendorId),
          tag: "Type 6", // Type 6 = Design documents
        },
      });

      if (!designDocType) {
        return res.status(404).json({
          success: false,
          message:
            "Document type for designs (Type 6) not found for this vendor",
        });
      }

      // ✅ Upload and save each file
      for (const file of files) {
        const sysName = await uploadToWasabStage1Desings(
          file.buffer,
          Number(vendorId),
          Number(leadId),
          file.originalname
        );

        const doc = await prisma.leadDocuments.create({
          data: {
            doc_og_name: file.originalname,
            doc_sys_name: sysName,
            vendor_id: Number(vendorId),
            lead_id: Number(leadId),
            account_id: Number(accountId),
            doc_type_id: designDocType.id,
            created_by: Number(userId),
          },
        });

        uploadedDocs.push(doc);
      }

      // ✅ Step 2: Log entry in LeadDetailedLogs
      const count = uploadedDocs.length;
      const plural = count > 1 ? "Designs have" : "Design has";
      const actionMessage = `${count} ${plural} been added successfully.`;

      const detailedLog = await prisma.leadDetailedLogs.create({
        data: {
          vendor_id: Number(vendorId),
          lead_id: Number(leadId),
          account_id: Number(accountId),
          action: actionMessage,
          action_type: "CREATE",
          created_by: Number(userId),
          created_at: new Date(),
        },
      });

      // ✅ Step 3: Link uploaded docs → LeadDocumentLogs
      const docLogsData = uploadedDocs.map((doc) => ({
        vendor_id: Number(vendorId),
        lead_id: Number(leadId),
        account_id: Number(accountId),
        doc_id: doc.id,
        lead_logs_id: detailedLog.id,
        created_by: Number(userId),
        created_at: new Date(),
      }));

      if (docLogsData.length > 0) {
        await prisma.leadDocumentLogs.createMany({ data: docLogsData });
      }

      // ✅ Step 4: Return success response
      return res.status(201).json({
        success: true,
        message: actionMessage,
        documents: uploadedDocs,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async editDesignMeeting(req: Request, res: Response) {
    try {
      const { meetingId } = req.params;
      const { vendorId, userId, date, desc } = req.body;

      if (!meetingId) {
        return res.status(400).json({
          success: false,
          message: "Meeting ID is required",
        });
      }

      if (!vendorId || !userId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and userId are required",
        });
      }

      // At least one field should be provided for update
      if (
        !date &&
        !desc &&
        (!req.files || (req.files as Express.Multer.File[]).length === 0)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "At least one field (date, desc, or files) must be provided for update",
        });
      }

      const files = (req.files as Express.Multer.File[]) || [];
      const logs: any = [];

      // 1️⃣ Check user belongs to vendor
      const user = await prisma.userMaster.findFirst({
        where: { id: Number(userId), vendor_id: Number(vendorId) },
      });
      if (!user) {
        return res.status(401).json({
          success: false,
          logs: ["Unauthorized: User not in vendor"],
        });
      }
      logs.push("User verified");

      // 2️⃣ Check meeting exists and belongs to vendor
      const existingMeeting = await prisma.leadDesignMeeting.findFirst({
        where: {
          id: Number(meetingId),
          vendor_id: Number(vendorId),
        },
      });

      if (!existingMeeting) {
        return res.status(404).json({
          success: false,
          logs: ["Design meeting not found or access denied"],
        });
      }
      logs.push("Meeting verified");

      // 3️⃣ Prepare update data
      const updateData: any = {
        updated_by: Number(userId),
        updated_at: new Date(),
      };

      if (date) {
        updateData.date = new Date(date);
      }

      if (desc) {
        updateData.desc = desc;
      }

      // 4️⃣ Update the meeting
      const updatedMeeting = await prisma.leadDesignMeeting.update({
        where: { id: Number(meetingId) },
        data: updateData,
      });
      logs.push({ meetingUpdated: updatedMeeting });

      const newDocuments: any[] = [];
      const newMappings: any[] = [];

      // 5️⃣ Upload new files if provided
      if (files.length > 0) {
        for (const file of files) {
          // Upload to Wasabi
          const sysName = await uploadToWasabiMeetingDocs(
            file.buffer,
            Number(vendorId),
            existingMeeting.lead_id,
            file.originalname
          );
          logs.push({ fileUploaded: file.originalname, sysName });

          // Create LeadDocument
          const doc = await prisma.leadDocuments.create({
            data: {
              doc_og_name: file.originalname,
              doc_sys_name: sysName,
              vendor_id: Number(vendorId),
              lead_id: existingMeeting.lead_id,
              account_id: existingMeeting.account_id,
              doc_type_id: 5, // design quotation
              created_by: Number(userId),
            },
          });
          newDocuments.push(doc);
          logs.push({ documentCreated: doc });

          // Create DesignMeetingDocumentsMapping
          const mapping = await prisma.leadDesignMeetingDocumentsMapping.create(
            {
              data: {
                lead_id: existingMeeting.lead_id,
                account_id: existingMeeting.account_id,
                vendor_id: Number(vendorId),
                meeting_id: Number(meetingId),
                document_id: doc.id,
                created_at: new Date(),
                created_by: Number(userId),
              },
            }
          );
          newMappings.push(mapping);
          logs.push({ mappingCreated: mapping });
        }
      }

      return res.status(200).json({
        success: true,
        message: "Design meeting updated successfully",
        logs,
        updatedMeeting,
        newDocuments,
        newMappings,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        logs: [error.message],
      });
    }
  }

  public static async getLeadById(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;

      if (!vendorId || !leadId) {
        return res
          .status(400)
          .json(
            ApiResponse.validationError("vendorId and leadId are required")
          );
      }

      const lead = await DesigingStage.getLeadById(
        Number(vendorId),
        Number(leadId)
      );

      if (!lead) {
        return res.status(404).json(ApiResponse.notFound("Lead not found"));
      }

      return res
        .status(200)
        .json(ApiResponse.success(lead, "Lead fetched successfully"));
    } catch (error: any) {
      return res.status(500).json(ApiResponse.error(error.message));
    }
  }

  public static async createDesignSelection(req: Request, res: Response) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          logs: errors.array().map((err) => err.msg),
        });
      }

      const { lead_id, account_id, vendor_id, type, desc, created_by } =
        req.body;
      const logs: any[] = [];

      // 1️⃣ Validate user belongs to vendor
      const user = await prisma.userMaster.findFirst({
        where: { id: Number(created_by), vendor_id: Number(vendor_id) },
      });
      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: User does not belong to this vendor",
          logs: ["User verification failed"],
        });
      }
      logs.push("User verified successfully");

      // 2️⃣ Validate lead existence
      const lead = await prisma.leadMaster.findFirst({
        where: {
          id: Number(lead_id),
          vendor_id: Number(vendor_id),
          is_deleted: false,
        },
      });
      if (!lead) {
        return res.status(404).json({
          success: false,
          message: "Lead not found or access denied",
          logs: ["Lead verification failed"],
        });
      }
      logs.push("Lead verified successfully");

      // 3️⃣ Validate account existence
      const account = await prisma.accountMaster.findFirst({
        where: {
          id: Number(account_id),
          vendor_id: Number(vendor_id),
          is_deleted: false,
        },
      });
      if (!account) {
        return res.status(404).json({
          success: false,
          message: "Account not found or access denied",
          logs: ["Account verification failed"],
        });
      }
      logs.push("Account verified successfully");

      // 4️⃣ Create Design Selection Entry
      const designSelection = await prisma.leadDesignSelection.create({
        data: {
          lead_id: Number(lead_id),
          account_id: Number(account_id),
          vendor_id: Number(vendor_id),
          type,
          desc,
          created_by: Number(created_by),
        },
        include: {
          createdBy: {
            select: { id: true, user_name: true, user_email: true },
          },
          lead: {
            select: {
              id: true,
              firstname: true,
              lastname: true,
              contact_no: true,
            },
          },
          account: { select: { id: true, name: true } },
        },
      });

      logs.push("Design selection created successfully");

      // 5️⃣ Add LeadDetailedLogs entry (with remark from `desc`)
      let actionMessage = "";
      if (type.toLowerCase() === "carcas") {
        actionMessage = `Carcas has been added successfully.`;
      } else if (type.toLowerCase() === "shutter") {
        actionMessage = `Shutter has been added successfully.`;
      } else if (type.toLowerCase() === "handles") {
        actionMessage = `Handles have been added successfully.`;
      } else {
        actionMessage = `${type} has been added successfully.`;
      }

      // 👇 append remark from `desc` into the action
      if (desc && String(desc).trim() !== "") {
        actionMessage += ` — Remark: ${String(desc).trim()}`;
      }

      const detailedLog = await prisma.leadDetailedLogs.create({
        data: {
          vendor_id: Number(vendor_id),
          lead_id: Number(lead_id),
          account_id: Number(account_id),
          action: actionMessage, // includes the remark now
          action_type: "CREATE",
          created_by: Number(created_by),
          created_at: new Date(),
        },
      });

      logs.push({ leadDetailedLogCreated: detailedLog });

      // ✅ If you want to include the remark (desc) for easy access later
      // add a `remark` column to LeadDetailedLogs if not already there.
      // Example:
      // remark: remarkText

      return res.status(201).json({
        success: true,
        message: "Design selection created successfully",
        logs,
        data: designSelection,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        logs: [error.message],
      });
    }
  }

  public static async getDesignSelections(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;
      const { page = "1", limit = "10" } = req.query;

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
          logs: ["Missing required parameters"],
        });
      }

      const logs: any[] = [];
      const skip = (Number(page) - 1) * Number(limit);

      // 1️⃣ Validate lead exists and belongs to vendor
      const lead = await prisma.leadMaster.findFirst({
        where: {
          id: Number(leadId),
          vendor_id: Number(vendorId),
          is_deleted: false,
        },
      });

      if (!lead) {
        return res.status(404).json({
          success: false,
          message: "Lead not found or access denied",
          logs: ["Lead verification failed"],
        });
      }
      logs.push("Lead verified successfully");

      // 2️⃣ Fetch design selections with pagination
      const designSelections = await prisma.leadDesignSelection.findMany({
        where: {
          lead_id: Number(leadId),
          vendor_id: Number(vendorId),
        },
        skip,
        take: Number(limit),
        orderBy: { created_at: "desc" },
        include: {
          createdBy: {
            select: {
              id: true,
              user_name: true,
              user_email: true,
            },
          },
          updatedBy: {
            select: {
              id: true,
              user_name: true,
              user_email: true,
            },
          },
          lead: {
            select: {
              id: true,
              firstname: true,
              lastname: true,
              contact_no: true,
              email: true,
            },
          },
          account: {
            select: {
              id: true,
              name: true,
              contact_no: true,
              email: true,
            },
          },
        },
      });

      // 3️⃣ Get total count for pagination
      const totalCount = await prisma.leadDesignSelection.count({
        where: {
          lead_id: Number(leadId),
          vendor_id: Number(vendorId),
        },
      });

      logs.push(
        `Fetched ${designSelections.length} design selections for lead ${leadId}`
      );

      const pagination = {
        total: totalCount,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(totalCount / Number(limit)),
        hasNext: Number(page) < Math.ceil(totalCount / Number(limit)),
        hasPrev: Number(page) > 1,
      };

      return res.status(200).json({
        success: true,
        message: "Design selections fetched successfully",
        logs,
        data: designSelections,
        pagination,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        logs: [error.message],
      });
    }
  }

  public static async updateDesignSelection(req: Request, res: Response) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          logs: errors.array().map((err) => err.msg),
        });
      }

      const { id } = req.params;
      const { type, desc, updated_by } = req.body;

      const logs: any[] = [];

      // 1️⃣ Validate design selection exists
      const existingDesignSelection =
        await prisma.leadDesignSelection.findUnique({
          where: { id: Number(id) },
          include: {
            lead: { select: { id: true, vendor_id: true, account_id: true } },
            account: { select: { id: true } },
          },
        });

      if (!existingDesignSelection) {
        return res.status(404).json({
          success: false,
          message: "Design selection not found",
          logs: ["Design selection not found"],
        });
      }
      logs.push("Design selection found");

      // 2️⃣ Validate user belongs to same vendor
      const user = await prisma.userMaster.findFirst({
        where: {
          id: Number(updated_by),
          vendor_id: existingDesignSelection.vendor_id,
        },
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: User does not belong to this vendor",
          logs: ["User verification failed"],
        });
      }
      logs.push("User verified successfully");

      // 3️⃣ Update design selection
      const updatedDesignSelection = await prisma.leadDesignSelection.update({
        where: { id: Number(id) },
        data: {
          type,
          desc,
          updated_by: Number(updated_by),
          updated_at: new Date(),
        },
        include: {
          createdBy: {
            select: { id: true, user_name: true, user_email: true },
          },
          updatedBy: {
            select: { id: true, user_name: true, user_email: true },
          },
          lead: {
            select: {
              id: true,
              firstname: true,
              lastname: true,
              contact_no: true,
            },
          },
          account: {
            select: { id: true, name: true },
          },
        },
      });

      logs.push("Design selection updated successfully");

      // 4️⃣ Log action in LeadDetailedLogs
      const vendor_id = existingDesignSelection.lead.vendor_id;
      const lead_id = existingDesignSelection.lead.id;
      const account_id =
        existingDesignSelection.lead.account_id ??
        existingDesignSelection.account_id;
      let actionMessage = "";

      if (type?.toLowerCase() === "carcas") {
        actionMessage = `Carcas has been updated successfully.`;
      } else if (type?.toLowerCase() === "shutter") {
        actionMessage = `Shutter has been updated successfully.`;
      } else if (type?.toLowerCase() === "handles") {
        actionMessage = `Handles have been updated successfully.`;
      } else {
        actionMessage = `${type} has been updated successfully.`;
      }

      // Append remark from desc
      if (desc && String(desc).trim() !== "") {
        actionMessage += ` — Remark: ${String(desc).trim()}`;
      }

      const detailedLog = await prisma.leadDetailedLogs.create({
        data: {
          vendor_id: vendor_id,
          lead_id: lead_id,
          account_id: account_id,
          action: actionMessage,
          action_type: "UPDATE",
          created_by: Number(updated_by),
          created_at: new Date(),
        },
      });

      logs.push({ leadDetailedLogCreated: detailedLog });

      return res.status(200).json({
        success: true,
        message: "Design selection updated successfully",
        logs,
        data: updatedDesignSelection,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        logs: [error.message],
      });
    }
  }

  public static async getDesignStageCounts(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const vId = Number(vendorId);
      const lId = Number(leadId);

      // 1️⃣ Validate lead
      const lead = await prisma.leadMaster.findFirst({
        where: { id: lId, vendor_id: vId, is_deleted: false },
      });

      if (!lead) {
        return res.status(404).json({
          success: false,
          message: "Lead not found or does not belong to vendor",
        });
      }

      // 2️⃣ Get doc types for quotation + designs
      const [quotationType, designsType] = await Promise.all([
        prisma.documentTypeMaster.findFirst({
          where: { vendor_id: vId, tag: "Type 5" },
        }), // Quotation
        prisma.documentTypeMaster.findFirst({
          where: { vendor_id: vId, tag: "Type 6" },
        }), // Designs
      ]);

      // 3️⃣ Get counts
      const [quotationCount, designCount, selectionCount, meetingCount] =
        await Promise.all([
          quotationType
            ? prisma.leadDocuments.count({
                where: {
                  lead_id: lId,
                  vendor_id: vId,
                  doc_type_id: quotationType.id,
                  is_deleted: false,
                },
              })
            : 0,

          designsType
            ? prisma.leadDocuments.count({
                where: {
                  lead_id: lId,
                  vendor_id: vId,
                  doc_type_id: designsType.id,
                  is_deleted: false,
                },
              })
            : 0,

          prisma.leadDesignSelection.count({
            where: { lead_id: lId, vendor_id: vId },
          }),

          prisma.leadDesignMeeting.count({
            where: { lead_id: lId, vendor_id: vId },
          }),
        ]);

      // 4️⃣ Return response
      return res.status(200).json({
        success: true,
        message: "Design stage counts fetched successfully",
        data: {
          QuotationDoc: quotationCount,
          DesignsDoc: designCount,
          SelectionData: selectionCount,
          Meetings: meetingCount,
        },
      });
    } catch (error: any) {
      console.error("[getDesignStageCounts] Error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }
}
