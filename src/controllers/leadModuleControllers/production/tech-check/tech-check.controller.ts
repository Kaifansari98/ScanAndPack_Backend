import { Request, Response } from "express";
import {
  TechCheckService,
  ApproveTechCheckResult,
} from "../../../../services/production/tech-check/tech-check.service";
import { resolveClientBaseUrl } from "../../../../utils/fileUtils";

const techCheckService = new TechCheckService();

const getParam = (param: string | string[] | undefined): string | undefined =>
  Array.isArray(param) ? param[0] : param;

export class TechCheckController {
  // ✅ Get All Tech-Check Leads
  public static getAllTechCheckLeads = async (req: Request, res: Response) => {
    try {
      const vendorId = Number(getParam(req.params.vendorId));
      const userId = Number(getParam(req.params.userId));

      if (!vendorId || !userId) {
        return res.status(400).json({
          success: false,
          message: "Vendor ID and User ID are required",
        });
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const leads = await techCheckService.getLeadsWithStatusTechCheck(
        vendorId,
        userId,
        limit,
        page
      );

      return res.status(200).json({
        success: true,
        message: "Tech Check leads fetched successfully",
        count: leads.total,
        data: leads,
      });
    } catch (error: any) {
      console.error("[TechCheckController] getAllTechCheckLeads Error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  // ✅ Get Tech-Check status by vendor, lead, instance
  public static getTechCheckInstanceStatus = async (
    req: Request,
    res: Response
  ) => {
    try {
      const vendorId = Number(getParam(req.params.vendorId));
      const leadId = Number(getParam(req.params.leadId));
      const instanceId = Number(getParam(req.params.instanceId));

      if (!vendorId || !leadId || !instanceId) {
        return res.status(400).json({
          success: false,
          message: "Vendor ID, Lead ID, and Instance ID are required",
        });
      }

      const result = await techCheckService.getInstanceTechCheckStatus(
        vendorId,
        leadId,
        instanceId
      );

      if (!result) {
        return res.status(404).json({
          success: false,
          message: "Instance not found for this lead",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Tech check status fetched successfully",
        data: result,
      });
    } catch (error: any) {
      console.error(
        "[TechCheckController] getTechCheckInstanceStatus Error:",
        error
      );
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  // ✅ Approve Tech Check
  public static approveTechCheck = async (req: Request, res: Response) => {
    try {
      const vendorId = Number(getParam(req.params.vendorId));
      const leadId = Number(getParam(req.params.leadId));
      const userId = Number(getParam(req.params.userId));

      const {
        assign_to_user_id,
        account_id,
        client_required_order_login_complition_date,
        product_structure_instance_id,
      } = req.body;

      const instanceId = product_structure_instance_id
        ? Number(product_structure_instance_id)
        : undefined;

      // Instance-wise completion path
      const baseUrl = resolveClientBaseUrl(req);
      if (instanceId) {
        const result: ApproveTechCheckResult =
          await techCheckService.approveTechCheck(
            vendorId,
            leadId,
            userId,
            Number(assign_to_user_id || 0),
            Number(account_id || 0),
            client_required_order_login_complition_date
              ? new Date(client_required_order_login_complition_date)
              : undefined,
            baseUrl,
            instanceId
          );

        return res.status(200).json({
          success: true,
          message:
            "moved_to_order_login" in result && result.moved_to_order_login
            ? "All instances completed. Lead moved to Order Login"
            : "Tech check marked as completed for instance",
          data: result,
        });
      }

      if (
        !vendorId ||
        !leadId ||
        !userId ||
        !assign_to_user_id ||
        !account_id
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Missing required fields (vendorId, leadId, userId, assign_to_user_id, account_id)",
        });
      }
  
      const result = await techCheckService.approveTechCheck(
        vendorId,
        leadId,
        userId,
        Number(assign_to_user_id),
        Number(account_id),
        client_required_order_login_complition_date
          ? new Date(client_required_order_login_complition_date)
          : undefined,
        baseUrl,
        undefined
      );

      return res.status(200).json({
        success: true,
        message: "Tech check approved & assigned to backend user",
        data: result,
      });
    } catch (error: any) {
      console.error("[TechCheckController] approveTechCheck Error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  // ✅ Approve Multiple Documents
  public static approveMultipleDocuments = async (
    req: Request,
    res: Response
  ) => {
    try {
      const vendorId = Number(getParam(req.params.vendorId));
      const leadId = Number(getParam(req.params.leadId));
      const userId = Number(getParam(req.params.userId));
      const rawInstanceId = getParam(req.params.instanceId);
      const instanceId =
        rawInstanceId &&
        rawInstanceId !== "null" &&
        rawInstanceId !== "undefined" &&
        !Number.isNaN(Number(rawInstanceId))
          ? Number(rawInstanceId)
          : undefined;
      const { approvedDocs } = req.body;

      if (!vendorId || !leadId || !userId) {
        return res.status(400).json({
          success: false,
          message: "Vendor ID, Lead ID, and User ID are required",
        });
      }

      if (!approvedDocs || !Array.isArray(approvedDocs)) {
        return res.status(400).json({
          success: false,
          message: "approvedDocs array is required",
        });
      }

      const baseUrl = resolveClientBaseUrl(req);
      const result = await techCheckService.approveMultipleDocuments(
        vendorId,
        leadId,
        userId,
        approvedDocs,
        baseUrl,
        instanceId
      );

      return res.status(200).json({
        success: true,
        message: "Selected documents approved successfully",
        data: result,
      });
    } catch (error: any) {
      console.error(
        "[TechCheckController] approveMultipleDocuments Error:",
        error
      );
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  // ✅ Reject Tech Check
  public static rejectTechCheck = async (req: Request, res: Response) => {
    try {
      const vendorId = Number(getParam(req.params.vendorId));
      const leadId = Number(getParam(req.params.leadId));
      const userId = Number(getParam(req.params.userId));
      const rawInstanceId = getParam(req.params.instanceId);
      const instanceId =
        rawInstanceId &&
        rawInstanceId !== "null" &&
        rawInstanceId !== "undefined" &&
        !Number.isNaN(Number(rawInstanceId))
          ? Number(rawInstanceId)
          : undefined;
      const { rejectedDocs, remark } = req.body;

      if (!vendorId || !leadId || !userId) {
        return res.status(400).json({
          success: false,
          message: "Vendor ID, Lead ID, and User ID are required",
        });
      }

      if (!rejectedDocs || !Array.isArray(rejectedDocs)) {
        return res.status(400).json({
          success: false,
          message: "RejectedDocs array is required",
        });
      }

      const baseUrl = resolveClientBaseUrl(req);
      const result = await techCheckService.rejectTechCheck(
        vendorId,
        leadId,
        userId,
        rejectedDocs,
        baseUrl,
        instanceId,
        remark
      );

      return res.status(200).json({
        success: true,
        message: "Tech check rejected successfully",
        data: result,
      });
    } catch (error: any) {
      console.error("[TechCheckController] rejectTechCheck Error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };
}
