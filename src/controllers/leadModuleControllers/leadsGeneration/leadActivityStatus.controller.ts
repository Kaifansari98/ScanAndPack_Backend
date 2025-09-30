import { Request, Response } from "express";
import { LeadActivityStatusService } from "../../../services/leadModuleServices/leadsGeneration/leadActivityStatus.service";
import { ApiResponse } from "../../../utils/apiResponse";
import { ActivityStatus } from "@prisma/client";

export class LeadActivityStatusController {
  static async updateStatus(req: Request, res: Response) {
    try {
      const { leadId } = req.params;
      const { vendorId, accountId, userId, status, remark, createdBy } =
        req.body;

      if (
        ![
          ActivityStatus.onHold,
          ActivityStatus.lost,
          ActivityStatus.lostApproval,
        ].includes(status)
      ) {
        return res
          .status(400)
          .json(
            ApiResponse.error(
              "Only onHold, lost or lostApproval statuses are allowed",
              400
            )
          );
      }

      if (!remark) {
        return res
          .status(400)
          .json(ApiResponse.validationError("Remark is required."));
      }

      const lead = await LeadActivityStatusService.updateStatus(
        Number(leadId),
        vendorId,
        accountId,
        userId,
        status,
        remark,
        createdBy
      );

      return res
        .status(200)
        .json(ApiResponse.success(lead, "Lead activity status updated"));
    } catch (error: any) {
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal Server Error"));
    }
  }

  static async revertToOnGoing(req: Request, res: Response) {
    try {
      const { leadId } = req.params;
      const { vendorId, accountId, userId, remark, createdBy } = req.body;

      if (!remark) {
        return res
          .status(400)
          .json(ApiResponse.validationError("Remark is required."));
      }

      const lead = await LeadActivityStatusService.revertToOnGoing(
        Number(leadId),
        vendorId,
        accountId,
        userId,
        remark,
        createdBy
      );

      return res
        .status(200)
        .json(ApiResponse.success(lead, "Lead reverted to onGoing"));
    } catch (error: any) {
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal Server Error"));
    }
  }

  static async getOnHoldLeads(req: Request, res: Response) {
    try {
      const { vendorId } = req.params;

      const leads = await LeadActivityStatusService.getOnHoldLeads(
        Number(vendorId)
      );

      return res
        .status(200)
        .json(ApiResponse.success(leads, "OnHold leads fetched successfully"));
    } catch (error: any) {
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal Server Error"));
    }
  }

  static async getLostLeads(req: Request, res: Response) {
    try {
      const { vendorId } = req.params;

      const leads = await LeadActivityStatusService.getLostLeads(
        Number(vendorId)
      );

      return res
        .status(200)
        .json(ApiResponse.success(leads, "Lost leads fetched successfully"));
    } catch (error: any) {
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal Server Error"));
    }
  }

  static async getLostApprovalLeads(req: Request, res: Response) {
    try {
      const { vendorId } = req.params;

      const leads = await LeadActivityStatusService.getLostApprovalLeads(
        Number(vendorId)
      );

      return res
        .status(200)
        .json(
          ApiResponse.success(leads, "LostApproval leads fetched successfully")
        );
    } catch (error: any) {
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal Server Error"));
    }
  }
}