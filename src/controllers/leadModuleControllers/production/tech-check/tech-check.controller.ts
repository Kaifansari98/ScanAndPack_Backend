import { Request, Response } from "express";
import { TechCheckService } from "../../../../services/production/tech-check/tech-check.service";

const techCheckService = new TechCheckService();

export class TechCheckController {
  // ✅ Get All Tech-Check Leads
  public static getAllTechCheckLeads = async (req: Request, res: Response) => {
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

  // ✅ Approve Tech Check
  public static approveTechCheck = async (req: Request, res: Response) => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const leadId = parseInt(req.params.leadId);
      const userId = parseInt(req.params.userId);

      if (!vendorId || !leadId || !userId) {
        return res.status(400).json({
          success: false,
          message: "Vendor ID, Lead ID, and User ID are required",
        });
      }

      const result = await techCheckService.approveTechCheck(
        vendorId,
        leadId,
        userId
      );

      return res.status(200).json({
        success: true,
        message:
          "Tech check approved and moved to Order Login stage successfully",
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
      const vendorId = parseInt(req.params.vendorId);
      const leadId = parseInt(req.params.leadId);
      const userId = parseInt(req.params.userId);
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

      const result = await techCheckService.approveMultipleDocuments(
        vendorId,
        leadId,
        userId,
        approvedDocs
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
      const vendorId = parseInt(req.params.vendorId);
      const leadId = parseInt(req.params.leadId);
      const userId = parseInt(req.params.userId);
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

      const result = await techCheckService.rejectTechCheck(
        vendorId,
        leadId,
        userId,
        rejectedDocs,
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
