import { Request, Response } from "express";
import { ApiResponse } from "../../../utils/apiResponse";
import { CHSSelectionTypeMappingService } from "../../../services/leadModuleServices/desigingStage/chs-selection-type-mapping.service";

export class CHSSelectionTypeMappingController {
  /**
   * POST /leads/designing-stage/chs-selection-type-mapping
   * Body: { vendor_id, lead_id, selection_id, items: [...], created_by }
   * Replaces all existing mappings for the given selection_id.
   */
  public static async upsert(req: Request, res: Response) {
    try {
      const { vendor_id, lead_id, selection_id, items, created_by } = req.body;

      if (!vendor_id || !lead_id || !selection_id || !created_by) {
        return res
          .status(400)
          .json(
            ApiResponse.validationError(
              "vendor_id, lead_id, selection_id and created_by are required",
            ),
          );
      }

      if (!Array.isArray(items)) {
        return res
          .status(400)
          .json(ApiResponse.validationError("items must be an array"));
      }

      const result = await CHSSelectionTypeMappingService.upsert({
        vendor_id: Number(vendor_id),
        lead_id: Number(lead_id),
        selection_id: Number(selection_id),
        items,
        created_by: Number(created_by),
      });

      return res
        .status(200)
        .json(ApiResponse.success(result, "CHS mappings saved successfully"));
    } catch (error: any) {
      if (error.message.includes("not found")) {
        return res.status(404).json(ApiResponse.notFound(error.message));
      }
      return res.status(500).json(ApiResponse.error(error.message));
    }
  }

  /**
   * GET /leads/designing-stage/vendor/:vendorId/lead/:leadId/chs-selection-type-mapping
   * Query: ?selection_id=<number>  (optional)
   */
  public static async getByLead(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;
      const { selection_id } = req.query;

      if (!vendorId || !leadId) {
        return res
          .status(400)
          .json(ApiResponse.validationError("vendorId and leadId are required"));
      }

      const result = await CHSSelectionTypeMappingService.getByLead(
        Number(vendorId),
        Number(leadId),
        selection_id ? Number(selection_id) : undefined,
      );

      return res
        .status(200)
        .json(ApiResponse.success(result, "CHS mappings fetched successfully"));
    } catch (error: any) {
      return res.status(500).json(ApiResponse.error(error.message));
    }
  }

  /**
   * PUT /leads/designing-stage/chs-selection-type-mapping/:id
   * Body: { carcass_type_id?, shutter_type_id?, shutter_sub_type_id?, handle_type_id?, updated_by }
   */
  public static async updateById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        carcass_type_id,
        shutter_type_id,
        shutter_sub_type_id,
        handle_type_id,
        updated_by,
      } = req.body;

      if (!updated_by) {
        return res
          .status(400)
          .json(ApiResponse.validationError("updated_by is required"));
      }

      const result = await CHSSelectionTypeMappingService.updateById(
        Number(id),
        {
          carcass_type_id: carcass_type_id != null ? Number(carcass_type_id) : null,
          shutter_type_id: shutter_type_id != null ? Number(shutter_type_id) : null,
          shutter_sub_type_id: shutter_sub_type_id != null ? Number(shutter_sub_type_id) : null,
          handle_type_id: handle_type_id != null ? Number(handle_type_id) : null,
          updated_by: Number(updated_by),
        },
      );

      return res
        .status(200)
        .json(ApiResponse.success(result, "CHS mapping updated successfully"));
    } catch (error: any) {
      if (error.message.includes("not found")) {
        return res.status(404).json(ApiResponse.notFound(error.message));
      }
      return res.status(500).json(ApiResponse.error(error.message));
    }
  }
}
