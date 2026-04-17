import { Request, Response } from "express";
import { validationResult } from "express-validator";
import { ApiResponse } from "../../../utils/apiResponse";
import { DesigingStage } from "../../../services/leadModuleServices/desigingStage/designing-stage.service";
import { prisma } from "../../../prisma/client";
import {
  generateSignedUrl,
  uploadToWasabi,
  uploadToWasabiMeetingDocs,
  uploadToWasabiMeetingDocsFile,
  uploadToWasabStage1DesingsFile,
} from "../../../utils/wasabiClient";
import fs from "node:fs/promises";

export class DesigingStageController {
  public static async addToDesigingStage(req: Request, res: Response) {
    try {
      // ✅ Validate
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json(
            ApiResponse.validationError(errors.array().map((err) => err.msg)),
          );
      }

      const { lead_id, user_id, vendor_id } = req.body;

      const result = await DesigingStage.addToDesigingStage(
        Number(lead_id),
        Number(user_id),
        Number(vendor_id),
      );

      return res
        .status(200)
        .json(
          ApiResponse.success(
            result,
            "Lead status updated to 3 and log created",
          ),
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
            ApiResponse.validationError("vendorId and userId are required"),
          );
      }

      const result = await DesigingStage.getLeadsByStatus(
        Number(vendorId),
        Number(userId),
        Number(page),
        Number(limit),
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
      const { vendorId, leadId, userId } = req.body;

      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one file is required",
        });
      }

      const files = req.files as Express.Multer.File[];

      const docs = await DesigingStage.uploadQuotation({
        files,
        vendorId: Number(vendorId),
        leadId: Number(leadId),
        userId: Number(userId),
      });

      return res.json({
        success: true,
        message: `${docs.length} quotation${
          docs.length > 1 ? "s" : ""
        } uploaded successfully`,
        documents: docs,
      });
    } catch (error: any) {
      console.error("uploadQuotation error:", error);
      return res.status(500).json({
        success: false,
        message: error.message,
      });
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
        }),
      );

      logs.push(
        `Found ${documents.length} design quotation documents for lead ${leadId}`,
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
        }),
      );

      logs.push(
        `Found ${documents.length} design quotation documents for lead ${leadId}`,
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

      const { leadId, vendorId, userId, date, desc } = req.body;
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

      const accountId = lead.account_id;

      if (!accountId)
        return res
          .status(400)
          .json({ success: false, logs: ["No account linked with this lead"] });

      const uploadedFiles: { originalName: string; sysName: string }[] = [];

      for (const file of files) {
        const sysName = await uploadToWasabiMeetingDocsFile(
          file.path,
          Number(vendorId),
          Number(leadId),
          file.originalname,
          file.mimetype,
        );

        await fs.unlink(file.path);

        uploadedFiles.push({ originalName: file.originalname, sysName });
        logs.push({ fileUploaded: file.originalname, sysName });
      }

      const { meeting, documents, mapping } = await prisma.$transaction(
        async (tx) => {
          // 3️⃣ Create Design Meeting entry
          const newMeeting = await tx.leadDesignMeeting.create({
            data: {
              lead_id: Number(leadId),
              account_id: Number(accountId),
              vendor_id: Number(vendorId),
              date: new Date(date),
              desc,
              created_by: Number(userId),
            },
          });
          logs.push({ meetingCreated: newMeeting });

          const newDocuments: any[] = [];
          const newMapping: any[] = [];

          if (uploadedFiles.length > 0) {
            const meetingDocType = await tx.documentTypeMaster.findFirst({
              where: { vendor_id: Number(vendorId), tag: "Type 7" },
            });

            if (!meetingDocType) {
              throw new Error(
                "Document type for meeting documents (Type 7) not found for this vendor",
              );
            }

            for (const file of uploadedFiles) {
              const doc = await tx.leadDocuments.create({
                data: {
                  doc_og_name: file.originalName,
                  doc_sys_name: file.sysName,
                  vendor_id: Number(vendorId),
                  lead_id: Number(leadId),
                  account_id: Number(accountId),
                  doc_type_id: meetingDocType.id,
                  created_by: Number(userId),
                },
              });
              newDocuments.push(doc);
              logs.push({ documentCreated: doc });

              const map = await tx.leadDesignMeetingDocumentsMapping.create({
                data: {
                  lead_id: Number(leadId),
                  account_id: Number(accountId),
                  vendor_id: Number(vendorId),
                  meeting_id: newMeeting.id,
                  document_id: doc.id,
                  created_at: new Date(),
                  created_by: Number(userId),
                },
              });
              newMapping.push(map);
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

          const detailedLog = await tx.leadDetailedLogs.create({
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
          if (newDocuments.length > 0) {
            const docLogsData = newDocuments.map((doc) => ({
              vendor_id: Number(vendorId),
              lead_id: Number(leadId),
              account_id: Number(accountId),
              doc_id: doc.id,
              lead_logs_id: detailedLog.id,
              created_by: Number(userId),
              created_at: new Date(),
            }));

            await tx.leadDocumentLogs.createMany({ data: docLogsData });
            logs.push("LeadDocumentLogs created");
          }

          return {
            meeting: newMeeting,
            documents: newDocuments,
            mapping: newMapping,
          };
        },
      );

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
      const { vendorId, leadId, userId, meetingId } = req.body;
      const files = req.files as Express.Multer.File[];

      if (!meetingId)
        return res
          .status(400)
          .json({ success: false, message: "meetingId is required" });

      if (!files || files.length === 0)
        return res
          .status(400)
          .json({ success: false, message: "No files uploaded" });

      const uploadedFiles: { originalName: string; sysName: string }[] = [];

      for (const file of files) {
        const sysName = await uploadToWasabiMeetingDocsFile(
          file.path,
          Number(vendorId),
          Number(leadId),
          file.originalname,
          file.mimetype,
        );

        await fs.unlink(file.path);

        uploadedFiles.push({ originalName: file.originalname, sysName });
      }

      const { uploadedDocs } = await prisma.$transaction(async (tx) => {
        const lead = await tx.leadMaster.findFirst({
          where: {
            id: Number(leadId),
            vendor_id: Number(vendorId),
            is_deleted: false,
          },
          select: { account_id: true },
        });

        if (!lead || !lead.account_id) {
          throw new Error("No account linked with this lead");
        }

        const accountId = lead.account_id;

        // ✅ 1. Check meeting exists
        const meeting = await tx.leadDesignMeeting.findFirst({
          where: { id: Number(meetingId), vendor_id: Number(vendorId) },
        });
        if (!meeting) {
          throw new Error("Meeting not found");
        }

        const meetingDocType = await tx.documentTypeMaster.findFirst({
          where: { vendor_id: Number(vendorId), tag: "Type 7" },
        });

        if (!meetingDocType) {
          throw new Error(
            "Document type for meeting documents (Type 7) not found for this vendor",
          );
        }

        // ✅ 2. Save docs
        const newDocs = [];
        for (const file of uploadedFiles) {
          const doc = await tx.leadDocuments.create({
            data: {
              doc_og_name: file.originalName,
              doc_sys_name: file.sysName,
              vendor_id: Number(vendorId),
              lead_id: Number(leadId),
              account_id: Number(accountId),
              doc_type_id: meetingDocType.id /* Type 7 - Meeting Doc */,
              created_by: Number(userId),
            },
          });

          newDocs.push(doc);

          await tx.leadDesignMeetingDocumentsMapping.create({
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
        const actionMsg = `${newDocs.length} meeting file(s) added`;
        const logEntry = await tx.leadDetailedLogs.create({
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
        await tx.leadDocumentLogs.createMany({
          data: newDocs.map((doc) => ({
            vendor_id: Number(vendorId),
            lead_id: Number(leadId),
            account_id: Number(accountId),
            doc_id: doc.id,
            lead_logs_id: logEntry.id,
            created_by: Number(userId),
            created_at: new Date(),
          })),
        });

        return { uploadedDocs: newDocs };
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

  // This API will IGNORE deleted docs -- it will not include them.
  // As per the code below, only non-deleted docs are picked by being explicit in the doc lookup.
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

      // Attach signed URLs to only existing, non-deleted documents
      const meetingsWithUrls = await Promise.all(
        meetings.map(async (meeting: any) => {
          const mappings = (meeting as any).designMeetingDocsMapping as any[];
          const docsWithUrls = await Promise.all(
            mappings.map(async (map: any) => {
              // Only include document if it exists and is not deleted
              const document = await prisma.leadDocuments.findFirst({
                where: {
                  id: map.document_id,
                  is_deleted: false,
                },
              });
              if (!document) {
                return null; // filter out mapping if doc is deleted
              }
              const signedUrl = await generateSignedUrl(
                document.doc_sys_name,
                3600,
                "inline",
              );
              return {
                ...map,
                document: { ...document, signedUrl },
              };
            }),
          );

          // Filter out mappings for deleted/non-existing documents
          return {
            ...meeting,
            designMeetingDocsMapping: docsWithUrls.filter(Boolean),
          };
        }),
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
      const { vendorId, leadId, userId } = req.body;

      if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one file is required",
        });
      }

      const files = req.files as Express.Multer.File[];
      const uploadedFiles: { originalName: string; sysName: string }[] = [];

      for (const file of files) {
        const sysName = await uploadToWasabStage1DesingsFile(
          file.path,
          Number(vendorId),
          Number(leadId),
          file.originalname,
          file.mimetype,
        );

        await fs.unlink(file.path);

        uploadedFiles.push({ originalName: file.originalname, sysName });
      }

      const { uploadedDocs, actionMessage } = await prisma.$transaction(
        async (tx) => {
          // 1️⃣ Fetch lead → derive account_id
          const lead = await tx.leadMaster.findFirst({
            where: {
              id: Number(leadId),
              vendor_id: Number(vendorId),
              is_deleted: false,
            },
            select: {
              id: true,
              account_id: true,
            },
          });

          if (!lead) {
            throw new Error(`Invalid leadId ${leadId} for this vendor`);
          }

          if (!lead.account_id) {
            throw new Error("No account linked with this lead");
          }

          const accountId = lead.account_id; // ✅ derived safely

          // 2️⃣ Fetch document type
          const designDocType = await tx.documentTypeMaster.findFirst({
            where: {
              vendor_id: Number(vendorId),
              tag: "Type 6",
            },
          });

          if (!designDocType) {
            throw new Error("Design document type (Type 6) not found");
          }

          const newDocs: any[] = [];

          // 3️⃣ DB insert
          for (const file of uploadedFiles) {
            const doc = await tx.leadDocuments.create({
              data: {
                doc_og_name: file.originalName,
                doc_sys_name: file.sysName,
                vendor_id: Number(vendorId),
                lead_id: Number(leadId),
                account_id: Number(accountId), // ✅ backend-owned
                doc_type_id: designDocType.id,
                created_by: Number(userId),
              },
            });

            newDocs.push(doc);
          }

          // 4️⃣ Logs
          const message =
            newDocs.length > 1
              ? `${newDocs.length} Designs have been added successfully.`
              : "Design has been added successfully.";

          const detailedLog = await tx.leadDetailedLogs.create({
            data: {
              vendor_id: Number(vendorId),
              lead_id: Number(leadId),
              account_id: Number(accountId),
              action: message,
              action_type: "CREATE",
              created_by: Number(userId),
              created_at: new Date(),
            },
          });

          await tx.leadDocumentLogs.createMany({
            data: newDocs.map((doc) => ({
              vendor_id: Number(vendorId),
              lead_id: Number(leadId),
              account_id: Number(accountId),
              doc_id: doc.id,
              lead_logs_id: detailedLog.id,
              created_by: Number(userId),
              created_at: new Date(),
            })),
          });

          return { uploadedDocs: newDocs, actionMessage: message };
        },
      );

      return res.status(201).json({
        success: true,
        message: actionMessage,
        documents: uploadedDocs,
      });
    } catch (error: any) {
      console.error("uploadDesigns error:", error);
      return res.status(500).json({
        success: false,
        message: error.message,
      });
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
            file.originalname,
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
            },
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
            ApiResponse.validationError("vendorId and leadId are required"),
          );
      }

      const lead = await DesigingStage.getLeadById(
        Number(vendorId),
        Number(leadId),
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

      const {
        lead_id,
        account_id,
        vendor_id,
        type,
        desc,
        created_by,
        product_structure_instance_id,
      } = req.body;
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

      // 4️⃣ Validate product structure instance (optional)
      let resolvedInstanceId: number | null = null;
      if (product_structure_instance_id) {
        const instance = await prisma.leadProductStructureInstance.findFirst({
          where: {
            id: Number(product_structure_instance_id),
            lead_id: Number(lead_id),
            account_id: Number(account_id),
            vendor_id: Number(vendor_id),
          },
          select: { id: true },
        });

        if (!instance) {
          return res.status(404).json({
            success: false,
            message: "Product structure instance not found for this lead",
            logs: ["Product structure instance verification failed"],
          });
        }
        resolvedInstanceId = instance.id;
        logs.push("Product structure instance verified successfully");
      }

      // 5️⃣ Create or update Design Selection Entry (prevent duplicate per type+instance)
      const existingSelection = await prisma.leadDesignSelection.findFirst({
        where: {
          lead_id: Number(lead_id),
          vendor_id: Number(vendor_id),
          account_id: Number(account_id),
          type,
          product_structure_instance_id: resolvedInstanceId,
        },
        select: { id: true },
      });

      const designSelection = existingSelection
        ? await prisma.leadDesignSelection.update({
            where: { id: existingSelection.id },
            data: {
              desc,
              updated_by: Number(created_by),
              updated_at: new Date(),
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
              productStructureInstance: {
                select: { id: true, title: true, quantity_index: true },
              },
            },
          })
        : await prisma.leadDesignSelection.create({
            data: {
              lead_id: Number(lead_id),
              account_id: Number(account_id),
              vendor_id: Number(vendor_id),
              product_structure_instance_id: resolvedInstanceId,
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
              productStructureInstance: {
                select: { id: true, title: true, quantity_index: true },
              },
            },
          });

      logs.push(
        existingSelection
          ? "Design selection updated successfully"
          : "Design selection created successfully",
      );

      // 6️⃣ Add LeadDetailedLogs entry (with remark from `desc`)
      let actionMessage = "";
      if (type.toLowerCase() === "carcas") {
        actionMessage = existingSelection
          ? `Carcas has been updated successfully.`
          : `Carcas has been added successfully.`;
      } else if (type.toLowerCase() === "shutter") {
        actionMessage = existingSelection
          ? `Shutter has been updated successfully.`
          : `Shutter has been added successfully.`;
      } else if (type.toLowerCase() === "handles") {
        actionMessage = existingSelection
          ? `Handles has been updated successfully.`
          : `Handles has been added successfully.`;
      } else {
        actionMessage = existingSelection
          ? `${type} has been updated successfully.`
          : `${type} has been added successfully.`;
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
      const {
        page = "1",
        limit = "10",
        product_structure_instance_id,
      } = req.query;

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

      let instanceFilter: number | undefined;
      if (product_structure_instance_id) {
        const instanceId = Number(product_structure_instance_id);
        if (Number.isNaN(instanceId)) {
          return res.status(400).json({
            success: false,
            message: "product_structure_instance_id must be numeric",
            logs: ["Invalid product_structure_instance_id"],
          });
        }

        const instance = await prisma.leadProductStructureInstance.findFirst({
          where: {
            id: instanceId,
            lead_id: Number(leadId),
            vendor_id: Number(vendorId),
          },
          select: { id: true },
        });

        if (!instance) {
          return res.status(404).json({
            success: false,
            message: "Product structure instance not found for this lead",
            logs: ["Product structure instance verification failed"],
          });
        }
        instanceFilter = instance.id;
        logs.push("Product structure instance verified successfully");
      }

      // 2️⃣ Fetch design selections with pagination
      const designSelections = await prisma.leadDesignSelection.findMany({
        where: {
          lead_id: Number(leadId),
          vendor_id: Number(vendorId),
          ...(instanceFilter
            ? { product_structure_instance_id: instanceFilter }
            : {}),
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
          productStructureInstance: {
            select: { id: true, title: true, quantity_index: true },
          },
        },
      });

      // 3️⃣ Get total count for pagination
      const totalCount = await prisma.leadDesignSelection.count({
        where: {
          lead_id: Number(leadId),
          vendor_id: Number(vendorId),
          ...(instanceFilter
            ? { product_structure_instance_id: instanceFilter }
            : {}),
        },
      });

      logs.push(
        `Fetched ${designSelections.length} design selections for lead ${leadId}`,
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
      const { type, desc, updated_by, product_structure_instance_id } =
        req.body;

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

      let resolvedInstanceId: number | null | undefined = undefined;
      if (typeof product_structure_instance_id !== "undefined") {
        if (product_structure_instance_id) {
          const instance = await prisma.leadProductStructureInstance.findFirst({
            where: {
              id: Number(product_structure_instance_id),
              lead_id: existingDesignSelection.lead_id,
              account_id: existingDesignSelection.account_id,
              vendor_id: existingDesignSelection.vendor_id,
            },
            select: { id: true },
          });

          if (!instance) {
            return res.status(404).json({
              success: false,
              message: "Product structure instance not found for this lead",
              logs: ["Product structure instance verification failed"],
            });
          }
          resolvedInstanceId = instance.id;
          logs.push("Product structure instance verified successfully");
        } else {
          resolvedInstanceId = null;
        }
      }

      // 3️⃣ Update design selection
      const updatedDesignSelection = await prisma.leadDesignSelection.update({
        where: { id: Number(id) },
        data: {
          type,
          desc,
          updated_by: Number(updated_by),
          ...(typeof resolvedInstanceId !== "undefined"
            ? { product_structure_instance_id: resolvedInstanceId }
            : {}),
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
          productStructureInstance: {
            select: { id: true, title: true, quantity_index: true },
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

  public static async getLeadStatus(req: Request, res: Response) {
    try {
      const { lead_id, vendor_id } = req.params;

      if (!lead_id || !vendor_id) {
        return res
          .status(400)
          .json({ message: "lead_id and vendor_id are required" });
      }

      const lead = await prisma.leadMaster.findFirst({
        where: {
          id: Number(lead_id),
          vendor_id: Number(vendor_id),
          is_deleted: false,
        },
        select: {
          id: true,
          status_id: true,
          is_amc_opted: true,
          amc_opted_at: true,
          total_required_chs_manufacturing_days: true,
          statusType: {
            select: {
              id: true,
              type: true,
              tag: true,
            },
          },
        },
      });

      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      return res.status(200).json({
        message: "Lead status fetched successfully",
        data: {
          lead_id: lead.id,
          status_type_id: lead.status_id,
          status: lead.statusType?.type,
          status_tag: lead.statusType?.tag,
          is_amc_opted: lead.is_amc_opted,
          amc_opted_at: lead.amc_opted_at,
          total_required_chs_manufacturing_days:
            lead.total_required_chs_manufacturing_days,
        },
      });
    } catch (error: any) {
      console.error("Error fetching lead status:", error);
      return res.status(500).json({
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  public static async getInstanceStageController(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);
      const instanceId = Number(req.params.instanceId);

      if (!vendorId || !leadId || !instanceId) {
        return res.status(400).json({
          message: "vendorId, leadId and instanceId are required",
        });
      }

      const result = await DesigingStage.getInstanceStageByContext({
        vendorId,
        leadId,
        instanceId,
      });

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to derive instance stage",
      });
    }
  }



   public static async getLeadStatusForNotification(req: Request, res: Response) {
    try {
      const { lead_id, vendor_id } = req.params;
      const { instance_id } = req.query;

      if (!lead_id || !vendor_id) {
        return res
          .status(400)
          .json({ message: "lead_id and vendor_id are required" });
      }

      const leadId = Number(lead_id);
      const vendorId = Number(vendor_id);
      const instanceId = instance_id ? Number(instance_id) : null;

      // ======================================================
      // 1️⃣ FETCH LEAD MASTER STATUS (Always)
      // ======================================================
      const lead = await prisma.leadMaster.findFirst({
        where: {
          id: leadId,
          vendor_id: vendorId,
          is_deleted: false,
        },
        select: {
          id: true,
          status_id: true,
          statusType: {
            select: {
              id: true,
              type: true,
              tag: true,
            },
          },
        },
      });

      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      if (instanceId) {
        const instance = await prisma.leadProductStructureInstance.findFirst({
          where: {
            id: instanceId,
            lead_id: leadId,
            vendor_id: vendorId,
          },
          select: {
            id: true,
            is_tech_check_completed: true,
            is_order_login_completed: true,
          },
        });

        if (!instance) {
          return res.status(404).json({ message: "Instance not found" });
        }

        let stage = "tech-check-stage";

        if (instance.is_tech_check_completed) {
          stage = "order-login-stage";
        }

        if (
          instance.is_tech_check_completed &&
          instance.is_order_login_completed
        ) {
          stage = "production-stage";
        }

        return res.status(200).json({
          message: "Lead + Instance status fetched successfully",
          data: {
            lead_id: lead.id,
            lead_status_type_id: lead.status_id,
            lead_status: lead.statusType?.type,
            lead_status_tag: lead.statusType?.tag,

            instance_id: instance.id,
            workflow_stage: stage,
          },
        });
      }

      const instances = await prisma.leadProductStructureInstance.findMany({
        where: {
          lead_id: leadId,
          vendor_id: vendorId,
        },
        select: {
          is_tech_check_completed: true,
          is_order_login_completed: true,
        },
      });

      let workflowStage = "production-stage";

      if (instances.length > 0) {
        for (const inst of instances) {
          if (!inst.is_tech_check_completed) {
            workflowStage = "tech-check-stage";
            break;
          }

          if (inst.is_tech_check_completed && !inst.is_order_login_completed) {
            workflowStage = "order-login-stage";
          }
        }
      }

      return res.status(200).json({
        message: "Lead status fetched successfully",
        data: {
          lead_id: lead.id,
          lead_status_type_id: lead.status_id,
          lead_status: lead.statusType?.type,
          lead_status_tag: lead.statusType?.tag,

          workflow_stage: workflowStage,
        },
      });
    } catch (error: any) {
      console.error("Error fetching lead status:", error);
      return res.status(500).json({
        message: "Internal server error",
        error: error.message,
      });
    }
  }
}
