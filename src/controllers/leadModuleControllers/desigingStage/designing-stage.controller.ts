import { Request, Response } from "express";
import { validationResult } from "express-validator";
import { ApiResponse } from "../../../utils/apiResponse";
import { DesigingStage } from "../../../services/leadModuleServices/desigingStage/designing-stage.service";
import { prisma } from "../../../prisma/client";
import { createLeadLog } from "../../../utils/leadDetailedLog";
import { NotificationService } from "../../../services/notification/notification.service";
import { NotificationType } from "../../../prisma/generated";
import { sendNewMeetingAddedEmail } from "../../../services/email/brevoEmail.service";
import {
  generateSignedUrl,
  uploadToWasabi,
  uploadToWasabiMeetingDocs,
  uploadToWasabiMeetingDocsFile,
  uploadToWasabStage1DesingsFile,
  uploadToWasabiCostingFile,
  uploadToWasabiElectricalPlumbing,
  uploadToWasabiFinalIsmUpload,
} from "../../../utils/wasabiClient";
import fs from "node:fs/promises";
import path from "node:path";
import { sanitizeFilename } from "../../../utils/fileUtils";

const resolveClientBaseUrl = (req: Request): string => {
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin.trim().length > 0) {
    return origin.replace(/\/$/, "");
  }

  const referer = req.headers.referer;
  if (typeof referer === "string" && referer.trim().length > 0) {
    try {
      return new URL(referer).origin;
    } catch {
      return "http://localhost:3000";
    }
  }

  return "http://localhost:3000";
};

const meetingTimePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

const isValidMeetingTime = (value?: string): boolean =>
  typeof value === "string" && meetingTimePattern.test(value);

export class DesigingStageController {
  private static normalizeSpecItemCodeId(value: number | null | undefined) {
    return value ?? -1;
  }

  private static async getActorRole(
    req: Request,
    fallbackUserId?: number | null,
  ) {
    const requestUserId = Number((req as any)?.user?.id);
    const resolvedUserId =
      (Number.isFinite(requestUserId) && requestUserId > 0
        ? requestUserId
        : undefined) ??
      (fallbackUserId && Number.isFinite(fallbackUserId) && fallbackUserId > 0
        ? fallbackUserId
        : undefined);

    if (!resolvedUserId) {
      return null;
    }

    const actor = await prisma.userMaster.findUnique({
      where: { id: resolvedUserId },
      select: {
        id: true,
        user_type: {
          select: {
            user_type: true,
          },
        },
      },
    });

    return actor?.user_type?.user_type?.toLowerCase() ?? null;
  }

  private static async ensureSpecificationEditable(
    req: Request,
    specificationId: number,
    fallbackUserId?: number | null,
  ) {
    const specification = await prisma.leadSpecificationsMaster.findUnique({
      where: { id: specificationId },
      select: {
        id: true,
        vendor_id: true,
        lead_id: true,
        item_code_id: true,
        created_at: true,
      },
    });

    if (!specification) {
      throw new Error("Specification not found");
    }

    const actorRole = await DesigingStageController.getActorRole(
      req,
      fallbackUserId,
    );

    if (actorRole === "super-admin") {
      return specification;
    }

    const latestSpecification = await prisma.leadSpecificationsMaster.findFirst({
      where: {
        vendor_id: specification.vendor_id,
        lead_id: specification.lead_id,
        item_code_id: specification.item_code_id,
      },
      orderBy: [
        { created_at: "desc" },
        { id: "desc" },
      ],
      select: { id: true },
    });

    if (!latestSpecification || latestSpecification.id !== specification.id) {
      throw new Error(
        "Only the latest specification for this item code can be edited",
      );
    }

    return specification;
  }

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
      const { vendorId, leadId, userId, designDocumentId } = req.body;

      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one file is required",
        });
      }

      const vendor = await prisma.vendorMaster.findUnique({
        where: { id: Number(vendorId) },
        select: { is_this_vendor_is_custom_usertype_only: true },
      });

      if (
        vendor?.is_this_vendor_is_custom_usertype_only === true &&
        !designDocumentId
      ) {
        return res.status(400).json({
          success: false,
          message: "A design file selection is required",
        });
      }

      const files = req.files as Express.Multer.File[];

      const docs = await DesigingStage.uploadQuotation({
        files,
        vendorId: Number(vendorId),
        leadId: Number(leadId),
        userId: Number(userId),
        designDocumentId: designDocumentId
          ? Number(designDocumentId)
          : undefined,
      });

      return res.json({
        success: true,
        message: `${docs.length} quotation${docs.length > 1 ? "s" : ""
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

      const {
        leadId,
        vendorId,
        userId,
        date,
        desc,
        meeting_type_id,
        meeting_start_time,
        meeting_end_time,
      } = req.body;
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

      const meetingTypes = await prisma.meetingTypeMaster.findMany({
        where: { vendor_id: Number(vendorId) },
        select: { id: true },
      });

      if (meetingTypes.length > 0 && !meeting_type_id) {
        return res.status(400).json({
          success: false,
          logs: ["meeting_type_id is required when meeting types are configured"],
        });
      }

      if (meetingTypes.length === 0 && !desc?.trim()) {
        return res.status(400).json({
          success: false,
          logs: ["Meeting description is required"],
        });
      }

      if (meeting_start_time && !isValidMeetingTime(meeting_start_time)) {
        return res.status(400).json({
          success: false,
          logs: ["meeting_start_time must be in HH:mm format"],
        });
      }

      if (meeting_end_time && !isValidMeetingTime(meeting_end_time)) {
        return res.status(400).json({
          success: false,
          logs: ["meeting_end_time must be in HH:mm format"],
        });
      }

      if (meeting_start_time && meeting_end_time && meeting_start_time >= meeting_end_time) {
        return res.status(400).json({
          success: false,
          logs: ["meeting_end_time must be after meeting_start_time"],
        });
      }

      if (meeting_type_id) {
        const meetingType = await prisma.meetingTypeMaster.findFirst({
          where: {
            id: Number(meeting_type_id),
            vendor_id: Number(vendorId),
          },
          select: { id: true },
        });

        if (!meetingType) {
          return res.status(400).json({
            success: false,
            logs: ["Invalid meeting_type_id for this vendor"],
          });
        }
      }

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
              meeting_type_id: meeting_type_id
                ? Number(meeting_type_id)
                : null,
              date: new Date(date),
              meeting_start_time: meeting_start_time?.trim() || null,
              meeting_end_time: meeting_end_time?.trim() || null,
              desc: desc?.trim() || "",
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

          const detailedLog = await createLeadLog(tx, {
            vendor_id: Number(vendorId),
            lead_id: Number(leadId),
            account_id: Number(accountId),
            action: actionMessage,
            action_type: "CREATE",
            created_by: Number(userId),
            created_at: new Date(),
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

      const designerMapping = await prisma.leadUserMapping.findFirst({
        where: {
          lead_id: Number(leadId),
          vendor_id: Number(vendorId),
          type: "designer",
          status: "active",
          user_id: { not: Number(userId) },
        },
        select: {
          user_id: true,
          user: {
            select: {
              user_name: true,
              user_email: true,
            },
          },
        },
      });

      if (designerMapping?.user?.user_email) {
        const redirectPath = `/dashboard/leads/designing-stage/details/${Number(leadId)}?accountId=${Number(accountId)}&tab=meetings`;
        const detailsUrl = `${resolveClientBaseUrl(req)}${redirectPath}`;
        const leadName = `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim();
        const notificationMessage = `A new meeting has been added on ${lead.lead_code} - ${leadName}. Click to view the meeting details`;
        const formattedMeetingDate = new Date(date).toLocaleString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });

        await Promise.allSettled([
          NotificationService.createAndSend({
            vendor_id: Number(vendorId),
            user_id: designerMapping.user_id,
            sender_id: Number(userId),
            type: NotificationType.LEAD_ACTION,
            title: "New Meeting Added",
            message: notificationMessage,
            entity_type: "lead_design_meeting",
            entity_id: meeting.id,
            redirect_url: redirectPath,
          }),
          sendNewMeetingAddedEmail({
            vendor_id: Number(vendorId),
            toEmail: designerMapping.user.user_email,
            toName: designerMapping.user.user_name,
            leadCode: lead.lead_code,
            leadName,
            meetingDate: formattedMeetingDate,
            meetingDescription: desc?.trim() || "",
            detailsUrl,
          }),
        ]);
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
        const logEntry = await createLeadLog(tx, {
          vendor_id: Number(vendorId),
          lead_id: Number(leadId),
          account_id: Number(accountId),
          action: actionMsg,
          action_type: "UPDATE",
          created_by: Number(userId),
          created_at: new Date(),
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
          meetingType: true,
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

  public static async getMeetingTypes(req: Request, res: Response) {
    try {
      const { vendorId } = req.params;

      if (!vendorId) {
        return res.status(400).json({
          success: false,
          message: "vendorId is required",
        });
      }

      const meetingTypes = await prisma.meetingTypeMaster.findMany({
        where: { vendor_id: Number(vendorId) },
        orderBy: { created_at: "asc" },
      });

      return res.status(200).json({
        success: true,
        message: "Meeting types fetched successfully",
        data: meetingTypes,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch meeting types",
      });
    }
  }

  public static async uploadDesigns(req: Request, res: Response) {
    try {
      console.log("[BACKEND UPLOAD DESIGNS] req.body:", req.body);
      const { vendorId, leadId, userId } = req.body;
      const rawInstanceIds = req.body.product_structure_instance_ids;

      if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one file is required",
        });
      }

      const files = req.files as Express.Multer.File[];
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
              firstname: true,
              lastname: true,
            },
          });

          if (!lead) {
            throw new Error(`Invalid leadId ${leadId} for this vendor`);
          }

          if (!lead.account_id) {
            throw new Error("No account linked with this lead");
          }

          const accountId = lead.account_id; // ✅ derived safely
          const vendor = await tx.vendorMaster.findUnique({
            where: { id: Number(vendorId) },
            select: { is_this_vendor_is_custom_usertype_only: true },
          });
          const useCustomVendorFlow =
            vendor?.is_this_vendor_is_custom_usertype_only === true;
          const selectedDesignType =
            typeof req.body.design_type === "string"
              ? req.body.design_type.trim()
              : "";

          if (useCustomVendorFlow && !selectedDesignType) {
            throw new Error("Design type is required");
          }
          const requestedInstanceIds = Array.isArray(rawInstanceIds)
            ? rawInstanceIds
            : typeof rawInstanceIds === "string" && rawInstanceIds.length > 0
              ? [rawInstanceIds]
              : [];
          const parsedInstanceIds = useCustomVendorFlow
            ? [...new Set(
              requestedInstanceIds
                .map((value) => Number(value))
                .filter((value) => Number.isFinite(value) && value > 0),
            )]
            : [];

          const allLeadInstances = useCustomVendorFlow
            ? await tx.leadProductStructureInstance.findMany({
              where: {
                lead_id: Number(leadId),
                vendor_id: Number(vendorId),
                account_id: Number(accountId),
              },
              select: {
                id: true,
                title: true,
                productType: {
                  select: { type: true },
                },
              },
              orderBy: [{ product_structure_id: "asc" }, { quantity_index: "asc" }],
            })
            : [];

          const selectedInstances = useCustomVendorFlow
            ? parsedInstanceIds.length > 0
              ? allLeadInstances.filter((instance) =>
                parsedInstanceIds.includes(instance.id),
              )
              : allLeadInstances
            : [];

          if (
            useCustomVendorFlow &&
            parsedInstanceIds.length > 0 &&
            selectedInstances.length !== parsedInstanceIds.length
          ) {
            throw new Error("One or more selected product instances are invalid for this lead");
          }

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
          let nextRevision = 0;
          let designTypeSegment = "";
          let clientNameSegment = "";
          let structureSegment = "";
          let dateSegment = "";
          let instanceIdToPersist: number | null = null;

          if (useCustomVendorFlow) {
            const structureLabelSource =
              selectedInstances.length > 0 ? selectedInstances : allLeadInstances;
            const uniqueStructureNames = [
              ...new Set(
                structureLabelSource
                  .map((instance) => instance.productType?.type)
                  .filter(Boolean),
              ),
            ];
            structureSegment = sanitizeFilename(
              uniqueStructureNames.length > 0
                ? uniqueStructureNames.join("_")
                : "General",
            )
              .replace(/_+/g, "_")
              .slice(0, 80);
            clientNameSegment = sanitizeFilename(
              `${lead.firstname ?? ""}${lead.lastname ?? ""}` || "Client",
            )
              .replace(/_+/g, "_")
              .slice(0, 50);
            designTypeSegment = sanitizeFilename(selectedDesignType)
              .replace(/_+/g, "_")
              .slice(0, 20);
            const now = new Date();
            dateSegment = [
              now.getFullYear(),
              String(now.getMonth() + 1).padStart(2, "0"),
              String(now.getDate()).padStart(2, "0"),
            ].join("-");

            const existingDesignDocs = await tx.leadDocuments.findMany({
              where: {
                vendor_id: Number(vendorId),
                lead_id: Number(leadId),
                doc_type_id: designDocType.id,
                is_deleted: false,
              },
              select: { doc_og_name: true },
            });

            nextRevision =
              existingDesignDocs.reduce((maxRevision, doc) => {
                const match = doc.doc_og_name?.match(
                  /^D(\d+)_([^_]+)_(.+?)(?:\.[^.]+)?$/i,
                );
                if (!match) {
                  return maxRevision;
                }

                const [, revisionText, existingDesignType = "", nameBody = ""] = match;
                if (existingDesignType.trim().toLowerCase() !== designTypeSegment.toLowerCase()) {
                  return maxRevision;
                }

                const isSameProductType =
                  nameBody.includes(`_${structureSegment}_`) ||
                  nameBody.endsWith(`_${structureSegment}`) ||
                  nameBody.startsWith(`${structureSegment}_`);

                if (!isSameProductType) {
                  return maxRevision;
                }

                const revision = Number(revisionText);
                return Number.isFinite(revision)
                  ? Math.max(maxRevision, revision)
                  : maxRevision;
              }, -1) + 1;

            instanceIdToPersist =
              selectedInstances.length === 1 ? selectedInstances[0].id : null;
          }

          // 3️⃣ DB insert
          for (const file of files) {
            const finalOriginalName = useCustomVendorFlow
              ? (() => {
                const extension = path.extname(file.originalname || "");
                const renamedOriginalName = `D${nextRevision}_${designTypeSegment}_${clientNameSegment}_${structureSegment}_${dateSegment}${extension}`;
                nextRevision += 1;
                return renamedOriginalName;
              })()
              : file.originalname;
            const sysName = await uploadToWasabStage1DesingsFile(
              file.path,
              Number(vendorId),
              Number(leadId),
              finalOriginalName,
              file.mimetype,
            );

            await fs.unlink(file.path);

            const doc = await tx.leadDocuments.create({
              data: {
                doc_og_name: finalOriginalName,
                doc_sys_name: sysName,
                vendor_id: Number(vendorId),
                lead_id: Number(leadId),
                account_id: Number(accountId), // ✅ backend-owned
                doc_type_id: designDocType.id,
                created_by: Number(userId),
                product_structure_instance_id: instanceIdToPersist,
              },
            });

            newDocs.push(doc);
          }

          // 4️⃣ Logs
          const message =
            newDocs.length > 1
              ? `${newDocs.length} Designs have been added successfully.`
              : "Design has been added successfully.";

          const detailedLog = await createLeadLog(tx, {
            vendor_id: Number(vendorId),
            lead_id: Number(leadId),
            account_id: Number(accountId),
            action: message,
            action_type: "CREATE",
            created_by: Number(userId),
            created_at: new Date(),
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

  public static async uploadCostingFile(req: Request, res: Response) {
    try {
      const { vendorId, leadId, userId, specification_id } = req.body;
      const rawInstanceIds = req.body.product_structure_instance_ids;
      const specId = specification_id ? Number(specification_id) : null;

      if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one file is required",
        });
      }

      const files = req.files as Express.Multer.File[];
      const { uploadedDocs, actionMessage } = await prisma.$transaction(
        async (tx) => {
          const lead = await tx.leadMaster.findFirst({
            where: {
              id: Number(leadId),
              vendor_id: Number(vendorId),
              is_deleted: false,
            },
            select: {
              id: true,
              account_id: true,
              firstname: true,
              lastname: true,
            },
          });

          if (!lead) {
            throw new Error(`Invalid leadId ${leadId} for this vendor`);
          }

          if (!lead.account_id) {
            throw new Error("No account linked with this lead");
          }

          const accountId = lead.account_id;
          const vendor = await tx.vendorMaster.findUnique({
            where: { id: Number(vendorId) },
            select: { is_this_vendor_is_custom_usertype_only: true },
          });
          const useCustomVendorFlow =
            vendor?.is_this_vendor_is_custom_usertype_only === true;

          const requestedInstanceIds = Array.isArray(rawInstanceIds)
            ? rawInstanceIds
            : typeof rawInstanceIds === "string" && rawInstanceIds.length > 0
              ? [rawInstanceIds]
              : [];
          const parsedInstanceIds = useCustomVendorFlow
            ? [...new Set(
              requestedInstanceIds
                .map((value) => Number(value))
                .filter((value) => Number.isFinite(value) && value > 0),
            )]
            : [];

          const allLeadInstances = useCustomVendorFlow
            ? await tx.leadProductStructureInstance.findMany({
              where: {
                lead_id: Number(leadId),
                vendor_id: Number(vendorId),
                account_id: Number(accountId),
              },
              select: {
                id: true,
                title: true,
                productType: {
                  select: { type: true },
                },
              },
              orderBy: [{ product_structure_id: "asc" }, { quantity_index: "asc" }],
            })
            : [];

          const selectedInstances = useCustomVendorFlow
            ? parsedInstanceIds.length > 0
              ? allLeadInstances.filter((instance) =>
                parsedInstanceIds.includes(instance.id),
              )
              : allLeadInstances
            : [];

          if (
            useCustomVendorFlow &&
            parsedInstanceIds.length > 0 &&
            selectedInstances.length !== parsedInstanceIds.length
          ) {
            throw new Error("One or more selected product instances are invalid for this lead");
          }

          // Get-or-create the "Costing File" document type for this vendor
          let costingFileDocType = await tx.documentTypeMaster.findFirst({
            where: { vendor_id: Number(vendorId), tag: "COSTING_FILE" },
          });

          if (!costingFileDocType) {
            costingFileDocType = await tx.documentTypeMaster.create({
              data: {
                vendor_id: Number(vendorId),
                type: "Costing File",
                tag: "COSTING_FILE",
                doc_title: "Costing File",
                stage: "Designing",
              },
            });
          }

          let nextRevision = 0;
          let clientNameSegment = "";
          let structureSegment = "";
          let dateSegment = "";
          let instanceIdToPersist: number | null = null;

          if (useCustomVendorFlow) {
            const structureLabelSource =
              selectedInstances.length > 0 ? selectedInstances : allLeadInstances;
            const uniqueStructureNames = [
              ...new Set(
                structureLabelSource
                  .map((instance) => instance.productType?.type)
                  .filter(Boolean),
              ),
            ];
            structureSegment = sanitizeFilename(
              uniqueStructureNames.length > 0
                ? uniqueStructureNames.join("_")
                : "General",
            )
              .replace(/_+/g, "_")
              .slice(0, 80);
            clientNameSegment = sanitizeFilename(
              `${lead.firstname ?? ""}${lead.lastname ?? ""}` || "Client",
            )
              .replace(/_+/g, "_")
              .slice(0, 50);
            const now = new Date();
            dateSegment = [
              now.getFullYear(),
              String(now.getMonth() + 1).padStart(2, "0"),
              String(now.getDate()).padStart(2, "0"),
            ].join("-");

            const existingCostingDocs = await tx.leadDocuments.findMany({
              where: {
                vendor_id: Number(vendorId),
                lead_id: Number(leadId),
                doc_type_id: costingFileDocType.id,
                is_deleted: false,
              },
              select: { doc_og_name: true },
            });
            nextRevision =
              existingCostingDocs.reduce((maxRevision, doc) => {
                const match = doc.doc_og_name?.match(/^C(\d+)-/i);
                const revision = match ? Number(match[1]) : -1;
                return Number.isFinite(revision)
                  ? Math.max(maxRevision, revision)
                  : maxRevision;
              }, -1) + 1;

            instanceIdToPersist =
              selectedInstances.length === 1 ? selectedInstances[0].id : null;
          }

          const newDocs: any[] = [];
          for (const file of files) {
            const finalOriginalName = useCustomVendorFlow
              ? (() => {
                const extension = path.extname(file.originalname || "");
                const renamedOriginalName = `C${nextRevision}-${clientNameSegment}-${structureSegment}-${dateSegment}${extension}`;
                nextRevision += 1;
                return renamedOriginalName;
              })()
              : file.originalname;

            const sysName = await uploadToWasabiCostingFile(
              file.path,
              Number(vendorId),
              Number(leadId),
              finalOriginalName,
              file.mimetype,
            );

            await fs.unlink(file.path);

            const doc = await tx.leadDocuments.create({
              data: {
                doc_og_name: finalOriginalName,
                doc_sys_name: sysName,
                vendor_id: Number(vendorId),
                lead_id: Number(leadId),
                account_id: Number(accountId),
                doc_type_id: costingFileDocType.id,
                created_by: Number(userId),
                product_structure_instance_id: instanceIdToPersist,
              },
            });

            if (specId) {
              await tx.specificationDocumentMapping.create({
                data: {
                  vendor_id: Number(vendorId),
                  lead_id: Number(leadId),
                  specs_id: specId,
                  document_id: doc.id,
                  created_by: Number(userId),
                },
              });
            }

            newDocs.push(doc);
          }

          const message =
            newDocs.length > 1
              ? `${newDocs.length} Costing files have been uploaded successfully.`
              : "Costing file has been uploaded successfully.";

          const detailedLog = await createLeadLog(tx, {
            vendor_id: Number(vendorId),
            lead_id: Number(leadId),
            account_id: Number(accountId),
            action: message,
            action_type: "CREATE",
            created_by: Number(userId),
            created_at: new Date(),
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
      console.error("uploadCostingFile error:", error);
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  public static async getCostingFileDocuments(req: Request, res: Response) {
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

      const costingFileDocType = await prisma.documentTypeMaster.findFirst({
        where: { vendor_id: Number(vendorId), tag: "COSTING_FILE" },
      });

      // No costing files have ever been uploaded for this vendor yet —
      // the type only gets created lazily on first upload.
      if (!costingFileDocType) {
        return res.status(200).json({
          success: true,
          message: "No costing file documents found",
          logs: [...logs, "Costing File document type not yet created for vendor"],
          data: {
            lead_id: Number(leadId),
            vendor_id: Number(vendorId),
            document_type: "Costing File",
            total_documents: 0,
            documents: [],
            leadStage: "Unknown Stage",
          },
        });
      }

      const documents = await prisma.leadDocuments.findMany({
        where: {
          lead_id: Number(leadId),
          vendor_id: Number(vendorId),
          doc_type_id: costingFileDocType.id,
          is_deleted: false,
        },
        orderBy: { created_at: "desc" },
        include: {
          documentType: {
            select: { id: true, type: true, tag: true },
          },
          specificationDocumentMappings: {
            select: {
              specification: {
                select: { id: true, name: true },
              },
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
        },
      });

      const documentsWithSignedUrls = await Promise.all(
        documents.map(async (doc: any) => {
          let signedUrl: string | null = null;
          try {
            if (doc.doc_sys_name) {
              signedUrl = await generateSignedUrl(doc.doc_sys_name);
            }
          } catch (error: any) {
            console.error("getCostingFileDocuments signed URL error:", {
              docId: doc.id,
              docSysName: doc.doc_sys_name,
              message: error?.message || String(error),
            });
          }
          const specification = doc.specificationDocumentMappings?.[0]?.specification || null;
          const { specificationDocumentMappings, ...rest } = doc;
          return { ...rest, specification, signedUrl };
        }),
      );

      logs.push(
        `Found ${documents.length} costing file documents for lead ${leadId}`,
      );

      return res.status(200).json({
        success: true,
        message: "Costing file documents fetched successfully",
        logs,
        data: {
          lead_id: Number(leadId),
          vendor_id: Number(vendorId),
          document_type: costingFileDocType.type,
          total_documents: documents.length,
          documents: documentsWithSignedUrls,
          leadStage: "Unknown Stage",
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

  public static async uploadElectricalPlumbing(req: Request, res: Response) {
    try {
      const { vendorId, leadId, userId } = req.body;
      const rawInstanceIds = req.body.product_structure_instance_ids;

      if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one file is required",
        });
      }

      const files = req.files as Express.Multer.File[];
      const { uploadedDocs, actionMessage } = await prisma.$transaction(
        async (tx) => {
          const lead = await tx.leadMaster.findFirst({
            where: {
              id: Number(leadId),
              vendor_id: Number(vendorId),
              is_deleted: false,
            },
            select: {
              id: true,
              account_id: true,
              firstname: true,
              lastname: true,
            },
          });

          if (!lead) {
            throw new Error(`Invalid leadId ${leadId} for this vendor`);
          }

          if (!lead.account_id) {
            throw new Error("No account linked with this lead");
          }

          const accountId = lead.account_id;
          const vendor = await tx.vendorMaster.findUnique({
            where: { id: Number(vendorId) },
            select: { is_this_vendor_is_custom_usertype_only: true },
          });
          const useCustomVendorFlow =
            vendor?.is_this_vendor_is_custom_usertype_only === true;

          const requestedInstanceIds = Array.isArray(rawInstanceIds)
            ? rawInstanceIds
            : typeof rawInstanceIds === "string" && rawInstanceIds.length > 0
              ? [rawInstanceIds]
              : [];
          const parsedInstanceIds = useCustomVendorFlow
            ? [...new Set(
              requestedInstanceIds
                .map((value) => Number(value))
                .filter((value) => Number.isFinite(value) && value > 0),
            )]
            : [];

          const allLeadInstances = useCustomVendorFlow
            ? await tx.leadProductStructureInstance.findMany({
              where: {
                lead_id: Number(leadId),
                vendor_id: Number(vendorId),
                account_id: Number(accountId),
              },
              select: {
                id: true,
                title: true,
                productType: {
                  select: { type: true },
                },
              },
              orderBy: [{ product_structure_id: "asc" }, { quantity_index: "asc" }],
            })
            : [];

          const selectedInstances = useCustomVendorFlow
            ? parsedInstanceIds.length > 0
              ? allLeadInstances.filter((instance) =>
                parsedInstanceIds.includes(instance.id),
              )
              : allLeadInstances
            : [];

          if (
            useCustomVendorFlow &&
            parsedInstanceIds.length > 0 &&
            selectedInstances.length !== parsedInstanceIds.length
          ) {
            throw new Error("One or more selected product instances are invalid for this lead");
          }

          // Get-or-create the "Electrical & Plumbing" document type for this vendor
          let electricalPlumbingDocType = await tx.documentTypeMaster.findFirst({
            where: { vendor_id: Number(vendorId), tag: "ELECTRICAL_PLUMBING" },
          });

          if (!electricalPlumbingDocType) {
            electricalPlumbingDocType = await tx.documentTypeMaster.create({
              data: {
                vendor_id: Number(vendorId),
                type: "Electrical & Plumbing",
                tag: "ELECTRICAL_PLUMBING",
                doc_title: "Electrical & Plumbing",
                stage: "Designing",
              },
            });
          }

          let nextRevision = 0;
          let clientNameSegment = "";
          let structureSegment = "";
          let dateSegment = "";
          let instanceIdToPersist: number | null = null;

          if (useCustomVendorFlow) {
            const structureLabelSource =
              selectedInstances.length > 0 ? selectedInstances : allLeadInstances;
            const uniqueStructureNames = [
              ...new Set(
                structureLabelSource
                  .map((instance) => instance.productType?.type)
                  .filter(Boolean),
              ),
            ];
            structureSegment = sanitizeFilename(
              uniqueStructureNames.length > 0
                ? uniqueStructureNames.join("_")
                : "General",
            )
              .replace(/_+/g, "_")
              .slice(0, 80);
            clientNameSegment = sanitizeFilename(
              `${lead.firstname ?? ""}${lead.lastname ?? ""}` || "Client",
            )
              .replace(/_+/g, "_")
              .slice(0, 50);
            const now = new Date();
            dateSegment = [
              now.getFullYear(),
              String(now.getMonth() + 1).padStart(2, "0"),
              String(now.getDate()).padStart(2, "0"),
            ].join("-");

            const existingEPDocs = await tx.leadDocuments.findMany({
              where: {
                vendor_id: Number(vendorId),
                lead_id: Number(leadId),
                doc_type_id: electricalPlumbingDocType.id,
                is_deleted: false,
              },
              select: { doc_og_name: true },
            });
            nextRevision =
              existingEPDocs.reduce((maxRevision, doc) => {
                const match = doc.doc_og_name?.match(/^E(\d+)-/i);
                const revision = match ? Number(match[1]) : -1;
                return Number.isFinite(revision)
                  ? Math.max(maxRevision, revision)
                  : maxRevision;
              }, -1) + 1;

            instanceIdToPersist =
              selectedInstances.length === 1 ? selectedInstances[0].id : null;
          }

          const newDocs: any[] = [];
          for (const file of files) {
            const finalOriginalName = useCustomVendorFlow
              ? (() => {
                const extension = path.extname(file.originalname || "");
                const renamedOriginalName = `E${nextRevision}-${clientNameSegment}-${structureSegment}-${dateSegment}${extension}`;
                nextRevision += 1;
                return renamedOriginalName;
              })()
              : file.originalname;

            const sysName = await uploadToWasabiElectricalPlumbing(
              file.path,
              Number(vendorId),
              Number(leadId),
              finalOriginalName,
              file.mimetype,
            );

            await fs.unlink(file.path);

            const doc = await tx.leadDocuments.create({
              data: {
                doc_og_name: finalOriginalName,
                doc_sys_name: sysName,
                vendor_id: Number(vendorId),
                lead_id: Number(leadId),
                account_id: Number(accountId),
                doc_type_id: electricalPlumbingDocType.id,
                created_by: Number(userId),
                product_structure_instance_id: instanceIdToPersist,
              },
            });

            newDocs.push(doc);
          }

          const message =
            newDocs.length > 1
              ? `${newDocs.length} Electrical & Plumbing files have been uploaded successfully.`
              : "Electrical & Plumbing file has been uploaded successfully.";

          const detailedLog = await createLeadLog(tx, {
            vendor_id: Number(vendorId),
            lead_id: Number(leadId),
            account_id: Number(accountId),
            action: message,
            action_type: "CREATE",
            created_by: Number(userId),
            created_at: new Date(),
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
      console.error("uploadElectricalPlumbing error:", error);
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  public static async getElectricalPlumbingDocuments(req: Request, res: Response) {
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

      const electricalPlumbingDocType = await prisma.documentTypeMaster.findFirst({
        where: { vendor_id: Number(vendorId), tag: "ELECTRICAL_PLUMBING" },
      });

      // No electrical & plumbing files have ever been uploaded for this vendor yet —
      // the type only gets created lazily on first upload.
      if (!electricalPlumbingDocType) {
        return res.status(200).json({
          success: true,
          message: "No electrical & plumbing documents found",
          logs: [...logs, "Electrical & Plumbing document type not yet created for vendor"],
          data: {
            lead_id: Number(leadId),
            vendor_id: Number(vendorId),
            document_type: "Electrical & Plumbing",
            total_documents: 0,
            documents: [],
            leadStage: "Unknown Stage",
          },
        });
      }

      const documents = await prisma.leadDocuments.findMany({
        where: {
          lead_id: Number(leadId),
          vendor_id: Number(vendorId),
          doc_type_id: electricalPlumbingDocType.id,
          is_deleted: false,
        },
        orderBy: { created_at: "desc" },
        include: {
          documentType: {
            select: { id: true, type: true, tag: true },
          },
          createdBy: {
            select: {
              id: true,
              user_name: true,
              user_email: true,
              user_contact: true,
            },
          },
        },
      });

      const documentsWithSignedUrls = await Promise.all(
        documents.map(async (doc: any) => {
          const signedUrl = await generateSignedUrl(doc.doc_sys_name);
          return { ...doc, signedUrl };
        }),
      );

      logs.push(
        `Found ${documents.length} electrical & plumbing documents for lead ${leadId}`,
      );

      return res.status(200).json({
        success: true,
        message: "Electrical & Plumbing documents fetched successfully",
        logs,
        data: {
          lead_id: Number(leadId),
          vendor_id: Number(vendorId),
          document_type: electricalPlumbingDocType.type,
          total_documents: documents.length,
          documents: documentsWithSignedUrls,
          leadStage: "Unknown Stage",
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

  public static async uploadFinalIsmUpload(req: Request, res: Response) {
    try {
      const { vendorId, leadId, userId } = req.body;
      const rawInstanceIds = req.body.product_structure_instance_ids;

      if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one file is required",
        });
      }

      const files = req.files as Express.Multer.File[];
      const { uploadedDocs, actionMessage } = await prisma.$transaction(
        async (tx) => {
          const lead = await tx.leadMaster.findFirst({
            where: {
              id: Number(leadId),
              vendor_id: Number(vendorId),
              is_deleted: false,
            },
            select: {
              id: true,
              account_id: true,
              firstname: true,
              lastname: true,
            },
          });

          if (!lead) {
            throw new Error(`Invalid leadId ${leadId} for this vendor`);
          }

          if (!lead.account_id) {
            throw new Error("No account linked with this lead");
          }

          const accountId = lead.account_id;
          const vendor = await tx.vendorMaster.findUnique({
            where: { id: Number(vendorId) },
            select: { is_this_vendor_is_custom_usertype_only: true },
          });
          const useCustomVendorFlow =
            vendor?.is_this_vendor_is_custom_usertype_only === true;

          const requestedInstanceIds = Array.isArray(rawInstanceIds)
            ? rawInstanceIds
            : typeof rawInstanceIds === "string" && rawInstanceIds.length > 0
              ? [rawInstanceIds]
              : [];
          const parsedInstanceIds = useCustomVendorFlow
            ? [...new Set(
              requestedInstanceIds
                .map((value) => Number(value))
                .filter((value) => Number.isFinite(value) && value > 0),
            )]
            : [];

          const allLeadInstances = useCustomVendorFlow
            ? await tx.leadProductStructureInstance.findMany({
              where: {
                lead_id: Number(leadId),
                vendor_id: Number(vendorId),
                account_id: Number(accountId),
              },
              select: {
                id: true,
                title: true,
                productType: {
                  select: { type: true },
                },
              },
              orderBy: [{ product_structure_id: "asc" }, { quantity_index: "asc" }],
            })
            : [];

          const selectedInstances = useCustomVendorFlow
            ? parsedInstanceIds.length > 0
              ? allLeadInstances.filter((instance) =>
                parsedInstanceIds.includes(instance.id),
              )
              : allLeadInstances
            : [];

          if (
            useCustomVendorFlow &&
            parsedInstanceIds.length > 0 &&
            selectedInstances.length !== parsedInstanceIds.length
          ) {
            throw new Error("One or more selected product instances are invalid for this lead");
          }

          // Get-or-create the "Final ISM Upload" document type for this vendor
          let finalIsmUploadDocType = await tx.documentTypeMaster.findFirst({
            where: { vendor_id: Number(vendorId), tag: "FINAL_ISM_UPLOAD" },
          });

          if (!finalIsmUploadDocType) {
            finalIsmUploadDocType = await tx.documentTypeMaster.create({
              data: {
                vendor_id: Number(vendorId),
                type: "Final ISM Upload",
                tag: "FINAL_ISM_UPLOAD",
                doc_title: "Final ISM Upload",
                stage: "Designing",
              },
            });
          }

          let nextRevision = 0;
          let clientNameSegment = "";
          let structureSegment = "";
          let dateSegment = "";
          let instanceIdToPersist: number | null = null;

          if (useCustomVendorFlow) {
            const structureLabelSource =
              selectedInstances.length > 0 ? selectedInstances : allLeadInstances;
            const uniqueStructureNames = [
              ...new Set(
                structureLabelSource
                  .map((instance) => instance.productType?.type)
                  .filter(Boolean),
              ),
            ];
            structureSegment = sanitizeFilename(
              uniqueStructureNames.length > 0
                ? uniqueStructureNames.join("_")
                : "General",
            )
              .replace(/_+/g, "_")
              .slice(0, 80);
            clientNameSegment = sanitizeFilename(
              `${lead.firstname ?? ""}${lead.lastname ?? ""}` || "Client",
            )
              .replace(/_+/g, "_")
              .slice(0, 50);
            const now = new Date();
            dateSegment = [
              now.getFullYear(),
              String(now.getMonth() + 1).padStart(2, "0"),
              String(now.getDate()).padStart(2, "0"),
            ].join("-");

            const existingFDocs = await tx.leadDocuments.findMany({
              where: {
                vendor_id: Number(vendorId),
                lead_id: Number(leadId),
                doc_type_id: finalIsmUploadDocType.id,
                is_deleted: false,
              },
              select: { doc_og_name: true },
            });
            nextRevision =
              existingFDocs.reduce((maxRevision, doc) => {
                const match = doc.doc_og_name?.match(/^F(\d+)-/i);
                const revision = match ? Number(match[1]) : -1;
                return Number.isFinite(revision)
                  ? Math.max(maxRevision, revision)
                  : maxRevision;
              }, -1) + 1;

            instanceIdToPersist =
              selectedInstances.length === 1 ? selectedInstances[0].id : null;
          }

          const newDocs: any[] = [];
          for (const file of files) {
            const finalOriginalName = useCustomVendorFlow
              ? (() => {
                const extension = path.extname(file.originalname || "");
                const renamedOriginalName = `F${nextRevision}-${clientNameSegment}-${structureSegment}-${dateSegment}${extension}`;
                nextRevision += 1;
                return renamedOriginalName;
              })()
              : file.originalname;

            const sysName = await uploadToWasabiFinalIsmUpload(
              file.path,
              Number(vendorId),
              Number(leadId),
              finalOriginalName,
              file.mimetype,
            );

            await fs.unlink(file.path);

            const doc = await tx.leadDocuments.create({
              data: {
                doc_og_name: finalOriginalName,
                doc_sys_name: sysName,
                vendor_id: Number(vendorId),
                lead_id: Number(leadId),
                account_id: Number(accountId),
                doc_type_id: finalIsmUploadDocType.id,
                created_by: Number(userId),
                product_structure_instance_id: instanceIdToPersist,
              },
            });

            newDocs.push(doc);
          }

          const message =
            newDocs.length > 1
              ? `${newDocs.length} Final ISM Upload files have been uploaded successfully.`
              : "Final ISM Upload file has been uploaded successfully.";

          const detailedLog = await createLeadLog(tx, {
            vendor_id: Number(vendorId),
            lead_id: Number(leadId),
            account_id: Number(accountId),
            action: message,
            action_type: "CREATE",
            created_by: Number(userId),
            created_at: new Date(),
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
      console.error("uploadFinalIsmUpload error:", error);
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  public static async getFinalIsmUploadDocuments(req: Request, res: Response) {
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

      const finalIsmUploadDocType = await prisma.documentTypeMaster.findFirst({
        where: { vendor_id: Number(vendorId), tag: "FINAL_ISM_UPLOAD" },
      });

      // No Final ISM Upload files have ever been uploaded for this vendor yet —
      // the type only gets created lazily on first upload.
      if (!finalIsmUploadDocType) {
        return res.status(200).json({
          success: true,
          message: "No Final ISM Upload documents found",
          logs: [...logs, "Final ISM Upload document type not yet created for vendor"],
          data: {
            lead_id: Number(leadId),
            vendor_id: Number(vendorId),
            document_type: "Final ISM Upload",
            total_documents: 0,
            documents: [],
            leadStage: "Unknown Stage",
          },
        });
      }

      const documents = await prisma.leadDocuments.findMany({
        where: {
          lead_id: Number(leadId),
          vendor_id: Number(vendorId),
          doc_type_id: finalIsmUploadDocType.id,
          is_deleted: false,
        },
        orderBy: { created_at: "desc" },
        include: {
          documentType: {
            select: { id: true, type: true, tag: true },
          },
          createdBy: {
            select: {
              id: true,
              user_name: true,
              user_email: true,
              user_contact: true,
            },
          },
        },
      });

      const documentsWithSignedUrls = await Promise.all(
        documents.map(async (doc: any) => {
          const signedUrl = await generateSignedUrl(doc.doc_sys_name);
          return { ...doc, signedUrl };
        }),
      );

      logs.push(
        `Found ${documents.length} Final ISM Upload documents for lead ${leadId}`,
      );

      return res.status(200).json({
        success: true,
        message: "Final ISM Upload documents fetched successfully",
        logs,
        data: {
          lead_id: Number(leadId),
          vendor_id: Number(vendorId),
          document_type: finalIsmUploadDocType.type,
          total_documents: documents.length,
          documents: documentsWithSignedUrls,
          leadStage: "Unknown Stage",
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

  public static async editDesignMeeting(req: Request, res: Response) {
    try {
      const { meetingId } = req.params;
      const {
        vendorId,
        userId,
        date,
        desc,
        meeting_start_time,
        meeting_end_time,
      } = req.body;

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
        meeting_start_time == null &&
        meeting_end_time == null &&
        (!req.files || (req.files as Express.Multer.File[]).length === 0)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "At least one field (date, desc, meeting time, or files) must be provided for update",
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

      if (meeting_start_time != null) {
        if (meeting_start_time && !isValidMeetingTime(meeting_start_time)) {
          return res.status(400).json({
            success: false,
            message: "meeting_start_time must be in HH:mm format",
          });
        }

        updateData.meeting_start_time = meeting_start_time?.trim() || null;
      }

      if (meeting_end_time != null) {
        if (meeting_end_time && !isValidMeetingTime(meeting_end_time)) {
          return res.status(400).json({
            success: false,
            message: "meeting_end_time must be in HH:mm format",
          });
        }

        updateData.meeting_end_time = meeting_end_time?.trim() || null;
      }

      const nextStartTime =
        updateData.meeting_start_time ?? existingMeeting.meeting_start_time;
      const nextEndTime =
        updateData.meeting_end_time ?? existingMeeting.meeting_end_time;

      if (
        nextStartTime &&
        nextEndTime &&
        isValidMeetingTime(nextStartTime) &&
        isValidMeetingTime(nextEndTime) &&
        nextStartTime >= nextEndTime
      ) {
        return res.status(400).json({
          success: false,
          message: "meeting_end_time must be after meeting_start_time",
        });
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

      const detailedLog = await createLeadLog(prisma, {
        vendor_id: Number(vendor_id),
        lead_id: Number(lead_id),
        account_id: Number(account_id),
        action: actionMessage, // includes the remark now
        action_type: "CREATE",
        created_by: Number(created_by),
        created_at: new Date(),
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

      const detailedLog = await createLeadLog(prisma, {
        vendor_id: vendor_id,
        lead_id: lead_id,
        account_id: account_id,
        action: actionMessage,
        action_type: "UPDATE",
        created_by: Number(updated_by),
        created_at: new Date(),
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
          is_fast_production: true,
          client_required_order_login_complition_date: true,
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
          is_fast_production: lead.is_fast_production,
          client_required_order_login_complition_date:
            lead.client_required_order_login_complition_date,
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

  public static async getLeadSpecifications(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const specifications = await prisma.leadSpecificationsMaster.findMany({
        where: {
          vendor_id: Number(vendorId),
          lead_id: Number(leadId),
        },
        include: {
          productItemCode: {
            select: { id: true, item_code: true },
          },
        },
        orderBy: { created_at: "asc" },
      });

      const actorRole = await DesigingStageController.getActorRole(req);
      const latestSpecByItemCode = new Map<number, number>();

      [...specifications]
        .sort((a, b) => {
          const timeDiff =
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          return timeDiff !== 0 ? timeDiff : b.id - a.id;
        })
        .forEach((specification) => {
          const key = DesigingStageController.normalizeSpecItemCodeId(
            specification.item_code_id,
          );
          if (!latestSpecByItemCode.has(key)) {
            latestSpecByItemCode.set(key, specification.id);
          }
        });

      const specificationsWithMeta = specifications.map((specification) => {
        const key = DesigingStageController.normalizeSpecItemCodeId(
          specification.item_code_id,
        );
        const isLatestForItemCode =
          latestSpecByItemCode.get(key) === specification.id;

        return {
          ...specification,
          is_latest_for_item_code: isLatestForItemCode,
          is_editable:
            actorRole === "super-admin" ? true : isLatestForItemCode,
        };
      });

      return res.status(200).json({
        success: true,
        message: "Lead specifications fetched successfully",
        data: specificationsWithMeta,
      });
    } catch (error: any) {
      console.error("Error fetching lead specifications:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  public static async createLeadSpecification(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;
      const { created_by, item_code_id } = req.body;

      if (!vendorId || !leadId || !created_by) {
        return res.status(400).json({
          success: false,
          message: "vendorId, leadId and created_by are required",
        });
      }

      const specification = await prisma.$transaction(async (tx) => {
        const existingLead = await tx.leadMaster.findFirst({
          where: { id: Number(leadId), vendor_id: Number(vendorId), is_deleted: false },
        });

        if (!existingLead) {
          throw new Error("Lead not found or access denied");
        }

        let existingItemCode: { id: number; item_code: string } | null = null;
        if (item_code_id) {
          existingItemCode = await tx.productItemCode.findFirst({
            where: { id: Number(item_code_id), vendor_id: Number(vendorId) },
            select: { id: true, item_code: true },
          });

          if (!existingItemCode) {
            throw new Error("Item code not found or access denied");
          }
        }

        const existingCount = await tx.leadSpecificationsMaster.count({
          where: { vendor_id: Number(vendorId), lead_id: Number(leadId) },
        });

        const previousLatestSpecification = await tx.leadSpecificationsMaster.findFirst({
          where: {
            vendor_id: Number(vendorId),
            lead_id: Number(leadId),
            item_code_id: item_code_id ? Number(item_code_id) : null,
          },
          orderBy: [
            { created_at: "desc" },
            { id: "desc" },
          ],
          include: {
            lightCarcasUnitMappings: {
              select: {
                light_carcas_unit_master_id: true,
              },
            },
            otherAppliancesMappings: {
              select: {
                other_appliances_master_id: true,
              },
            },
            specificationDocumentMappings: {
              select: {
                document_id: true,
              },
            },
          },
        });

        const leadProductMapping = await tx.leadProductMapping.findFirst({
          where: { vendor_id: Number(vendorId), lead_id: Number(leadId) },
          orderBy: { id: "asc" },
          select: { productType: { select: { type: true } } },
        });

        const clientNameSegment = sanitizeFilename(
          `${existingLead.firstname ?? ""}${existingLead.lastname ?? ""}` ||
            "Client",
        );
        const itemGroupSegment = sanitizeFilename(
          existingItemCode?.item_code ||
            leadProductMapping?.productType?.type ||
            "General",
        );
        const now = new Date();
        const dateSegment = [
          now.getFullYear(),
          String(now.getMonth() + 1).padStart(2, "0"),
          String(now.getDate()).padStart(2, "0"),
        ].join("-");

        const specificationName = `S${existingCount}-${clientNameSegment}-${itemGroupSegment}-${dateSegment}`;

        const createdSpecification = await tx.leadSpecificationsMaster.create({
          data: {
            vendor_id: Number(vendorId),
            lead_id: Number(leadId),
            name: specificationName,
            created_by: Number(created_by),
            item_code_id: item_code_id ? Number(item_code_id) : undefined,
            lights_remark: previousLatestSpecification?.lights_remark ?? undefined,
          },
          include: {
            productItemCode: {
              select: { id: true, item_code: true },
            },
          },
        });

        if (previousLatestSpecification) {
          if (previousLatestSpecification.lightCarcasUnitMappings.length > 0) {
            await tx.leadLightCarcasUnitMapping.createMany({
              data: previousLatestSpecification.lightCarcasUnitMappings.map(
                (mapping) => ({
                  vendor_id: Number(vendorId),
                  lead_id: Number(leadId),
                  specs_id: createdSpecification.id,
                  light_carcas_unit_master_id:
                    mapping.light_carcas_unit_master_id,
                  created_by: Number(created_by),
                }),
              ),
            });
          }

          if (previousLatestSpecification.otherAppliancesMappings.length > 0) {
            await tx.leadOtherAppliancesMapping.createMany({
              data: previousLatestSpecification.otherAppliancesMappings.map(
                (mapping) => ({
                  vendor_id: Number(vendorId),
                  lead_id: Number(leadId),
                  specs_id: createdSpecification.id,
                  other_appliances_master_id:
                    mapping.other_appliances_master_id,
                  created_by: Number(created_by),
                }),
              ),
            });
          }

          if (previousLatestSpecification.specificationDocumentMappings.length > 0) {
            await tx.specificationDocumentMapping.createMany({
              data: previousLatestSpecification.specificationDocumentMappings.map(
                (mapping) => ({
                  vendor_id: Number(vendorId),
                  lead_id: Number(leadId),
                  specs_id: createdSpecification.id,
                  document_id: mapping.document_id,
                  created_by: Number(created_by),
                }),
              ),
            });
          }
        }

        return {
          ...createdSpecification,
          is_latest_for_item_code: true,
          is_editable: true,
        };
      });

      return res.status(201).json({
        success: true,
        message: "Lead specification created successfully",
        data: specification,
      });
    } catch (error: any) {
      console.error("Error creating lead specification:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  public static async updateLeadSpecificationLightsRemark(
    req: Request,
    res: Response,
  ) {
    try {
      const specsId = Number(req.params.specsId);
      const { lights_remark } = req.body;

      const allowedValues = [
        "In our scope",
        "Not in our scope",
        "Provide only grooves",
      ];

      if (!specsId || !allowedValues.includes(lights_remark)) {
        return res.status(400).json({
          success: false,
          message: `specsId is required and lights_remark must be one of: ${allowedValues.join(", ")}`,
        });
      }

      await DesigingStageController.ensureSpecificationEditable(req, specsId);

      const specification = await prisma.leadSpecificationsMaster.update({
        where: { id: specsId },
        data: { lights_remark },
      });

      return res.status(200).json({
        success: true,
        message: "Lights remark updated successfully",
        data: specification,
      });
    } catch (error: any) {
      console.error("Error updating lead specification lights remark:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  public static async getLeadCarcassMaterialMappings(
    req: Request,
    res: Response,
  ) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const mappings = await prisma.leadCarcassMaterialMapping.findMany({
        where: {
          vendor_id: vendorId,
          lead_id: leadId,
        },
        include: {
          carcassType: { select: { id: true, name: true } },
          carcasMaterial: { select: { id: true, name: true } },
          carcassMaterialFinish: { select: { id: true, name: true } },
        },
        orderBy: { id: "asc" },
      });

      return res.status(200).json({
        success: true,
        message: "Lead carcass material mappings fetched successfully",
        data: mappings,
      });
    } catch (error: any) {
      console.error("Error fetching lead carcass material mappings:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  public static async upsertLeadCarcassMaterialMapping(
    req: Request,
    res: Response,
  ) {
    try {
      const id = req.body.id ? Number(req.body.id) : undefined;
      const vendorId = Number(req.body.vendor_id);
      const leadId = Number(req.body.lead_id);
      const carcassTypeId = Number(req.body.carcass_type_id);
      const carcasMaterialId = Number(req.body.carcas_material_id);
      const carcassMaterialFinishId = Number(req.body.carcass_material_finish_id);
      const createdBy = Number(req.body.created_by);

      if (
        !vendorId ||
        !leadId ||
        !carcassTypeId ||
        !carcasMaterialId ||
        !carcassMaterialFinishId ||
        !createdBy
      ) {
        return res.status(400).json({
          success: false,
          message:
            "vendor_id, lead_id, carcass_type_id, carcas_material_id, carcass_material_finish_id and created_by are required",
        });
      }

      const data = {
        vendor_id: vendorId,
        lead_id: leadId,
        carcass_type_id: carcassTypeId,
        carcas_material_id: carcasMaterialId,
        carcass_material_finish_id: carcassMaterialFinishId,
        created_by: createdBy,
      };

      const existingDuplicate = await prisma.leadCarcassMaterialMapping.findFirst({
        where: {
          vendor_id: vendorId,
          lead_id: leadId,
          carcass_type_id: carcassTypeId,
          carcas_material_id: carcasMaterialId,
          carcass_material_finish_id: carcassMaterialFinishId,
          ...(id ? { NOT: { id } } : {}),
        },
        select: { id: true },
      });

      if (existingDuplicate) {
        return res.status(400).json({
          success: false,
          message:
            "This carcass type, material, and finish combination already exists for this lead.",
        });
      }

      const mapping = id
        ? await prisma.leadCarcassMaterialMapping.update({
            where: { id },
            data,
            include: {
              carcassType: { select: { id: true, name: true } },
              carcasMaterial: { select: { id: true, name: true } },
              carcassMaterialFinish: { select: { id: true, name: true } },
            },
          })
        : await prisma.leadCarcassMaterialMapping.create({
            data,
            include: {
              carcassType: { select: { id: true, name: true } },
              carcasMaterial: { select: { id: true, name: true } },
              carcassMaterialFinish: { select: { id: true, name: true } },
            },
          });

      return res.status(200).json({
        success: true,
        message: id
          ? "Lead carcass material mapping updated successfully"
          : "Lead carcass material mapping created successfully",
        data: mapping,
      });
    } catch (error: any) {
      console.error("Error saving lead carcass material mapping:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  public static async getLeadShutterMaterialMappings(
    req: Request,
    res: Response,
  ) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const mappings = await prisma.leadShutterMaterialMapping.findMany({
        where: {
          vendor_id: vendorId,
          lead_id: leadId,
        },
        include: {
          shutterType: { select: { id: true, name: true } },
          shutterMaterial: { select: { id: true, name: true } },
          shutterMaterialFinish: { select: { id: true, name: true } },
        },
        orderBy: { id: "asc" },
      });

      return res.status(200).json({
        success: true,
        message: "Lead shutter material mappings fetched successfully",
        data: mappings,
      });
    } catch (error: any) {
      console.error("Error fetching lead shutter material mappings:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  public static async upsertLeadShutterMaterialMapping(
    req: Request,
    res: Response,
  ) {
    try {
      const id = req.body.id ? Number(req.body.id) : undefined;
      const vendorId = Number(req.body.vendor_id);
      const leadId = Number(req.body.lead_id);
      const shutterTypeId = Number(req.body.shutter_type_id);
      const shutterMaterialId = Number(req.body.shutter_material_id);
      const shutterMaterialFinishId = Number(req.body.shutter_material_finish_id);
      const createdBy = Number(req.body.created_by);

      if (
        !vendorId ||
        !leadId ||
        !shutterTypeId ||
        !shutterMaterialId ||
        !shutterMaterialFinishId ||
        !createdBy
      ) {
        return res.status(400).json({
          success: false,
          message:
            "vendor_id, lead_id, shutter_type_id, shutter_material_id, shutter_material_finish_id and created_by are required",
        });
      }

      const data = {
        vendor_id: vendorId,
        lead_id: leadId,
        shutter_type_id: shutterTypeId,
        shutter_material_id: shutterMaterialId,
        shutter_material_finish_id: shutterMaterialFinishId,
        created_by: createdBy,
      };

      const existingDuplicate = await prisma.leadShutterMaterialMapping.findFirst({
        where: {
          vendor_id: vendorId,
          lead_id: leadId,
          shutter_type_id: shutterTypeId,
          shutter_material_id: shutterMaterialId,
          shutter_material_finish_id: shutterMaterialFinishId,
          ...(id ? { NOT: { id } } : {}),
        },
        select: { id: true },
      });

      if (existingDuplicate) {
        return res.status(400).json({
          success: false,
          message:
            "This shutter type, material, and finish combination already exists for this lead.",
        });
      }

      const mapping = id
        ? await prisma.leadShutterMaterialMapping.update({
            where: { id },
            data,
            include: {
              shutterType: { select: { id: true, name: true } },
              shutterMaterial: { select: { id: true, name: true } },
              shutterMaterialFinish: { select: { id: true, name: true } },
            },
          })
        : await prisma.leadShutterMaterialMapping.create({
            data,
            include: {
              shutterType: { select: { id: true, name: true } },
              shutterMaterial: { select: { id: true, name: true } },
              shutterMaterialFinish: { select: { id: true, name: true } },
            },
          });

      return res.status(200).json({
        success: true,
        message: id
          ? "Lead shutter material mapping updated successfully"
          : "Lead shutter material mapping created successfully",
        data: mapping,
      });
    } catch (error: any) {
      console.error("Error saving lead shutter material mapping:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  public static async getLeadHardwareMappings(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const mappings = await prisma.leadHardwareMapping.findMany({
        where: {
          vendor_id: vendorId,
          lead_id: leadId,
        },
        include: {
          carcassLegs: { select: { id: true, name: true } },
          skirtingCarcassLegs: {
            select: { id: true, name: true, inScope: true },
          },
          skirtingCarcassLegsColor: { select: { id: true, color: true } },
        },
        orderBy: { id: "asc" },
      });

      return res.status(200).json({
        success: true,
        message: "Lead hardware mappings fetched successfully",
        data: mappings,
      });
    } catch (error: any) {
      console.error("Error fetching lead hardware mappings:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  public static async upsertLeadHardwareMapping(req: Request, res: Response) {
    try {
      const id = req.body.id ? Number(req.body.id) : undefined;
      const vendorId = Number(req.body.vendor_id);
      const leadId = Number(req.body.lead_id);
      const carcassLegsId = Number(req.body.carcass_legs_id);
      const skirtingCarcassLegsId = Number(req.body.skirting_carcass_legs_id);
      const skirtingCarcassLegsColorId = req.body.skirting_carcass_legs_color_id
        ? Number(req.body.skirting_carcass_legs_color_id)
        : null;
      const note =
        typeof req.body.note === "string" && req.body.note.trim().length > 0
          ? req.body.note
          : null;
      const createdBy = Number(req.body.created_by);

      if (
        !vendorId ||
        !leadId ||
        !carcassLegsId ||
        !skirtingCarcassLegsId ||
        !createdBy
      ) {
        return res.status(400).json({
          success: false,
          message:
            "vendor_id, lead_id, carcass_legs_id, skirting_carcass_legs_id and created_by are required",
        });
      }

      const data = {
        vendor_id: vendorId,
        lead_id: leadId,
        carcass_legs_id: carcassLegsId,
        skirting_carcass_legs_id: skirtingCarcassLegsId,
        skirting_carcass_legs_color_id: skirtingCarcassLegsColorId,
        note,
        created_by: createdBy,
      };

      const existingDuplicate = await prisma.leadHardwareMapping.findFirst({
        where: {
          vendor_id: vendorId,
          lead_id: leadId,
          carcass_legs_id: carcassLegsId,
          skirting_carcass_legs_id: skirtingCarcassLegsId,
          skirting_carcass_legs_color_id: skirtingCarcassLegsColorId,
          ...(id ? { NOT: { id } } : {}),
        },
        select: { id: true },
      });

      if (existingDuplicate) {
        return res.status(400).json({
          success: false,
          message:
            "This carcass legs, skirting, and color combination already exists for this lead.",
        });
      }

      const includeShape = {
        carcassLegs: { select: { id: true, name: true } },
        skirtingCarcassLegs: {
          select: { id: true, name: true, inScope: true },
        },
        skirtingCarcassLegsColor: { select: { id: true, color: true } },
      };

      const mapping = id
        ? await prisma.leadHardwareMapping.update({
            where: { id },
            data,
            include: includeShape,
          })
        : await prisma.leadHardwareMapping.create({
            data,
            include: includeShape,
          });

      return res.status(200).json({
        success: true,
        message: id
          ? "Lead hardware mapping updated successfully"
          : "Lead hardware mapping created successfully",
        data: mapping,
      });
    } catch (error: any) {
      console.error("Error saving lead hardware mapping:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  public static async getLeadLightCarcasUnitMappings(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);
      const specsId = Number(req.params.specsId);

      if (!vendorId || !leadId || !specsId) {
        return res.status(400).json({
          success: false,
          message: "vendorId, leadId and specsId are required",
        });
      }

      const mappings = await prisma.leadLightCarcasUnitMapping.findMany({
        where: {
          vendor_id: vendorId,
          lead_id: leadId,
          specs_id: specsId,
        },
        include: {
          lightCarcasUnit: {
            select: {
              id: true,
              type: true,
              light_carcas_type_id: true,
              lightCarcasType: { select: { id: true, type: true } },
            },
          },
        },
        orderBy: { id: "asc" },
      });

      return res.status(200).json({
        success: true,
        message: "Lead light carcas unit mappings fetched successfully",
        data: mappings,
      });
    } catch (error: any) {
      console.error("Error fetching lead light carcas unit mappings:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  public static async upsertLeadLightCarcasUnitMapping(req: Request, res: Response) {
    try {
      const id = req.body.id ? Number(req.body.id) : undefined;
      const vendorId = Number(req.body.vendor_id);
      const leadId = Number(req.body.lead_id);
      const specsId = Number(req.body.specs_id);
      const lightCarcasUnitMasterId = Number(req.body.light_carcas_unit_master_id);
      const createdBy = Number(req.body.created_by);

      if (
        !vendorId ||
        !leadId ||
        !specsId ||
        !lightCarcasUnitMasterId ||
        !createdBy
      ) {
        return res.status(400).json({
          success: false,
          message:
            "vendor_id, lead_id, specs_id, light_carcas_unit_master_id and created_by are required",
        });
      }

      await DesigingStageController.ensureSpecificationEditable(
        req,
        specsId,
        createdBy,
      );

      const data = {
        vendor_id: vendorId,
        lead_id: leadId,
        specs_id: specsId,
        light_carcas_unit_master_id: lightCarcasUnitMasterId,
        created_by: createdBy,
      };

      const existingDuplicate = await prisma.leadLightCarcasUnitMapping.findFirst({
        where: {
          vendor_id: vendorId,
          lead_id: leadId,
          specs_id: specsId,
          light_carcas_unit_master_id: lightCarcasUnitMasterId,
          ...(id ? { NOT: { id } } : {}),
        },
        select: { id: true },
      });

      if (existingDuplicate) {
        return res.status(400).json({
          success: false,
          message: "This carcas type and remark combination has already been added.",
        });
      }

      const includeShape = {
        lightCarcasUnit: {
          select: {
            id: true,
            type: true,
            light_carcas_type_id: true,
            lightCarcasType: { select: { id: true, type: true } },
          },
        },
      };

      const mapping = id
        ? await prisma.leadLightCarcasUnitMapping.update({
            where: { id },
            data,
            include: includeShape,
          })
        : await prisma.leadLightCarcasUnitMapping.create({
            data,
            include: includeShape,
          });

      return res.status(200).json({
        success: true,
        message: id
          ? "Lead light carcas unit mapping updated successfully"
          : "Lead light carcas unit mapping created successfully",
        data: mapping,
      });
    } catch (error: any) {
      console.error("Error saving lead light carcas unit mapping:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  public static async getLeadOtherAppliancesMappings(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);
      const specsId = Number(req.params.specsId);

      if (!vendorId || !leadId || !specsId) {
        return res.status(400).json({
          success: false,
          message: "vendorId, leadId and specsId are required",
        });
      }

      const mappings = await prisma.leadOtherAppliancesMapping.findMany({
        where: {
          vendor_id: vendorId,
          lead_id: leadId,
          specs_id: specsId,
        },
        include: {
          otherAppliances: {
            select: {
              id: true,
              type: true,
              article_number: true,
              description: true,
            },
          },
        },
        orderBy: { id: "asc" },
      });

      return res.status(200).json({
        success: true,
        message: "Lead other appliances mappings fetched successfully",
        data: mappings,
      });
    } catch (error: any) {
      console.error("Error fetching lead other appliances mappings:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  public static async upsertLeadOtherAppliancesMapping(req: Request, res: Response) {
    try {
      const id = req.body.id ? Number(req.body.id) : undefined;
      const vendorId = Number(req.body.vendor_id);
      const leadId = Number(req.body.lead_id);
      const specsId = Number(req.body.specs_id);
      const otherAppliancesMasterId = Number(req.body.other_appliances_master_id);
      const createdBy = Number(req.body.created_by);

      if (
        !vendorId ||
        !leadId ||
        !specsId ||
        !otherAppliancesMasterId ||
        !createdBy
      ) {
        return res.status(400).json({
          success: false,
          message:
            "vendor_id, lead_id, specs_id, other_appliances_master_id and created_by are required",
        });
      }

      await DesigingStageController.ensureSpecificationEditable(
        req,
        specsId,
        createdBy,
      );

      const data = {
        vendor_id: vendorId,
        lead_id: leadId,
        specs_id: specsId,
        other_appliances_master_id: otherAppliancesMasterId,
        created_by: createdBy,
      };

      const existingDuplicate = await prisma.leadOtherAppliancesMapping.findFirst({
        where: {
          vendor_id: vendorId,
          lead_id: leadId,
          specs_id: specsId,
          other_appliances_master_id: otherAppliancesMasterId,
          ...(id ? { NOT: { id } } : {}),
        },
        select: { id: true },
      });

      if (existingDuplicate) {
        return res.status(400).json({
          success: false,
          message: "This article has already been added.",
        });
      }

      const includeShape = {
        otherAppliances: {
          select: {
            id: true,
            type: true,
            article_number: true,
            description: true,
          },
        },
      };

      const mapping = id
        ? await prisma.leadOtherAppliancesMapping.update({
            where: { id },
            data,
            include: includeShape,
          })
        : await prisma.leadOtherAppliancesMapping.create({
            data,
            include: includeShape,
          });

      return res.status(200).json({
        success: true,
        message: id
          ? "Lead other appliances mapping updated successfully"
          : "Lead other appliances mapping created successfully",
        data: mapping,
      });
    } catch (error: any) {
      console.error("Error saving lead other appliances mapping:", error);
      return res.status(500).json({
        success: false,
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
