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
import fsSync from "node:fs";
import path from "node:path";
import { prisma } from "../../../prisma/client";
import {
  sendLeadAssignedToSiteSupervisorEmail,
  sendTaskAssignedEmail,
} from "../../../services/email/brevoEmail.service";
import { sendSiteSupervisorAssignedEmail } from "../../../services/email/brevoEmail2.service";
import { NotificationService } from "../../../services/notification/notification.service";
import { NotificationType } from "../../../prisma/generated";

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

const getParam = (param: string | string[] | undefined): string | undefined =>
  Array.isArray(param) ? param[0] : param;

const normalizeStringArray = (value: unknown): string[] | undefined => {
  if (Array.isArray(value)) {
    const normalized = value.map((item) => String(item).trim()).filter(Boolean);
    return normalized.length > 0 ? normalized : undefined;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? [normalized] : undefined;
  }

  return undefined;
};

export class BookingStageController {
  private bookingStageService = new BookingStageService();

  public createBookingStage = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const {
        lead_id,
        account_id,
        vendor_id,
        created_by,
        product_type_id,
        client_id,
        bookingAmount,
        bookingAmountPaymentDetailsText,
        finalBookingAmount,
        siteSupervisorId,
        mrpValue,
      } = req.body;

      const vendorIdNum = Number(vendor_id);
      const vendor = await prisma.vendorMaster.findUnique({
        where: { id: vendorIdNum },
        select: { is_this_vendor_is_custom_usertype_only: true },
      });
      const useCustomUsersOnly =
        vendor?.is_this_vendor_is_custom_usertype_only === true;

      if (
        !lead_id ||
        !account_id ||
        !vendor_id ||
        !created_by ||
        !finalBookingAmount ||
        !mrpValue
      ) {
        res
          .status(400)
          .json({ success: false, message: "Missing required fields" });
        return;
      }

      if (
        !useCustomUsersOnly &&
        (!siteSupervisorId || Number(siteSupervisorId) <= 0)
      ) {
        res.status(400).json({
          success: false,
          message: "Site supervisor is required",
        });
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

      // Validate final documents file extensions
      const allowedExtensions = [".pptx", ".ppt", ".pdf", ".jpg", ".jpeg", ".png", ".pyo"];
      for (const file of finalDocuments) {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!allowedExtensions.includes(ext)) {
          // Clean up all uploaded files
          const allFilesToCleanup = [
            ...finalDocuments,
            ...(bookingAmountPaymentDetailsFile ? [bookingAmountPaymentDetailsFile] : []),
          ];
          for (const f of allFilesToCleanup) {
            if (f.path && fsSync.existsSync(f.path)) {
              await fs.unlink(f.path).catch(() => {});
            }
          }
          res.status(400).json({
            success: false,
            message: `Unsupported file type for final documents: ${ext}. Supported types: .pptx, .ppt, .pdf, .jpg, .jpeg, .png, .pyo`,
          });
          return;
        }
      }

      if (Number(mrpValue) < Number(finalBookingAmount)) {
        res.status(400).json({
          success: false,
          message: "MRP value cannot be less than Total Booking Value",
        });
        return;
      }

      if (
        typeof product_type_id !== "undefined" &&
        product_type_id !== null &&
        (!Number.isFinite(Number(product_type_id)) ||
          Number(product_type_id) <= 0)
      ) {
        res.status(400).json({
          success: false,
          message: "product_type_id must be a valid positive number",
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
          file.mimetype,
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
          bookingAmountPaymentDetailsFile.mimetype,
        );

        await fs.unlink(bookingAmountPaymentDetailsFile.path);

        uploadedPaymentFile = {
          originalName: bookingAmountPaymentDetailsFile.originalname,
          sysName,
        };
      }

      const baseUrl = resolveClientBaseUrl(req);

      const dto: CreateBookingStageDto = {
        lead_id: parseInt(lead_id),
        account_id: parseInt(account_id),
        vendor_id: parseInt(vendor_id),
        created_by: parseInt(created_by),
        product_type_id:
          product_type_id && Number(product_type_id) > 0
            ? parseInt(product_type_id)
            : undefined,
        client_id: client_id ? parseInt(client_id) : undefined,
        bookingAmount: parseFloat(bookingAmount),
        mrpValue: parseFloat(mrpValue),
        bookingAmountPaymentDetailsText,
        finalBookingAmount: parseFloat(finalBookingAmount),
        siteSupervisorId:
          siteSupervisorId && Number(siteSupervisorId) > 0
            ? parseInt(siteSupervisorId)
            : undefined,
        baseUrl,
        finalDocuments: uploadedFinalDocuments,
        bookingAmountPaymentDetailsFile: uploadedPaymentFile,
      };

      const result = await this.bookingStageService.createBookingStage(dto);

      try {
        if (
          dto.siteSupervisorId &&
          dto.siteSupervisorId !== dto.created_by
        ) {
          const [supervisor, createdBy, lead] = await Promise.all([
            prisma.userMaster.findUnique({
              where: { id: dto.siteSupervisorId },
              select: { user_name: true, user_email: true, user_type: { select: { user_type: true } } },
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

          const supervisorRole = supervisor?.user_type?.user_type?.toLowerCase();
          const supervisorEmail = supervisor?.user_email?.trim();
          if (supervisorRole === "site-supervisor" || supervisorRole === "head-site-supervisor") {
            // skip — lead-assigned email is not sent to site-supervisor or head-site-supervisor
          } else if (!supervisorEmail) {
            logger.warn(
              "Booking stage email skipped: missing supervisor email",
              {
                lead_id: dto.lead_id,
                assignee_user_id: dto.siteSupervisorId,
              },
            );
          } else if (lead) {
            const leadName =
              `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim();
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
              vendor_id: dto.vendor_id,
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
    res: Response,
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

      // Validate final documents file extensions
      const allowedExtensions = [".pptx", ".ppt", ".pdf", ".jpg", ".jpeg", ".png", ".pyo"];
      for (const file of finalDocuments) {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!allowedExtensions.includes(ext)) {
          for (const f of finalDocuments) {
            if (f.path && fsSync.existsSync(f.path)) {
              await fs.unlink(f.path).catch(() => {});
            }
          }
          res.status(400).json({
            success: false,
            message: `Unsupported file type for final documents: ${ext}. Supported types: .pptx, .ppt, .pdf, .jpg, .jpeg, .png, .pyo`,
          });
          return;
        }
      }

      const uploadedFinalDocuments: UploadedFileRef[] = [];

      for (const file of finalDocuments) {
        const sysName = await uploadToWasabiBookingFinalDocumentFile(
          file.path,
          Number(vendor_id),
          Number(lead_id),
          file.originalname,
          file.mimetype,
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
        baseUrl: resolveClientBaseUrl(req),
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
    res: Response,
  ): Promise<void> => {
    try {
      const leadId = Number(getParam(req.params.leadId));
      const vendorId = Number(getParam(req.params.vendorId));

      if (!leadId) {
        res.status(400).json({ success: false, message: "leadId is required" });
        return;
      }

      const result = await this.bookingStageService.getBookingStage(
        leadId,
        vendorId,
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
      const vendorId = Number(getParam(req.params.vendorId));
      const userId = Number(req.query.userId);

      if (!vendorId || !userId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and userId are required",
        });
      }

      const leads = await BookingStageService.getLeadsWithStatusBooking(
        vendorId,
        userId,
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
      const vendorId = Number(getParam(req.params.vendorId));
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
        userId!,
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

  // CONTROLLER 1: getVendorLeadsByTag2
  public getVendorLeadsByTag2 = async (req: Request, res: Response) => {
    try {
      const vendorId = Number(getParam(req.params.vendorId));
      const userId = req.body.userId ? Number(req.body.userId) : null;
      const franchiseId = Number(req.body.franchise_id);
      const tag = req.body.tag as string;

      const page = parseInt((req.body.page as string) || "1");
      const limit = parseInt((req.body.limit as string) || "10");

      // ============================
      // DATE RANGE VALIDATION & NORMALIZATION
      // ============================
      let dateRange: { from: string; to: string } | undefined;

      // ✅ CORRECT CONTROLLER CODE
      if (req.body.date_range) {
        const { from, to } = req.body.date_range;

        // Validate
        if (from && isNaN(Date.parse(from))) {
          return res.status(400).json({
            success: false,
            message: "Invalid 'from' date format. Use YYYY-MM-DD or ISO format",
          });
        }

        if (to && isNaN(Date.parse(to))) {
          return res.status(400).json({
            success: false,
            message: "Invalid 'to' date format. Use YYYY-MM-DD or ISO format",
          });
        }

        // 🔥 NORMALIZE: Single date becomes range
        if (from && !to) {
          dateRange = { from, to: from }; // ✅ This is the key!
        } else if (from && to) {
          if (new Date(from) > new Date(to)) {
            return res.status(400).json({
              success: false,
              message: "'from' date cannot be after 'to' date",
            });
          }
          dateRange = { from, to };
        } else if (!from && to) {
          dateRange = { from: to, to };
        }
      }

      const filters = {
        global_search: req.body.global_search,
        filter_lead_code: req.body.filter_lead_code,
        filter_name: req.body.filter_name,
        contact: req.body.contact,
        furniture_type: req.body.furniture_type,
        furniture_structure: req.body.furniture_structure,
        site_map_link: req.body.site_map_link,
        site_type: req.body.site_type,
        assign_to: req.body.assign_to,
        priority: normalizeStringArray(req.body.priority),
        stagetag: req.body.stagetag,
        site_address: req.body.site_address,
        archetech_name: req.body.archetech_name,
        source: req.body.source,
        created_at: req.body.created_at,
        alt_contact_no: req.body.alt_contact_no,
        email: req.body.email,
        designer_remark: req.body.designer_remark,
        date_range: dateRange,
        production_status: req.body.production_status,
        pending_services: req.body.pending_services,
      };

      // ============================
      // VALIDATION GATE
      // ============================
      if (!vendorId || !tag || !franchiseId) {
        logger.warn("[BookingStageController] Missing vendorId, tag, or franchiseId", {
          vendorId,
          tag,
          franchiseId,
        });

        return res.status(400).json({
          success: false,
          message: "Vendor ID, franchise ID, and tag are required",
        });
      }

      logger.info("[BookingStageController] getVendorLeadsByTag2 called", {
        vendorId,
        franchiseId,
        tag,
        page,
        limit,
        dateRange,
      });
      console.log("[getVendorLeadsByTag2] payload", {
        vendorId,
        franchiseId,
        userId,
        tag,
        page,
        limit,
        filters,
      });

      const { leads, count } = await BookingStageService.getVendorLeadsByTag2(
        vendorId,
        franchiseId,
        tag,
        userId,
        page,
        limit,
        filters,
      );

      return res.status(200).json({
        success: true,
        message: "Vendor leads fetched successfully",
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
      logger.error("[BookingStageController] getVendorLeadsByTag2 Error", {
        error: error.message,
        stack: error.stack,
      });

      return res.status(500).json({
        success: false,
        message: error.message || "Something went wrong",
      });
    }
  };

  // CONTROLLER 2: getUniversalTableData2
  public getUniversalTableData2 = async (req: Request, res: Response) => {
    try {
      const vendorId = Number(getParam(req.params.vendorId));
      const userId = Number(req.body.userId);
      const franchiseIdRaw = req.body.franchise_id;
      const franchiseId =
        franchiseIdRaw !== undefined && franchiseIdRaw !== null && franchiseIdRaw !== ""
          ? Number(franchiseIdRaw)
          : undefined;
      const tag = req.body.tag as string;
      const page = parseInt((req.body.page as string) || "1");
      const limit = parseInt((req.body.limit as string) || "10");

      // ============================
      // DATE RANGE VALIDATION & NORMALIZATION
      // ============================
      let dateRange: { from: string; to: string } | undefined;

      // ✅ CORRECT CONTROLLER CODE
      if (req.body.date_range) {
        const { from, to } = req.body.date_range;

        // Validate
        if (from && isNaN(Date.parse(from))) {
          return res.status(400).json({
            success: false,
            message: "Invalid 'from' date format. Use YYYY-MM-DD or ISO format",
          });
        }

        if (to && isNaN(Date.parse(to))) {
          return res.status(400).json({
            success: false,
            message: "Invalid 'to' date format. Use YYYY-MM-DD or ISO format",
          });
        }

        // 🔥 NORMALIZE: Single date becomes range
        if (from && !to) {
          dateRange = { from, to: from }; // ✅ This is the key!
        } else if (from && to) {
          if (new Date(from) > new Date(to)) {
            return res.status(400).json({
              success: false,
              message: "'from' date cannot be after 'to' date",
            });
          }
          dateRange = { from, to };
        } else if (!from && to) {
          dateRange = { from: to, to };
        }
      }

      const filters = {
        global_search: req.body.global_search,
        filter_lead_code: req.body.filter_lead_code,
        filter_name: req.body.filter_name,
        contact: req.body.contact,
        furniture_type: req.body.furniture_type,
        furniture_structure: req.body.furniture_structure,
        site_map_link: req.body.site_map_link,
        site_type: req.body.site_type,
        assign_to: req.body.assign_to,
        priority: normalizeStringArray(req.body.priority),
        stagetag: req.body.stagetag,
        site_address: req.body.site_address,
        archetech_name: req.body.archetech_name,
        source: req.body.source,
        created_at: req.body.created_at,
        alt_contact_no: req.body.alt_contact_no,
        email: req.body.email,
        designer_remark: req.body.designer_remark,
        date_range: dateRange,
        production_status: req.body.production_status,
        pending_services: req.body.pending_services,
      };

      if (!vendorId || !userId) {
        logger.warn("Missing vendorId or userId", {
          vendorId,
          userId,
          franchiseId,
          tag,
        });
        return res.status(400).json({
          success: false,
          message: "Vendor ID and User ID are required",
        });
      }
      if (franchiseId !== undefined && (isNaN(franchiseId) || franchiseId <= 0)) {
        logger.warn("Invalid franchiseId provided", {
          vendorId,
          userId,
          franchiseId,
          tag,
        });
        return res.status(400).json({
          success: false,
          message: "Invalid Franchise ID provided",
        });
      }

      logger.info("[BookingStageController] getUniversalTableData2 called", {
        vendorId,
        userId,
        franchiseId,
        tag,
        dateRange,
      });
      console.log("[getUniversalTableData2] payload", {
        vendorId,
        userId,
        franchiseId,
        tag,
        page,
        limit,
        filters,
      });

      const { leads, count } = await BookingStageService.getUniversalTableData(
        vendorId,
        userId,
        franchiseId,
        tag,
        page,
        limit,
        filters,
      );

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
      logger.error("[BookingStageController] getUniversalTableData2 Error", {
        error: error.message,
        stack: error.stack,
      });
      return res.status(500).json({
        success: false,
        message: error.message || "Something went wrong",
      });
    }
  };

  public getDraftLeadTableData = async (req: Request, res: Response) => {
    try {
      const vendorId = Number(getParam(req.params.vendorId));
      const userId = Number(req.body.userId);
      const franchiseIdRaw = req.body.franchise_id;
      const franchiseId =
        franchiseIdRaw !== undefined && franchiseIdRaw !== null && franchiseIdRaw !== ""
          ? Number(franchiseIdRaw)
          : undefined;

      const page = parseInt((req.body.page as string) || "1");
      const limit = parseInt((req.body.limit as string) || "50");

      let dateRange: { from: string; to: string } | undefined;

      if (req.body.date_range) {
        const { from, to } = req.body.date_range;

        if (from && isNaN(Date.parse(from))) {
          return res.status(400).json({
            success: false,
            message: "Invalid 'from' date format. Use YYYY-MM-DD or ISO format",
          });
        }

        if (to && isNaN(Date.parse(to))) {
          return res.status(400).json({
            success: false,
            message: "Invalid 'to' date format. Use YYYY-MM-DD or ISO format",
          });
        }

        if (from && !to) {
          dateRange = { from, to: from };
        } else if (from && to) {
          if (new Date(from) > new Date(to)) {
            return res.status(400).json({
              success: false,
              message: "'from' date cannot be after 'to' date",
            });
          }
          dateRange = { from, to };
        } else if (!from && to) {
          dateRange = { from: to, to };
        }
      }

      const filters = {
        global_search: req.body.global_search,
        filter_lead_code: req.body.filter_lead_code,
        filter_name: req.body.filter_name,
        contact: req.body.contact,
        furniture_type: req.body.furniture_type,
        furniture_structure: req.body.furniture_structure,
        site_map_link: req.body.site_map_link,
        site_type: req.body.site_type,
        assign_to: req.body.assign_to,
        priority: normalizeStringArray(req.body.priority),
        site_address: req.body.site_address,
        archetech_name: req.body.archetech_name,
        source: req.body.source,
        created_at: req.body.created_at,
        alt_contact_no: req.body.alt_contact_no,
        email: req.body.email,
        designer_remark: req.body.designer_remark,
        date_range: dateRange,
      };

      if (!vendorId || !userId) {
        return res.status(400).json({
          success: false,
          message: "Vendor ID and User ID are required",
        });
      }
      if (franchiseId !== undefined && (isNaN(franchiseId) || franchiseId <= 0)) {
        return res.status(400).json({
          success: false,
          message: "Invalid Franchise ID provided",
        });
      }

      const { leads, count } = await BookingStageService.getDraftLeadTableData(
        vendorId,
        userId,
        franchiseId,
        page,
        limit,
        filters
      );

      return res.status(200).json({
        success: true,
        message: "Draft leads fetched successfully",
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
      logger.error("[BookingStageController] getDraftLeadTableData Error", {
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
      const vendorId = Number(getParam(req.params.vendorId));
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
        userId,
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
      const vendorId = Number(getParam(req.params.vendorId));
      const userId = Number(req.query.userId);
      const franchiseId = Number(req.query.franchise_id);
      const tag = req.query.tag as string;
      const page = parseInt((req.query.page as string) || "1");
      const limit = parseInt((req.query.limit as string) || "10");

      if (!vendorId || !userId || !franchiseId) {
        logger.warn("Missing vendorId or userId or franchiseId", {
          vendorId,
          userId,
          franchiseId,
          tag,
        });
        return res.status(400).json({
          success: false,
          message: "Vendor ID, User ID, and Franchise ID are required",
        });
      }

      const { leads, count } = await BookingStageService.getUniversalTableData(
        vendorId,
        userId,
        franchiseId,
        tag,
        page,
        limit,
        {},
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
          payment_file.mimetype,
        );

        await fs.unlink(payment_file.path);

        uploadedPaymentFile = {
          originalName: payment_file.originalname,
          sysName,
        };
      }

      const baseUrl = resolveClientBaseUrl(req);

      const dto: AddPaymentDto = {
        lead_id: parseInt(lead_id),
        account_id: parseInt(account_id),
        vendor_id: parseInt(vendor_id),
        client_id: client_id ? parseInt(client_id) : undefined,
        created_by: parseInt(created_by),
        amount: parseFloat(amount),
        payment_text,
        payment_date,
        baseUrl,
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
    res: Response,
  ): Promise<void> => {
    try {
      const leadId = Number(getParam(req.params.leadId));
      const vendorId = Number(getParam(req.params.vendorId));
      const siteSupervisorId = req.body.siteSupervisorId ? parseInt(req.body.siteSupervisorId) : undefined;
      const createdBy = parseInt(req.body.created_by);

     if (!leadId || !vendorId || !createdBy || !siteSupervisorId) {
        res.status(400).json({
          success: false,
          message:
            "leadId, vendorId, and created_by are required",
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
        message: "Site supervisor assigned successfully",
        data: result,
      });

      // ─── Notify + email sales-executive(s) assigned to this lead ───────────
      void (async () => {
        try {
          const [lead, supervisor, salesExecMappings] = await Promise.all([
            prisma.leadMaster.findUnique({
              where: { id: leadId },
              select: {
                id: true,
                lead_code: true,
                firstname: true,
                lastname: true,
                country_code: true,
                contact_no: true,
                account_id: true,
              },
            }),
            prisma.userMaster.findUnique({
              where: { id: siteSupervisorId },
              select: { user_name: true },
            }),
            prisma.leadUserMapping.findMany({
              where: {
                lead_id: leadId,
                vendor_id: vendorId,
                status: "active",
                user: {
                  user_type: { user_type: { equals: "sales-executive", mode: "insensitive" } },
                },
              },
              select: {
                user: { select: { id: true, user_name: true, user_email: true } },
              },
            }),
          ]);

          if (!lead || salesExecMappings.length === 0) return;

          // Deduplicate — a user can have multiple active mapping rows for the same lead
          const seenIds = new Set<number>();
          const uniqueSalesExecs = salesExecMappings
            .map((m) => m.user)
            .filter((user) => {
              if (seenIds.has(user.id)) return false;
              seenIds.add(user.id);
              return true;
            });

          const leadName = `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim();
          const leadCode = lead.lead_code ?? `LEAD-${String(lead.id).padStart(4, "0")}`;
          const contact = `${lead.country_code ?? ""} ${lead.contact_no ?? ""}`.trim();
          const supervisorName = supervisor?.user_name ?? "—";
          const assignedOn = new Date().toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          });
          const clientBaseUrl = resolveClientBaseUrl(req);
          const leadUrl = lead.account_id
            ? `${clientBaseUrl}/dashboard/leads/booking-stage/details/${leadId}?accountId=${lead.account_id}`
            : `${clientBaseUrl}/dashboard/leads/booking-stage/details/${leadId}`;
          const redirectPath = lead.account_id
            ? `/dashboard/leads/booking-stage/details/${leadId}?accountId=${lead.account_id}`
            : `/dashboard/leads/booking-stage/details/${leadId}`;

          await Promise.allSettled(
            uniqueSalesExecs.map(async (user) => {
              // In-app notification
              await NotificationService.createAndSend({
                vendor_id: vendorId,
                user_id: user.id,
                sender_id: createdBy,
                type: NotificationType.LEAD_ASSIGNED,
                title: "Site Supervisor Assigned",
                message:
                  leadName.length > 0
                    ? `Site Supervisor ${supervisorName} has been assigned to ${leadCode} - ${leadName}.`
                    : `Site Supervisor ${supervisorName} has been assigned to ${leadCode}.`,
                entity_type: "lead",
                entity_id: leadId,
                redirect_url: redirectPath,
              });

              // Email
              if (user.user_email) {
                await sendSiteSupervisorAssignedEmail({
                  vendor_id: vendorId,
                  toEmail: user.user_email,
                  toName: user.user_name ?? undefined,
                  leadCode,
                  leadName: leadName || "—",
                  contact: contact || "—",
                  assignedTo: supervisorName,
                  assignedOn,
                  leadUrl,
                });
              }
            }),
          );
        } catch (notifyErr: any) {
          logger.warn("⚠️ Failed to send site-supervisor-assigned notification", {
            lead_id: leadId,
            error: notifyErr?.message,
          });
        }
      })();
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
    res: Response,
  ): Promise<void> => {
    try {
      const leadId = Number(getParam(req.params.leadId));
      const vendorId = Number(getParam(req.params.vendorId));
      const mrpValue = Number(req.body.mrp_value);
      const updatedBy = parseInt(req.body.updated_by);

      if (!leadId || !vendorId || Number.isNaN(mrpValue) || !updatedBy) {
        res.status(400).json({
          success: false,
          message: "leadId, vendorId, mrp_value, and updated_by are required",
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
    res: Response,
  ): Promise<void> => {
    try {
      const leadId = Number(getParam(req.params.leadId));
      const vendorId = Number(getParam(req.params.vendorId));
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
        error,
      );
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  public updateBookingAmount = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const leadId = Number(getParam(req.params.leadId));
      const vendorId = Number(getParam(req.params.vendorId));
      const bookingAmount = Number(req.body.booking_amount);
      const updatedBy = parseInt(req.body.updated_by);

      if (!leadId || !vendorId || Number.isNaN(bookingAmount) || !updatedBy) {
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
      console.error(
        "[BookingStageController] updateBookingAmount Error:",
        error,
      );
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  public getPayments = async (req: Request, res: Response) => {
    // 👈 arrow fn preserves `this`
    try {
      const leadId = Number(getParam(req.params.leadId));
      const vendorId = parseInt(req.query.vendorId as string);

      if (!leadId || !vendorId) {
        res
          .status(400)
          .json({ success: false, message: "Missing leadId or vendorId" });
        return;
      }

      const result = await this.bookingStageService.getPaymentsByLead(
        leadId,
        vendorId,
      );
      res.json({ success: true, ...result });
    } catch (error: any) {
      logger.error("[PaymentController] Error", { error: error.message });
      res.status(500).json({ success: false, message: error.message });
    }
  };

  public uploadCSPBooking = async (req: Request, res: Response) => {
    try {
      const { lead_id, account_id, vendor_id, created_by } = req.body;

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
          photo.mimetype,
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

      const result = await this.bookingStageService.getCSPBookingService({
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

  public assignTaskBooking = async (req: Request, res: Response) => {
    try {
      const leadId = Number(req.params.leadId);
      const { task_type, due_date, remark, user_id, created_by } = req.body;

      if (!leadId || !task_type || !due_date || !user_id) {
        return res.status(400).json({
          success: false,
          message: "leadId, task_type, due_date, and user_id are required",
        });
      }

      const task = await this.bookingStageService.assignTaskBookingService({
        lead_id: leadId,
        task_type,
        due_date,
        remark,
        assignee_user_id: Number(user_id),
        created_by: Number(created_by),
      });

      // ===============================
      // NOTIFICATION + EMAIL (fire-and-forget)
      // ===============================
      void (async () => {
        try {
          const isSelfAssigned =
            Number(created_by) === Number(user_id);

          if (isSelfAssigned) return;

          const [assignee, lead, assigner] = await Promise.all([
            prisma.userMaster.findUnique({
              where: { id: Number(user_id) },
              select: { user_name: true, user_email: true },
            }),
            prisma.leadMaster.findUnique({
              where: { id: leadId },
              select: {
                firstname: true,
                lastname: true,
                lead_code: true,
                vendor_id: true,
                account_id: true,
                status_id: true,
              },
            }),
            prisma.userMaster.findUnique({
              where: { id: Number(created_by) },
              select: { user_name: true },
            }),
          ]);

          if (!assignee || !lead) return;

          const leadName =
            `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim();
          const leadCode =
            lead.lead_code ?? `LEAD-${String(leadId).padStart(4, "0")}`;

          const redirectPath = lead.account_id
            ? `/dashboard/leads/booking-stage/details/${leadId}?accountId=${lead.account_id}`
            : `/dashboard/leads/booking-stage/details/${leadId}`;

          // 🔔 In-App Notification
          await NotificationService.createAndSend({
            vendor_id: lead.vendor_id,
            user_id: Number(user_id),
            sender_id: Number(created_by) || null,
            type: NotificationType.TASK_ASSIGNED,
            title: "New task assigned",
            message:
              leadName.length > 0
                ? `Task assigned for ${leadName}: ${task_type}.`
                : `Task assigned: ${task_type}.`,
            entity_type: "lead",
            entity_id: leadId,
            redirect_url: redirectPath,
          });

          // 📧 Email
          if (assignee.user_email) {
            const clientBaseUrl = resolveClientBaseUrl(req);
            const projectUrl = `${clientBaseUrl}${redirectPath}`;
            const assignedAt = new Date().toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            });
            const dueDateFormatted = due_date
              ? new Date(due_date).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
              : "—";

            await sendTaskAssignedEmail({
              vendor_id: lead.vendor_id,
              toEmail: assignee.user_email,
              toName: assignee.user_name ?? undefined,
              leadCode,
              taskTitle: task_type,
              leadName: leadName || "—",
              assignedBy: assigner?.user_name ?? "Admin",
              dueDate: dueDateFormatted,
              remark,
              taskUrl: projectUrl,
            });
          }
        } catch (notifyErr: any) {
          logger.warn("⚠️ assignTaskBooking notification failed", {
            lead_id: leadId,
            error: notifyErr?.message,
          });
        }
      })();

      return res.status(201).json({ success: true, data: task });
    } catch (error: any) {
      console.error("[assignTaskBooking] Error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  };
}
