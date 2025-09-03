import { Request, Response } from "express";
import { validationResult } from "express-validator";
import { ApiResponse } from "../../../utils/apiResponse";
import { DesigingStage } from "../../../services/leadModuleServices/desigingStage/designing-stage.service";
import { prisma } from "../../../prisma/client";
import { generateSignedUrl, uploadToWasabi, uploadToWasabiMeetingDocs, uploadToWasabStage1Desings } from "../../../utils/wasabiClient";

export class DesigingStageController {

  public static async addToDesigingStage(req: Request, res: Response) {
    try {
      // ✅ Validate
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json(ApiResponse.validationError(errors.array().map(err => err.msg)));
      }

      const { lead_id, user_id, vendor_id } = req.body;

      const result = await DesigingStage.addToDesigingStage(
        Number(lead_id),
        Number(user_id),
        Number(vendor_id)
      );

      return res
        .status(200)
        .json(ApiResponse.success(result, "Lead status updated to 3 and log created"));
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
      const { vendorId, statusId } = req.params;
      const { page = "1", limit = "10" } = req.query;

      if (!vendorId || !statusId) {
        return res
          .status(400)
          .json(ApiResponse.validationError("vendorId and statusId are required"));
      }

      const result = await DesigingStage.getLeadsByStatus(
        Number(vendorId),
        Number(statusId),
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

      if (!req.file) {
        return res.status(400).json({ success: false, message: "File required" });
      }

      const doc = await DesigingStage.uploadQuotation({
        fileBuffer: req.file.buffer,
        originalName: req.file.originalname,
        vendorId: Number(vendorId),
        leadId: Number(leadId),
        userId: Number(userId),
        accountId: Number(accountId),
      });

      res.json({ success: true, document: doc });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
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
        accountId,
        date,
        desc
      } = req.body;

      if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
        return res.status(400).json({ success: false, message: "At least one file is required" });
      }

      const logs: any = [];
      const files = req.files as Express.Multer.File[];

      // 1️⃣ Check user belongs to vendor
      const user = await prisma.userMaster.findFirst({ where: { id: Number(userId), vendor_id: Number(vendorId) } });
      if (!user) return res.status(401).json({ success: false, logs: ["Unauthorized: User not in vendor"] });
      logs.push("User verified");

      // 2️⃣ Check lead existence
      const lead = await prisma.leadMaster.findFirst({ where: { id: Number(leadId), vendor_id: Number(vendorId), is_deleted: false } });
      if (!lead) return res.status(404).json({ success: false, logs: ["Lead not found"] });
      logs.push("Lead verified");

      // 3️⃣ Create Design Meeting
      const meeting = await prisma.leadDesignMeeting.create({
        data: {
          lead_id: Number(leadId),
          account_id: Number(accountId),
          vendor_id: Number(vendorId),
          date: new Date(date),
          desc,
          created_by: Number(userId),
        }
      });
      logs.push({ meetingCreated: meeting });

      const documents: any[] = [];
      const mapping: any[] = [];

      // 4️⃣ Upload files to Wasabi & create LeadDocuments + LeadDesignMeetingDocumentsMapping
      for (const file of files) {
        // Upload to Wasabi
        const sysName = await uploadToWasabiMeetingDocs(file.buffer, Number(vendorId), Number(leadId), file.originalname);
        logs.push({ fileUploaded: file.originalname, sysName });

        // Create LeadDocument
        const doc = await prisma.leadDocuments.create({
          data: {
            doc_og_name: file.originalname,
            doc_sys_name: sysName,
            vendor_id: Number(vendorId),
            lead_id: Number(leadId),
            account_id: Number(accountId),
            doc_type_id: 5, // design quotation
            created_by: Number(userId),
          }
        });
        documents.push(doc);
        logs.push({ documentCreated: doc });

        // Create DesignMeetingDocumentsMapping
        const map = await prisma.leadDesignMeetingDocumentsMapping.create({
          data: {
            lead_id: Number(leadId),
            account_id: Number(accountId),
            vendor_id: Number(vendorId),
            meeting_id: meeting.id,
            document_id: doc.id,
            created_at: new Date(),
            created_by: Number(userId),
          }
        });
        mapping.push(map);
        logs.push({ mappingCreated: map });
      }

      return res.status(201).json({
        success: true,
        logs,
        meeting,
        documents,
        mapping
      });

    } catch (error: any) {
      return res.status(500).json({ success: false, logs: [error.message] });
    }
  }

  public static async getDesignMeetings(req: Request, res: Response) {
    try {
      const { leadId, vendorId } = req.params;

      if (!leadId || !vendorId) {
        return res.status(400).json({
          success: false,
          logs: ["leadId and vendorId are required"]
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
        meetings.map(async (meeting) => {
          const mappings = (meeting as any).designMeetingDocsMapping as any[];
          const docsWithUrls = await Promise.all(
            mappings.map(async (map: any) => {
              const document = await prisma.leadDocuments.findUnique({ where: { id: map.document_id } });
              const signedUrl = document ? await generateSignedUrl(document.doc_sys_name) : null;
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
        return res.status(400).json({ success: false, message: "At least one file is required" });
      }

      const files = req.files as Express.Multer.File[];
      const uploadedDocs: any[] = [];

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
            doc_type_id: 6, // ✅ use correct doc_type_id for "Designs"
            created_by: Number(userId),
          },
        });

        uploadedDocs.push(doc);
      }

      return res.status(201).json({
        success: true,
        message: "Design files uploaded successfully",
        documents: uploadedDocs,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

}