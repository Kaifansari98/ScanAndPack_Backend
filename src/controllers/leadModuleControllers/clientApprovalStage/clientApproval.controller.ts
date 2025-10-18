import { Request, Response } from "express";
import { ClientApprovalService } from "../../../services/leadModuleServices/clientApprovalStage/clientApproval.service";
import { ApiResponse } from "../../../utils/apiResponse";

const clientApprovalService = new ClientApprovalService();

export class ClientApprovalController {
  public static async submitApproval(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const { leadId, vendorId } = req.params;
      const {
        account_id,
        client_id,
        created_by,
        advance_payment_date,
        amount_paid,
        payment_text,
      } = req.body;

      const approvalScreenshots = (req.files as any)?.approvalScreenshots || [];
      const payment_files = (req.files as any)?.payment_files || [];

      if (!leadId || !vendorId || !account_id || !client_id || !created_by) {
        res
          .status(400)
          .json({ success: false, message: "Missing required fields" });
        return;
      }

      if (!approvalScreenshots || approvalScreenshots.length === 0) {
        res.status(400).json({
          success: false,
          message: "Client approval screenshot is mandatory",
        });
        return;
      }

      const dto = {
        lead_id: parseInt(leadId),
        vendor_id: parseInt(vendorId),
        account_id: parseInt(account_id),
        client_id: parseInt(client_id),
        created_by: parseInt(created_by),
        approvalScreenshots,
        advance_payment_date,
        amount_paid: parseFloat(amount_paid),
        payment_text,
        payment_files,
      };

      const result = await clientApprovalService.submitClientApproval(dto);

      res.status(201).json({
        success: true,
        message: "Client approval stage submitted successfully",
        data: result,
      });
    } catch (error: any) {
      console.error("[ClientApprovalController] Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  /**
   * Fetch all Backend Users for a specific vendor
   */
  public static async fetchBackendUsersByVendor(
    req: Request,
    res: Response
  ): Promise<Response> {
    try {
      const vendorId = parseInt(req.params.vendorId);

      // Validate vendorId
      if (isNaN(vendorId) || vendorId <= 0) {
        return res
          .status(400)
          .json(ApiResponse.error("Invalid vendor ID provided", 400));
      }

      console.log(
        `[CONTROLLER] Fetching Backend Users for vendor ID: ${vendorId}`
      );

      const backendUsers = await clientApprovalService.getBackendUsersByVendor(
        vendorId
      );

      // Check if any backend users were found
      if (backendUsers.length === 0) {
        return res
          .status(200)
          .json(
            ApiResponse.success(
              [],
              "No Backend Users found for this vendor",
              200
            )
          );
      }

      console.log(`[CONTROLLER] Found ${backendUsers.length} Backend Users`);

      return res.status(200).json(
        ApiResponse.success(
          {
            backend_users: backendUsers,
            count: backendUsers.length,
          },
          "backend users fetched successfully",
          200
        )
      );
    } catch (error: any) {
      console.error("[CONTROLLER] fetchBackendUsersByVendor error:", error);

      return res
        .status(500)
        .json(
          ApiResponse.error(
            "Failed to fetch Backend Users",
            500,
            process.env.NODE_ENV === "development" ? error.message : undefined
          )
        );
    }
  }

  public static getAllClientApprovals = async (req: Request, res: Response) => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const userId = parseInt(req.params.userId);

      if (!vendorId || !userId) {
        return res.status(400).json({
          success: false,
          message: "Vendor ID and User ID are required",
        });
      }

      const leads =
        await clientApprovalService.getLeadsWithStatusClientApproval(
          vendorId,
          userId
        );

      const count = leads.length;

      return res.status(200).json({
        success: true,
        message: "Client Approval leads fetched successfully",
        count,
        data: leads,
      });
    } catch (error: any) {
      console.error(
        "[ClientApprovalController] getAllClientApprovals Error:",
        error
      );
      return res.status(500).json({
        success: false,
        message: error.message || "Something went wrong",
      });
    }
  };

  public static async getApprovalDetails(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const { leadId, vendorId } = req.params;

      if (!leadId || !vendorId) {
        res.status(400).json({
          success: false,
          message: "LeadId and VendorId are required",
        });
        return;
      }

      const details = await clientApprovalService.getClientApprovalDetails(
        parseInt(vendorId),
        parseInt(leadId)
      );

      res.status(200).json({
        success: true,
        message: "Client approval details fetched successfully",
        data: details,
      });
    } catch (error: any) {
      console.error(
        "[ClientApprovalController] getApprovalDetails Error:",
        error
      );
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  public static async requestToTechCheck(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const { leadId, vendorId } = req.params;
      const { account_id, assign_to_user_id, created_by } = req.body;

      if (
        !leadId ||
        !vendorId ||
        !account_id ||
        !assign_to_user_id ||
        !created_by
      ) {
        res.status(400).json({
          success: false,
          message: "Missing required fields",
        });
        return;
      }

      const dto = {
        lead_id: parseInt(leadId),
        vendor_id: parseInt(vendorId),
        account_id: parseInt(account_id),
        assign_to_user_id: parseInt(assign_to_user_id),
        created_by: parseInt(created_by),
      };

      const result = await clientApprovalService.requestToTechCheck(dto);

      res.status(200).json({
        success: true,
        message: "Lead moved to Tech Check stage successfully",
        data: result,
      });
    } catch (error: any) {
      console.error(
        "[ClientApprovalController] Error in requestToTechCheck:",
        error
      );
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  public static async fetchTechCheckUsersByVendor(
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
        `[CONTROLLER] Fetching Tech-Check Users for vendor ID: ${vendorId}`
      );

      const techCheckUsers =
        await clientApprovalService.getTechCheckUsersByVendor(vendorId);

      if (techCheckUsers.length === 0) {
        return res
          .status(200)
          .json(
            ApiResponse.success(
              [],
              "No Tech-Check Users found for this vendor",
              200
            )
          );
      }

      console.log(
        `[CONTROLLER] Found ${techCheckUsers.length} Tech-Check Users`
      );

      return res.status(200).json(
        ApiResponse.success(
          {
            tech_check_users: techCheckUsers,
            count: techCheckUsers.length,
          },
          "Tech-Check users fetched successfully",
          200
        )
      );
    } catch (error: any) {
      console.error("[CONTROLLER] fetchTechCheckUsersByVendor error:", error);

      return res
        .status(500)
        .json(
          ApiResponse.error(
            "Failed to fetch Tech-Check Users",
            500,
            process.env.NODE_ENV === "development" ? error.message : undefined
          )
        );
    }
  }
}
