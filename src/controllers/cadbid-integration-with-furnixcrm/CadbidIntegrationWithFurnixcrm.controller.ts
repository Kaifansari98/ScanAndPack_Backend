import { Request, Response } from "express";
import { ApiResponse } from "../../utils/apiResponse";
import { cadbidIntegrationWithFurnixcrmService } from "../../services/cadbid-integration-with-furnixcrm/CadbidIntegrationWithFurnixcrm.service";

export class CadbidIntegrationWithFurnixcrmController {
  async syncLeadCustomer(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);

      if (!vendorId || !leadId) {
        return res
          .status(400)
          .json(ApiResponse.error("vendorId and leadId are required", 400));
      }

      const result = await cadbidIntegrationWithFurnixcrmService.syncLeadToCadbid(
        vendorId,
        leadId,
      );

      return res
        .status(201)
        .json(
          ApiResponse.success(
            result,
            "Cadbid external customer synced successfully",
          ),
        );
    } catch (error: any) {
      return res.status(error.statusCode || 500).json(
        ApiResponse.error(
          error.message || "Failed to sync external customer to Cadbid",
          error.statusCode || 500,
        ),
      );
    }
  }
}

export const cadbidIntegrationWithFurnixcrmController =
  new CadbidIntegrationWithFurnixcrmController();
