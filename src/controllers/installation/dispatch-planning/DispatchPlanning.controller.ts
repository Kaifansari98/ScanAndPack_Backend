import { Request, Response } from "express";
import { DispatchPlanningService } from "../../../services/installation/dispatch-planning/DispatchPlanning.service";
import { ApiResponse } from "../../../utils/apiResponse";
import logger from "../../../utils/logger";
import { generateSignedUrl } from "../../../utils/wasabiClient";

const service = new DispatchPlanningService();

export class DispatchPlanningController {
  /** ✅ Get all leads under Dispatch Planning (Type 13) */
  async getAllDispatchPlanningLeads(req: Request, res: Response) {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const userId = parseInt(req.params.userId);

      if (!vendorId || !userId) {
        return res
          .status(400)
          .json(ApiResponse.error("Vendor ID and User ID are required", 400));
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const leads = await service.getLeadsWithStatusDispatchPlanning(
        vendorId,
        userId,
        limit,
        page
      );

      return res
        .status(200)
        .json(
          ApiResponse.success(
            leads,
            "Dispatch Planning leads fetched successfully"
          )
        );
    } catch (error: any) {
      logger.error(
        "[DispatchPlanningController] getAllDispatchPlanningLeads Error:",
        error
      );
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error", 500));
    }
  }

  /**
   * ✅ 1️⃣ Save Dispatch Planning Information
   * @route POST /leads/installation/dispatch-planning/info/vendorId/:vendorId/leadId/:leadId
   */
  async saveDispatchPlanningInfo(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);
      const {
        required_date_for_dispatch,
        onsite_contact_person_name,
        onsite_contact_person_number,
        material_lift_availability,
        dispatch_planning_remark,
        created_by,
      } = req.body;

      if (!vendorId || !leadId || !created_by) {
        return res
          .status(400)
          .json(
            ApiResponse.error(
              "vendorId, leadId, and created_by are required",
              400
            )
          );
      }

      const result = await service.saveDispatchPlanningInfoService({
        vendor_id: vendorId,
        lead_id: leadId,
        required_date_for_dispatch,
        onsite_contact_person_name,
        onsite_contact_person_number,
        material_lift_availability: material_lift_availability === "true",
        dispatch_planning_remark,
        created_by: Number(created_by),
      });

      return res
        .status(200)
        .json(
          ApiResponse.success(
            result,
            "Dispatch Planning Info saved successfully"
          )
        );
    } catch (error: any) {
      console.error(
        "[DispatchPlanningController] saveDispatchPlanningInfo Error:",
        error
      );
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error"));
    }
  }

  /**
   * ✅ 2️⃣ Save Dispatch Planning Payment Info
   * @route POST /leads/installation/dispatch-planning/payment/vendorId/:vendorId/leadId/:leadId
   */
  async saveDispatchPlanningPayment(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);
      const {
        pending_payment,
        pending_payment_details,
        account_id,
        created_by,
      } = req.body;

      if (!vendorId || !leadId || !created_by || !account_id) {
        return res
          .status(400)
          .json(
            ApiResponse.error(
              "vendorId, leadId, account_id, and created_by are required",
              400
            )
          );
      }

      const file = req.file || null;

      const result = await service.saveDispatchPlanningPaymentService({
        vendor_id: vendorId,
        lead_id: leadId,
        account_id: Number(account_id),
        pending_payment: pending_payment ? parseFloat(pending_payment) : 0,
        pending_payment_details,
        payment_proof_file: file,
        created_by: Number(created_by),
      });

      return res
        .status(201)
        .json(
          ApiResponse.created(
            result,
            "Dispatch Planning Payment saved successfully"
          )
        );
    } catch (error: any) {
      console.error(
        "[DispatchPlanningController] saveDispatchPlanningPayment Error:",
        error
      );
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error"));
    }
  }

  /** ✅ 1️⃣ Get Dispatch Planning Info */
  async getDispatchPlanningInfo(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);

      if (!vendorId || !leadId) {
        return res
          .status(400)
          .json(ApiResponse.error("vendorId and leadId are required", 400));
      }

      const info = await service.getDispatchPlanningInfoService(
        vendorId,
        leadId
      );
      return res
        .status(200)
        .json(
          ApiResponse.success(
            info,
            "Dispatch Planning Info fetched successfully"
          )
        );
    } catch (error: any) {
      console.error(
        "[DispatchPlanningController] getDispatchPlanningInfo Error:",
        error
      );
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error"));
    }
  }

  /** ✅ 2️⃣ Get Dispatch Planning Payment Info */
  async getDispatchPlanningPayment(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);

      if (!vendorId || !leadId) {
        return res
          .status(400)
          .json(ApiResponse.error("vendorId and leadId are required", 400));
      }

      const { payment, latestLog } =
        await service.getDispatchPlanningPaymentService(vendorId, leadId);

      let responsePayload = {
        ...payment,
        latestLog,
      };

      // ✅ Add signed URL (if proof file exists)
      if (payment?.document?.doc_sys_name) {
        const signed_url = await generateSignedUrl(
          payment.document.doc_sys_name
        );
        responsePayload = {
          ...responsePayload,
          document: { ...(payment.document as any), signed_url },
        };
      }

      if (!payment) {
        return res
          .status(404)
          .json(ApiResponse.error("No Dispatch Planning payment found", 404));
      }

      return res
        .status(200)
        .json(
          ApiResponse.success(
            responsePayload,
            "Dispatch Planning Payment fetched successfully"
          )
        );
    } catch (error: any) {
      console.error(
        "[DispatchPlanningController] getDispatchPlanningPayment Error:",
        error
      );
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error"));
    }
  }

  /** ✅ Get Pending Project Amount */
  async getPendingProjectAmount(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);

      if (!vendorId || !leadId) {
        return res
          .status(400)
          .json(ApiResponse.error("vendorId and leadId are required", 400));
      }

      const result = await service.getPendingProjectAmountService(
        vendorId,
        leadId
      );

      return res
        .status(200)
        .json(
          ApiResponse.success(
            result,
            "Pending project amount fetched successfully"
          )
        );
    } catch (error: any) {
      console.error(
        "[DispatchPlanningController] getPendingProjectAmount Error:",
        error
      );
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error"));
    }
  }
}
