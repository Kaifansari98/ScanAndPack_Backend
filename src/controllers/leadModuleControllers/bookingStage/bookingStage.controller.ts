import { Request, Response } from "express";
import { BookingStageService } from "../../../services/bookingStage/bookingStage.service";
import {
  AddPaymentDto,
  CreateBookingStageDto,
  UploadedFileRef,
} from "../../../types/booking-stage.dto";
import logger, { log } from "../../../utils/logger";
import {
  uploadToWasabiAdditionalPaymentFile,
  uploadToWasabiBookingFinalDocumentFile,
  uploadToWasabiBookingPaymentDetailsFile,
  uploadToWasabiCSPBookingPhotoFile,
} from "../../../utils/wasabiClient";
import fs from "node:fs/promises";
import { prisma } from "../../../prisma/client";
import { sendLeadAssignedToSiteSupervisorEmail } from "../../../services/email/brevoEmail.service";

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

export class BookingStageController {
  private bookingStageService = new BookingStageService();

  public createBookingStage = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const {
        lead_id,
        account_id,
        vendor_id,
        created_by,
        client_id,
        bookingAmount,
        bookingAmountPaymentDetailsText,
        finalBookingAmount,
        siteSupervisorId,
        mrpValue,
      } = req.body;

      if (
        !lead_id ||
        !account_id ||
        !vendor_id ||
        !created_by ||
        !client_id ||
        !bookingAmount ||
        !finalBookingAmount ||
        !siteSupervisorId ||
        !mrpValue
      ) {
        res
          .status(400)
          .json({ success: false, message: "Missing required fields" });
        return;
      }

      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const finalDocuments = files?.final_documents || [];
      const bookingAmountPaymentDetailsFile = files?.booking_payment_file?.[0];

      if (!finalDocuments || finalDocuments.length === 0) {
        res
          .status(400)
          .json({ success: false, message: "Final documents are mandatory" });
        return;
      }

      if (Number(mrpValue) < Number(finalBookingAmount)) {
        res.status(400).json({
          success: false,
          message: "MRP value cannot be less than Total Booking Value",
        });
        return;
      }

      const uploadedFinalDocuments: UploadedFileRef[] = [];

      for (const file of finalDocuments) {
        const sysName = await uploadToWasabiBookingFinalDocumentFile(
          file.path,
          Number(vendor_id),
          Number(lead_id),
          file.originalname,
          file.mimetype
        );

        await fs.unlink(file.path);

        uploadedFinalDocuments.push({
          originalName: file.originalname,
          sysName,
        });
      }

      let uploadedPaymentFile: UploadedFileRef | undefined;

      if (bookingAmountPaymentDetailsFile) {
        const sysName = await uploadToWasabiBookingPaymentDetailsFile(
          bookingAmountPaymentDetailsFile.path,
          Number(vendor_id),
          Number(lead_id),
          bookingAmountPaymentDetailsFile.originalname,
          bookingAmountPaymentDetailsFile.mimetype
        );

        await fs.unlink(bookingAmountPaymentDetailsFile.path);

        uploadedPaymentFile = {
          originalName: bookingAmountPaymentDetailsFile.originalname,
          sysName,
        };
      }

      const dto: CreateBookingStageDto = {
        lead_id: parseInt(lead_id),
        account_id: parseInt(account_id),
        vendor_id: parseInt(vendor_id),
        created_by: parseInt(created_by),
        client_id: parseInt(client_id),
        bookingAmount: parseFloat(bookingAmount),
        mrpValue: parseFloat(mrpValue),
        bookingAmountPaymentDetailsText,
        finalBookingAmount: parseFloat(finalBookingAmount),
        siteSupervisorId: parseInt(siteSupervisorId),
        finalDocuments: uploadedFinalDocuments,
        bookingAmountPaymentDetailsFile: uploadedPaymentFile,
      };

      const result = await this.bookingStageService.createBookingStage(dto);

      try {
        if (dto.siteSupervisorId !== dto.created_by) {
          const [supervisor, createdBy, lead] = await Promise.all([
            prisma.userMaster.findUnique({
              where: { id: dto.siteSupervisorId },
              select: { user_name: true, user_email: true },
            }),
            prisma.userMaster.findUnique({
              where: { id: dto.created_by },
              select: { user_name: true },
            }),
            prisma.leadMaster.findUnique({
              where: { id: dto.lead_id },
              select: {
                id: true,
                lead_code: true,
                firstname: true,
                lastname: true,
                country_code: true,
                contact_no: true,
                created_at: true,
                productMappings: {
                  select: { productType: { select: { type: true } } },
                },
                leadProductStructureMapping: {
                  select: { productStructure: { select: { type: true } } },
                },
              },
            }),
          ]);

          const supervisorEmail = supervisor?.user_email?.trim();
          if (!supervisorEmail) {
            logger.warn("Booking stage email skipped: missing supervisor email", {
              lead_id: dto.lead_id,
              assignee_user_id: dto.siteSupervisorId,
            });
          } else if (lead) {
            const leadName = `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim();
            const leadCode =
              lead.lead_code ?? `LEAD-${String(lead.id).padStart(4, "0")}`;
            const contactDetails = `${lead.country_code ?? ""} ${
              lead.contact_no ?? ""
            }`.trim();
            const furnitureType =
              lead.productMappings
                ?.map((item) => item.productType?.type)
                .filter(Boolean)
                .join(", ") || "—";
            const furnitureStructure =
              lead.leadProductStructureMapping
                ?.map((item) => item.productStructure?.type)
                .filter(Boolean)
                .join(", ") || "—";
            const createdDate = lead.created_at
              ? new Date(lead.created_at).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
              : "—";
            const createdByName = createdBy?.user_name ?? "Admin";
            const clientBaseUrl = resolveClientBaseUrl(req);
            const leadUrl = `${clientBaseUrl}/dashboard/leads/details/${dto.lead_id}?accountId=${dto.account_id}`;

            await sendLeadAssignedToSiteSupervisorEmail({
              toEmail: supervisorEmail,
              toName: supervisor?.user_name ?? undefined,
              leadCode,
              leadName: leadName || "—",
              contact: contactDetails || "—",
              furnitureType,
              furnitureStructure,
              createdDate,
              createdBy: createdByName,
              leadUrl,
            });
          }
        }
      } catch (emailError: any) {
        logger.warn("⚠️ Failed to send booking stage assignment email", {
          error: emailError?.message,
          lead_id: dto.lead_id,
          assignee_user_id: dto.siteSupervisorId,
        });
      }

      res.status(201).json({
        success: true,
        message: "Booking stage completed",
        data: result,
      });
    } catch (error: any) {
      console.error("[BookingStageController] Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  public addBookingStageFiles = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const { lead_id, account_id, vendor_id, created_by } = req.body;

      if (!lead_id || !account_id || !vendor_id || !created_by) {
        res
          .status(400)
          .json({ success: false, message: "Missing required fields" });
        return;
      }

      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const finalDocuments = files?.final_documents || [];

      if (!finalDocuments || finalDocuments.length === 0) {
        res.status(400).json({
          success: false,
          message:
            "[BOOKING STAGE] At least one file must be uploaded of finalDocuments",
        });
        return;
      }

      const uploadedFinalDocuments: UploadedFileRef[] = [];

      for (const file of finalDocuments) {
        const sysName = await uploadToWasabiBookingFinalDocumentFile(
          file.path,
          Number(vendor_id),
          Number(lead_id),
          file.originalname,
          file.mimetype
        );

        await fs.unlink(file.path);

        uploadedFinalDocuments.push({
          originalName: file.originalname,
          sysName,
        });
      }

      const dto = {
        lead_id: parseInt(lead_id),
        account_id: parseInt(account_id),
        vendor_id: parseInt(vendor_id),
        created_by: parseInt(created_by),
        finalDocuments: uploadedFinalDocuments,
      };

      const result = await this.bookingStageService.addBookingStageFiles(dto);
      res.status(201).json({
        success: true,
        message: "Final documents uploaded successfully",
        data: result,
      });
    } catch (error: any) {
      console.error("[BookingStageController] Error adding files:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  public getBookingStage = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const leadId = parseInt(req.params.leadId);
      const vendorId = parseInt(req.params.vendorId);

      if (!leadId) {
        res.status(400).json({ success: false, message: "leadId is required" });
        return;
      }

      const result = await this.bookingStageService.getBookingStage(
        leadId,
        vendorId
      );

      res.status(200).json({
        success: true,
        message: "Booking stage details fetched successfully",
        data: result,
      });
    } catch (error: any) {
      console.error("[BookingStageController] Get Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  public getBookingLeads = async (req: Request, res: Response) => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const userId = Number(req.query.userId);

      if (!vendorId || !userId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and userId are required",
        });
      }

      const leads = await BookingStageService.getLeadsWithStatusBooking(
        vendorId,
        userId
      );

      const count = leads.length;

      return res.status(200).json({
        success: true,
        message: "Leads with status_id = 4 fetched successfully",
        data: {
          leads, // ✅ array
          count, // ✅ number
        },
      });
    } catch (error: any) {
      console.error("[BookingStageController] GetStatus4Leads Error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Something went wrong",
      });
    }
  };

  /**
   * Get all vendor leads by tag (Type 1, Type 2, etc.)
   */
  public getVendorLeadsByTag = async (req: Request, res: Response) => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const userId = req.query.userId ? Number(req.query.userId) : null;
      const tag = req.query.tag as string;
      const page = parseInt((req.query.page as string) || "1");
      const limit = parseInt((req.query.limit as string) || "10");

      if (!vendorId || !tag) {
        logger.warn("Missing vendorId or tag", { vendorId, tag });
        return res.status(400).json({
          success: false,
          message: "Vendor ID and tag (e.g. Type 1, Type 2) are required",
        });
      }

      const { count, leads } = await BookingStageService.getVendorLeadsByTag(
        vendorId,
        tag,
        userId!
      );

      logger.info("Fetched vendor leads successfully", {
        vendorId,
        tag,
        count: leads.length,
      });

      const start = (page - 1) * limit;
      const paginatedLeads = leads.slice(start, start + limit);
      const totalPages = Math.ceil(count / limit);

      return res.status(200).json({
        success: true,
        message: `Leads with tag ${tag} fetched successfully`,
        count,
        data: paginatedLeads,
        pagination: {
          currentPage: page,
          totalPages,
          totalRecords: count,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      });
    } catch (error: any) {
      logger.error("[BookingStageController] getVendorLeadsByTag Error", {
        error: error.message,
        stack: error.stack,
      });
      return res.status(500).json({
        success: false,
        message: error.message || "Something went wrong",
      });
    }
  };

  public getOpenLeads = async (req: Request, res: Response) => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const userId = Number(req.query.userId || req.body.userId);

      if (!vendorId || !userId) {
        logger.warn("Missing vendorId or userId", { vendorId, userId });
        return res.status(400).json({
          success: false,
          message: "Vendor ID and User ID are required",
        });
      }

      const leads = await BookingStageService.getLeadsWithStatusOpen(
        vendorId,
        userId
      );
      const count = leads.length;

      logger.info("Fetched open leads successfully", {
        vendorId,
        userId,
        count,
      });

      return res.status(200).json({
        success: true,
        message: "Leads with open status fetched successfully",
        count,
        data: leads,
      });
    } catch (error: any) {
      logger.error("[BookingStageController] getOpenLeads Error", {
        error: error.message,
        stack: error.stack,
      });
      return res.status(500).json({
        success: false,
        message: error.message || "Something went wrong",
      });
    }
  };

  public getUniversalTableData = async (req: Request, res: Response) => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const userId = Number(req.query.userId || req.body.userId);
      const tag = (req.query.tag as string) || (req.body.tag as string);
      const page = parseInt((req.query.page as string) || "1");
      const limit = parseInt((req.query.limit as string) || "10");

      if (!vendorId || !userId) {
        logger.warn("Missing vendorId or userId", { vendorId, userId, tag });
        return res.status(400).json({
          success: false,
          message: "Vendor ID and User ID are required",
        });
      }

      const { leads, count } = await BookingStageService.getUniversalTableData(
        vendorId,
        userId,
        tag,
        page,
        limit
      );

      logger.info("Fetched universal table data successfully", {
        vendorId,
        userId,
        tag,
        count,
      });

      return res.status(200).json({
        success: true,
        message: "Universal table data fetched successfully",
        count,
        data: leads,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(count / limit),
          totalRecords: count,
          hasNext: page * limit < count,
          hasPrev: page > 1,
        },
      });
    } catch (error: any) {
      logger.error("[BookingStageController] getUniversalTableData Error", {
        error: error.message,
        stack: error.stack,
      });
      return res.status(500).json({
        success: false,
        message: error.message || "Something went wrong",
      });
    }
  };

  public editBookingStage = async (req: Request, res: Response) => {
    try {
      const dto = {
        lead_id: parseInt(req.body.lead_id),
        account_id: parseInt(req.body.account_id),
        vendor_id: parseInt(req.body.vendor_id),
        created_by: parseInt(req.body.created_by),
        client_id: req.body.client_id
          ? parseInt(req.body.client_id)
          : undefined,
        bookingAmount: req.body.bookingAmount
          ? parseFloat(req.body.bookingAmount)
          : undefined,
        finalBookingAmount: req.body.finalBookingAmount
          ? parseFloat(req.body.finalBookingAmount)
          : undefined,
        siteSupervisorId: req.body.siteSupervisorId
          ? parseInt(req.body.siteSupervisorId)
          : undefined,
        bookingAmountPaymentDetailsText:
          req.body.bookingAmountPaymentDetailsText || undefined, // ✅ added
      };

      const result = await this.bookingStageService.editBookingStage(dto);
      res.status(200).json({
        success: true,
        message: "Booking stage updated",
        data: result,
      });
    } catch (error: any) {
      console.error("[BookingStageController] Edit Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  public addPayment = async (req: Request, res: Response) => {
    try {
      const {
        lead_id,
        account_id,
        vendor_id,
        client_id,
        created_by,
        amount,
        payment_text,
        payment_date,
      } = req.body;

      if (
        !lead_id ||
        !account_id ||
        !vendor_id ||
        !client_id ||
        !created_by ||
        !amount ||
        !payment_text ||
        !payment_date
      ) {
        res
          .status(400)
          .json({ success: false, message: "Missing required fields" });
        return;
      }

      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const payment_file = files?.payment_file?.[0];

      let uploadedPaymentFile: UploadedFileRef | undefined;

      if (payment_file) {
        const sysName = await uploadToWasabiAdditionalPaymentFile(
          payment_file.path,
          Number(vendor_id),
          Number(lead_id),
          payment_file.originalname,
          payment_file.mimetype
        );

        await fs.unlink(payment_file.path);

        uploadedPaymentFile = {
          originalName: payment_file.originalname,
          sysName,
        };
      }

      const dto: AddPaymentDto = {
        lead_id: parseInt(lead_id),
        account_id: parseInt(account_id),
        vendor_id: parseInt(vendor_id),
        client_id: parseInt(client_id),
        created_by: parseInt(created_by),
        amount: parseFloat(amount),
        payment_text,
        payment_date,
        payment_file: uploadedPaymentFile,
      };

      const result = await this.bookingStageService.addPayment(dto);

      res.status(201).json({ success: true, data: result });
    } catch (error: any) {
      console.error("[AddPaymentController] Error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  public reassignSiteSupervisor = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const leadId = parseInt(req.params.leadId);
      const vendorId = parseInt(req.params.vendorId);
      const siteSupervisorId = parseInt(req.body.siteSupervisorId);
      const createdBy = parseInt(req.body.created_by);

      if (!leadId || !vendorId || !siteSupervisorId || !createdBy) {
        res.status(400).json({
          success: false,
          message:
            "leadId, vendorId, siteSupervisorId, and created_by are required",
        });
        return;
      }

      const result = await this.bookingStageService.reassignSiteSupervisor({
        lead_id: leadId,
        vendor_id: vendorId,
        siteSupervisorId,
        created_by: createdBy,
      });

      res.status(200).json({
        success: true,
        message: "Site supervisor reassigned successfully",
        data: result,
      });
    } catch (error: any) {
      console.error("[BookingStageController] Reassign Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  public updateMrpValue = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const leadId = parseInt(req.params.leadId);
      const vendorId = parseInt(req.params.vendorId);
      const mrpValue = Number(req.body.mrp_value);
      const updatedBy = parseInt(req.body.updated_by);

      if (!leadId || !vendorId || Number.isNaN(mrpValue) || !updatedBy) {
        res.status(400).json({
          success: false,
          message:
            "leadId, vendorId, mrp_value, and updated_by are required",
        });
        return;
      }

      const result = await this.bookingStageService.updateMrpValue({
        lead_id: leadId,
        vendor_id: vendorId,
        mrp_value: mrpValue,
        updated_by: updatedBy,
      });

      res.status(200).json({
        success: true,
        message: "MRP value updated successfully",
        data: result,
      });
    } catch (error: any) {
      console.error("[BookingStageController] updateMrpValue Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  public updateTotalProjectAmount = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const leadId = parseInt(req.params.leadId);
      const vendorId = parseInt(req.params.vendorId);
      const totalProjectAmount = Number(req.body.total_project_amount);
      const updatedBy = parseInt(req.body.updated_by);

      if (
        !leadId ||
        !vendorId ||
        Number.isNaN(totalProjectAmount) ||
        !updatedBy
      ) {
        res.status(400).json({
          success: false,
          message:
            "leadId, vendorId, total_project_amount, and updated_by are required",
        });
        return;
      }

      const result = await this.bookingStageService.updateTotalProjectAmount({
        lead_id: leadId,
        vendor_id: vendorId,
        total_project_amount: totalProjectAmount,
        updated_by: updatedBy,
      });

      res.status(200).json({
        success: true,
        message: "Total project amount updated successfully",
        data: result,
      });
    } catch (error: any) {
      console.error(
        "[BookingStageController] updateTotalProjectAmount Error:",
        error
      );
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  public updateBookingAmount = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const leadId = parseInt(req.params.leadId);
      const vendorId = parseInt(req.params.vendorId);
      const bookingAmount = Number(req.body.booking_amount);
      const updatedBy = parseInt(req.body.updated_by);

      if (
        !leadId ||
        !vendorId ||
        Number.isNaN(bookingAmount) ||
        !updatedBy
      ) {
        res.status(400).json({
          success: false,
          message:
            "leadId, vendorId, booking_amount, and updated_by are required",
        });
        return;
      }

      const result = await this.bookingStageService.updateBookingAmount({
        lead_id: leadId,
        vendor_id: vendorId,
        booking_amount: bookingAmount,
        updated_by: updatedBy,
      });

      res.status(200).json({
        success: true,
        message: "Booking amount updated successfully",
        data: result,
      });
    } catch (error: any) {
      console.error("[BookingStageController] updateBookingAmount Error:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  public getPayments = async (req: Request, res: Response) => {
    // 👈 arrow fn preserves `this`
    try {
      const leadId = parseInt(req.params.leadId);
      const vendorId = parseInt(req.query.vendorId as string);

      if (!leadId || !vendorId) {
        res
          .status(400)
          .json({ success: false, message: "Missing leadId or vendorId" });
        return;
      }

      const result = await this.bookingStageService.getPaymentsByLead(
        leadId,
        vendorId
      );
      res.json({ success: true, ...result });
    } catch (error: any) {
      logger.error("[PaymentController] Error", { error: error.message });
      res.status(500).json({ success: false, message: error.message });
    }
  };

  public uploadCSPBooking = async (req: Request, res: Response) => {
    try {
      const {
        lead_id,
        account_id,
        vendor_id,
        created_by,
      } = req.body;

      if (!lead_id || !account_id || !vendor_id || !created_by) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields",
        });
      }

      const files = req.files as {
        [key: string]: Express.Multer.File[];
      };

      const sitePhotos = files?.current_site_photos || [];

      // 🔴 HARD RULE
      if (sitePhotos.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Current site photos are mandatory",
        });
      }

      const uploadedSitePhotos: UploadedFileRef[] = [];

      for (const photo of sitePhotos) {
        const sysName = await uploadToWasabiCSPBookingPhotoFile(
          photo.path,
          Number(vendor_id),
          Number(lead_id),
          photo.originalname,
          photo.mimetype
        );

        await fs.unlink(photo.path);

        uploadedSitePhotos.push({
          originalName: photo.originalname,
          sysName,
        });
      }

      const result = await this.bookingStageService.uploadCSPBookingService({
        lead_id: +lead_id,
        account_id: +account_id,
        vendor_id: +vendor_id,
        created_by: +created_by,
        sitePhotos: uploadedSitePhotos,
      });

      res.status(201).json({
        success: true,
        message: "Current site photos uploaded successfully",
        data: result,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };

  public getCSPBooking = async (req: Request, res: Response) => {
    try {
      const { vendorId, leadId } = req.params;
  
      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }
  
      const result =
        await this.bookingStageService.getCSPBookingService({
          vendor_id: +vendorId,
          lead_id: +leadId,
        });
  
      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error("[getCSPBooking] Error:", error);
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };
  
}
