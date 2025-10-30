import { Request, Response } from "express";
import { OrderLoginService } from "../../../../services/production/order-login/orderLogin.service";
import { prisma } from "../../../../prisma/client";
import { generateSignedUrl } from "../../../../utils/wasabiClient";
import { ApiResponse } from "../../../../utils/apiResponse";

const service = new OrderLoginService();

export class OrderLoginController {
  async uploadFileBreakups(req: Request, res: Response) {
    try {
      const { vendorId } = req.params;
      const payload = req.body;

      const orderLogin = await service.uploadFileBreakups(
        Number(vendorId),
        payload
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
          breakups
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
      const { lead_id } = req.query; // ✅ Use query param

      const orderLogins = await service.getOrderLoginByLead(
        Number(vendorId),
        Number(lead_id)
      );

      return res.status(200).json({
        success: true,
        message: "Order login details fetched successfully",
        data: orderLogins,
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
        payload
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
        updates
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

  async getAllOrderLoginLeads(req: Request, res: Response) {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const userId = parseInt(req.params.userId);

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
        page
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
        error
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
        })
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
      const { account_id, created_by } = req.body;
      const files = req.files as Express.Multer.File[];

      const uploaded = await service.uploadProductionFiles(
        Number(vendorId),
        Number(leadId),
        account_id ? Number(account_id) : null,
        Number(created_by),
        files
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
        })
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
      } = req.body;

      if (
        !vendorId ||
        !leadId ||
        !account_id ||
        !user_id ||
        !assign_to_user_id ||
        !client_required_order_login_complition_date
      ) {
        return res.status(400).json({
          success: false,
          message:
            "vendorId, leadId, account_id, user_id, assign_to_user_id, and client_required_order_login_complition_date are required.",
        });
      }

      const updatedLead = await service.updateLeadToProductionStage({
        vendorId: Number(vendorId),
        leadId: Number(leadId),
        accountId: Number(account_id),
        userId: Number(user_id),
        assignToUserId: Number(assign_to_user_id),
        requiredDate: new Date(client_required_order_login_complition_date),
      });

      return res.status(200).json({
        success: true,
        message: "Lead successfully moved to Production Stage",
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

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const data = await service.getLeadProductionReadiness(
        Number(vendorId),
        Number(leadId)
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
    res: Response
  ): Promise<Response> {
    try {
      const vendorId = parseInt(req.params.vendorId);

      if (isNaN(vendorId) || vendorId <= 0) {
        return res
          .status(400)
          .json(ApiResponse.error("Invalid vendor ID provided", 400));
      }

      console.log(
        `[CONTROLLER] Fetching Factory Users for vendor ID: ${vendorId}`
      );

      const factoryUsers = await service.getFactoryUsersByVendor(vendorId);

      if (factoryUsers.length === 0) {
        return res
          .status(200)
          .json(
            ApiResponse.success(
              [],
              "No Factory Users found for this vendor",
              200
            )
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
          200
        )
      );
    } catch (error: any) {
      console.error("[CONTROLLER] fetchFactoryUsersByVendor error:", error);

      return res
        .status(500)
        .json(
          ApiResponse.error(
            "Failed to fetch Factory Users",
            500,
            process.env.NODE_ENV === "development" ? error.message : undefined
          )
        );
    }
  }
}
