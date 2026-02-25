import { uploadProductionFiles } from "./../../../../middlewares/uploadWasabi";
import { Request, Response } from "express";
import {
  OrderLoginService,
  UploadOrderLoginPoFileInput,
} from "../../../../services/production/order-login/orderLogin.service";
import { prisma } from "../../../../prisma/client";
import { NotificationService } from "../../../../services/notification/notification.service";
import { NotificationType } from "../../../../prisma/generated";
import {
  generateSignedUrl,
  uploadToWasabiOrderLoginPoFile,
  uploadToWasabiProductionFilesFile,
} from "../../../../utils/wasabiClient";
import { ApiResponse } from "../../../../utils/apiResponse";
import fs from "node:fs/promises";
import { resolveClientBaseUrl } from "../../../../utils/fileUtils";

const service = new OrderLoginService();

export class OrderLoginController {
  async uploadFileBreakups(req: Request, res: Response) {
    try {
      const { vendorId } = req.params;
      const payload = req.body;

      const orderLogin = await service.uploadFileBreakups(
        Number(vendorId),
        payload,
      );

      return res.status(201).json({
        success: true,
        message: "Order login file breakup created successfully",
        data: orderLogin,
      });
    } catch (error: any) {
      console.error("Error uploading order login file breakup:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while uploading order login file breakup",
      });
    }
  }

  async uploadMultipleFileBreakupsByLead(req: Request, res: Response) {
    try {
      const { vendorId, leadId, accountId } = req.params;
      const { breakups } = req.body;

      const { results, errors } =
        await service.uploadMultipleFileBreakupsByLead(
          Number(vendorId),
          Number(leadId),
          Number(accountId),
          breakups,
        );

      return res.status(201).json({
        success: true,
        message: "Multiple Order Login file breakups processed successfully",
        total_submitted: breakups.length,
        total_success: results.length,
        total_failed: errors.length,
        data: results,
        errors,
      });
    } catch (error: any) {
      console.error("Error uploading multiple file breakups:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while uploading multiple file breakups",
      });
    }
  }

  async getOrderLoginByLead(req: Request, res: Response) {
    try {
      const { vendorId } = req.params;
      const { lead_id, instance_id } = req.query; // ✅ Use query params
      const { senderUserId } = req.query; // ✅ Use query param

      const baseUrl = resolveClientBaseUrl(req);
      const instanceId =
        typeof instance_id === "string" && instance_id.trim().length > 0
          ? Number(instance_id)
          : undefined;
      const orderLogins = await service.getOrderLoginByLead(
        Number(vendorId),
        Number(lead_id),
        Number(senderUserId),
        baseUrl,
        instanceId
      );

      return res.status(200).json({
        success: true,
        message: orderLogins.hasData
          ? "Order login details fetched successfully"
          : "No order login created yet for this lead",
        data: orderLogins.list,
        meta: {
          hasOrderLogin: orderLogins.hasData,
        },
      });
    } catch (error: any) {
      console.error("Error fetching order login details:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while fetching order login details",
      });
    }
  }

  async updateOrderLogin(req: Request, res: Response) {
    try {
      const { vendorId, orderLoginId } = req.params;
      const payload = req.body;

      const updated = await service.updateOrderLogin(
        Number(vendorId),
        Number(orderLoginId),
        payload,
      );

      return res.status(200).json({
        success: true,
        message: "Order login updated successfully",
        data: updated,
      });
    } catch (error: any) {
      console.error("Error updating order login:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message || "Internal server error while updating order login",
      });
    }
  }

  async updateMultipleOrderLogins(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;
      const { updates } = req.body;

      if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({
          success: false,
          message: "updates array is required",
        });
      }

      const { results, errors } = await service.updateMultipleOrderLogins(
        Number(vendorId),
        Number(leadId),
        updates,
      );

      return res.status(200).json({
        success: true,
        message: "Multiple order login records updated successfully",
        total_submitted: updates.length,
        total_success: results.length,
        total_failed: errors.length,
        data: results,
        errors,
      });
    } catch (error: any) {
      console.error("Error updating multiple order logins:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while updating multiple order logins",
      });
    }
  }

  async deleteOrderLogin(req: Request, res: Response) {
    try {
      const { vendorId, orderLoginId } = req.params;

      if (!vendorId || !orderLoginId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and orderLoginId are required",
        });
      }

      const deleted = await service.deleteOrderLogin(
        Number(vendorId),
        Number(orderLoginId),
      );

      return res.status(200).json({
        success: true,
        message: "Order login deleted successfully",
        data: deleted,
      });
    } catch (error: any) {
      console.error("Error deleting order login:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message || "Internal server error while deleting order login",
      });
    }
  }

  async getAllOrderLoginLeads(req: Request, res: Response) {
    try {
      const vendorIdParam = Array.isArray(req.params.vendorId)
        ? req.params.vendorId[0]
        : req.params.vendorId;
      const userIdParam = Array.isArray(req.params.userId)
        ? req.params.userId[0]
        : req.params.userId;
      const vendorId = Number(vendorIdParam);
      const userId = Number(userIdParam);

      if (!vendorId || !userId) {
        return res.status(400).json({
          success: false,
          message: "Vendor ID and User ID are required",
        });
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const leads = await service.getLeadsWithStatusOrderLogin(
        vendorId,
        userId,
        limit,
        page,
      );

      return res.status(200).json({
        success: true,
        message: "Order Login leads fetched successfully",
        count: leads.total,
        data: leads,
      });
    } catch (error: any) {
      console.error(
        "[OrderLoginController] getAllOrderLoginLeads Error:",
        error,
      );
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  async getApprovedTechCheckDocuments(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;

      if (!vendorId) {
        return res.status(400).json({
          success: false,
          message: "vendor_id is required",
        });
      }

      // 🧾 Build where clause dynamically
      const whereClause: any = {
        vendor_id: Number(vendorId),
        tech_check_status: "APPROVED",
        is_deleted: false,
      };

      if (leadId) {
        whereClause.lead_id = Number(leadId);
      }

      // 🔍 Fetch documents
      const documents = await prisma.leadDocuments.findMany({
        where: whereClause,
        orderBy: { created_at: "asc" },
        select: {
          id: true,
          doc_og_name: true,
          doc_sys_name: true,
          created_by: true,
          created_at: true,
          tech_check_status: true,
          product_structure_instance_id: true,
        },
      });

      if (documents.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No approved tech-check documents found for this request.",
        });
      }

      // 🪄 Attach signed URLs
      const docsWithUrls = await Promise.all(
        documents.map(async (doc) => {
          try {
            const signedUrl = await generateSignedUrl(doc.doc_sys_name, 3600);
            return { ...doc, signed_url: signedUrl };
          } catch (err) {
            console.error(`Failed to sign URL for doc ${doc.id}:`, err);
            return { ...doc, signed_url: null };
          }
        }),
      );

      return res.status(200).json({
        success: true,
        message: "Approved tech-check documents fetched successfully",
        count: docsWithUrls.length,
        data: docsWithUrls,
      });
    } catch (error: any) {
      console.error("Error fetching approved tech-check documents:", error);
      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while fetching approved tech-check documents",
      });
    }
  }

  async uploadProductionFiles(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;
      const { account_id, created_by, instance_id } = req.body;
      const files = req.files as Express.Multer.File[];

      const uploadedFiles: { originalName: string; sysName: string }[] = [];
      let instanceFolder: string | undefined;
      let instanceIdValue: number | null = null;

      if (instance_id) {
        const instance = await prisma.leadProductStructureInstance.findFirst({
          where: {
            id: Number(instance_id),
            vendor_id: Number(vendorId),
            lead_id: Number(leadId),
          },
          select: { title: true },
        });

        if (!instance) {
          return res.status(404).json({
            success: false,
            message: "Product structure instance not found for this lead.",
          });
        }

        instanceIdValue = Number(instance_id);
        instanceFolder = instance.title?.trim() || `instance-${instance_id}`;
      }

      for (const file of files) {
        const sysName = await uploadToWasabiProductionFilesFile(
          file.path,
          Number(vendorId),
          Number(leadId),
          file.originalname,
          file.mimetype,
        );

        await fs.unlink(file.path);

        uploadedFiles.push({
          originalName: file.originalname,
          sysName,
        });
      }

      const uploaded = await service.uploadProductionFiles(
        Number(vendorId),
        Number(leadId),
        account_id ? Number(account_id) : null,
        Number(created_by),
        uploadedFiles,
        instanceIdValue,
      );

      return res.status(200).json({
        success: true,
        message: "Production files uploaded successfully",
        count: uploaded.length,
        data: uploaded,
      });
    } catch (error: any) {
      console.error("Error uploading production files:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while uploading production files",
      });
    }
  }



  async getProductionFiles(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;
      const { instance_id } = req.query;

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      // 🧾 Get DocType for Production Files
      const ProductionDocType = await prisma.documentTypeMaster.findFirst({
        where: { vendor_id: Number(vendorId), tag: "Type 14" },
      });

      if (!ProductionDocType) {
        return res.status(404).json({
          success: false,
          message: "Document type (Type 14) not found for this vendor.",
        });
      }

      // 🔍 Fetch Production Files for given vendor & lead
      const docs = await prisma.leadDocuments.findMany({
        where: {
          vendor_id: Number(vendorId),
          lead_id: Number(leadId),
          doc_type_id: ProductionDocType.id,
          is_deleted: false,
          ...(typeof instance_id !== "undefined"
            ? { product_structure_instance_id: Number(instance_id) }
            : {}),
        },
        orderBy: { created_at: "asc" },
        select: {
          id: true,
          doc_og_name: true,
          doc_sys_name: true,
          created_by: true,
          created_at: true,
        },
      });

      if (docs.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No production files found for this lead.",
        });
      }

      // 🪄 Attach Signed URLs
      const docsWithUrls = await Promise.all(
        docs.map(async (doc) => {
          try {
            const signedUrl = await generateSignedUrl(doc.doc_sys_name, 3600);
            return { ...doc, signed_url: signedUrl };
          } catch (err) {
            console.error(`Failed to sign URL for doc ${doc.id}:`, err);
            return { ...doc, signed_url: null };
          }
        }),
      );

      return res.status(200).json({
        success: true,
        message: "Production files fetched successfully",
        count: docsWithUrls.length,
        data: docsWithUrls,
      });
    } catch (error: any) {
      console.error("Error fetching production files:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while fetching production files",
      });
    }
  }



  async updateLeadToProductionStage(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;
      const {
        account_id,
        user_id,
        assign_to_user_id,
        client_required_order_login_complition_date,
        instance_id,
      } = req.body;

      const missingFields = [];

      if (!vendorId) missingFields.push("vendorId");
      if (!leadId) missingFields.push("leadId");
      if (!account_id) missingFields.push("account_id");
      if (!user_id) missingFields.push("user_id");
      if (!assign_to_user_id) missingFields.push("assign_to_user_id");
      if (!client_required_order_login_complition_date)
        missingFields.push("client_required_order_login_complition_date");

      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Missing required field${
            missingFields.length > 1 ? "s" : ""
          }: ${missingFields.join(", ")}`,
        });
      }

      const baseUrl = resolveClientBaseUrl(req);
      const updatedLead = await service.updateLeadToProductionStage({
        vendorId: Number(vendorId),
        leadId: Number(leadId),
        accountId: Number(account_id),
        baseUrl,
        userId: Number(user_id),
        assignToUserId: Number(assign_to_user_id),
        requiredDate: new Date(client_required_order_login_complition_date),
        instanceId: instance_id ? Number(instance_id) : undefined,
      });

      try {
        const assignee = await prisma.userMaster.findUnique({
          where: { id: Number(assign_to_user_id) },
          select: {
            user_type: { select: { user_type: true } },
          },
        });
        const assigneeRole = assignee?.user_type?.user_type?.toLowerCase();
        if (assigneeRole !== "admin" && assigneeRole !== "super-admin") {
          const lead = await prisma.leadMaster.findUnique({
            where: { id: Number(leadId) },
            select: { firstname: true, lastname: true },
          });
          const leadName =
            `${lead?.firstname ?? ""} ${lead?.lastname ?? ""}`.trim();

          await NotificationService.createAndSend({
            vendor_id: Number(vendorId),
            user_id: Number(assign_to_user_id),
            sender_id: Number(user_id) || null,
            type: NotificationType.LEAD_ASSIGNED,
            title: "Lead assigned",
            message:
              leadName.length > 0
                ? `Lead ${leadName} has been assigned to you.`
                : "A lead has been assigned to you.",
            entity_type: "lead",
            entity_id: Number(leadId),
            redirect_url: `/dashboard/leads/details/${leadId}?accountId=${account_id}`,
          });
        }
      } catch (notificationError: any) {
        console.error("⚠️ Failed to send production assignment notification", {
          error: notificationError?.message,
          lead_id: leadId,
          assignee_user_id: assign_to_user_id,
        });
      }

      const movedToProduction = Boolean(
        (updatedLead as any)?.moved_to_production,
      );

      return res.status(200).json({
        success: true,
        message: movedToProduction
          ? "Lead successfully moved to Production Stage"
          : instance_id
            ? "Order login marked complete for instance"
            : "Lead successfully moved to Production Stage",
        data: updatedLead,
      });
    } catch (error: any) {
      console.error("Error updating lead to production stage:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  async getLeadProductionReadiness(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;
      const { instance_id } = req.query;

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const data = await service.getLeadProductionReadiness(
        Number(vendorId),
        Number(leadId),
        typeof instance_id !== "undefined" ? Number(instance_id) : undefined,
      );

      return res.status(200).json({
        success: true,
        message: "Lead readiness status fetched successfully",
        data,
      });
    } catch (error: any) {
      console.error("Error fetching readiness status:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while fetching readiness status",
      });
    }
  }

  async fetchFactoryUsersByVendor(
    req: Request,
    res: Response,
  ): Promise<Response> {
    try {
      const vendorIdParam = Array.isArray(req.params.vendorId)
        ? req.params.vendorId[0]
        : req.params.vendorId;
      const vendorId = Number(vendorIdParam);

      if (isNaN(vendorId) || vendorId <= 0) {
        return res
          .status(400)
          .json(ApiResponse.error("Invalid vendor ID provided", 400));
      }

      console.log(
        `[CONTROLLER] Fetching Factory Users for vendor ID: ${vendorId}`,
      );

      const factoryUsers = await service.getFactoryUsersByVendor(vendorId);

      if (factoryUsers.length === 0) {
        return res
          .status(200)
          .json(
            ApiResponse.success(
              [],
              "No Factory Users found for this vendor",
              200,
            ),
          );
      }

      console.log(`[CONTROLLER] Found ${factoryUsers.length} Factory Users`);

      return res.status(200).json(
        ApiResponse.success(
          {
            factory_users: factoryUsers,
            count: factoryUsers.length,
          },
          "Factory users fetched successfully",
          200,
        ),
      );
    } catch (error: any) {
      console.error("[CONTROLLER] fetchFactoryUsersByVendor error:", error);

      return res
        .status(500)
        .json(
          ApiResponse.error(
            "Failed to fetch Factory Users",
            500,
            process.env.NODE_ENV === "development" ? error.message : undefined,
          ),
        );
    }
  }

  async uploadOrderLoginPoFile(req: Request, res: Response) {
    try {
      const { vendorId, leadId, orderLoginId } = req.params;
      const { created_by } = req.body;
      const files = req.files as Express.Multer.File[];

      if (!vendorId || !leadId || !orderLoginId || !created_by) {
        return res.status(400).json({
          success: false,
          message: "vendorId, leadId, orderLoginId and created_by are required",
        });
      }

      /**
       * Validate Order Login Exists
       */
      const orderLogin = await prisma.orderLoginDetails.findFirst({
        where: {
          id: Number(orderLoginId),
          vendor_id: Number(vendorId),
          lead_id: Number(leadId),
        },
      });

      if (!orderLogin) {
        return res.status(404).json({
          success: false,
          message: "Order login record not found",
        });
      }

      /**
       * Upload Files to Wasabi
       */
      const uploadedFiles: { originalName: string; sysName: string }[] = [];

      for (const file of files || []) {
        const sysName = await uploadToWasabiOrderLoginPoFile(
          file.path,
          Number(vendorId),
          Number(leadId),
          orderLogin.item_type,
          file.originalname,
          file.mimetype,
        );

        await fs.unlink(file.path);

        uploadedFiles.push({
          originalName: file.originalname,
          sysName,
        });
      }

      /**
       * Prepare DTO
       */
      const payload: UploadOrderLoginPoFileInput = {
        vendorId: Number(vendorId),
        leadId: Number(leadId),
        orderLoginId: Number(orderLoginId),
        userId: Number(created_by),
        files: uploadedFiles,
        instanceId: orderLogin.instance_id ?? null,
      };

      /**
       * Call Service
       */
      const result = await service.uploadOrderLoginPoFile(payload);

      return res.status(200).json({
        success: true,
        message: "PO Files uploaded successfully",
        count: payload.files.length,
        data: result,
      });
    } catch (error: any) {
      console.error("Upload Order Login PO Error:", error);

      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  }

  async getOrderLoginPoFile(req: Request, res: Response) {
    try {
      const { vendorId, leadId, orderLoginId } = req.params;

      if (!vendorId || !leadId || !orderLoginId) {
        return res.status(400).json({
          success: false,
          message: "vendorId, leadId and orderLoginId are required",
        });
      }

      const data = await service.getOrderLoginPoFile(
        Number(vendorId),
        Number(leadId),
        Number(orderLoginId),
      );

      return res.status(200).json({
        success: true,
        count: data.length,
        data,
      });
    } catch (error: any) {
      console.error("Fetch PO Files Error:", error);

      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  }


  async deleteOrderLoginPoFile(req: Request, res: Response) {
  try {
    const { vendorId, leadId, orderLoginId, mappingId } = req.params;
    const { deleted_by } = req.body;

    const result = await service.deleteOrderLoginPoFile({
      vendorId: Number(vendorId),
      leadId: Number(leadId),
      orderLoginId: Number(orderLoginId),
      mappingId: Number(mappingId),
      userId: Number(deleted_by),
    });

    return res.status(200).json({
      success: true,
      message: "PO file deleted successfully",
      data: result,
    });
  } catch (error: any) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
}
}
