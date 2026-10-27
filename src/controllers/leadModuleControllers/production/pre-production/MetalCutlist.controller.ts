import { Request, Response } from "express";
import {
  MetalCutlistError,
  MetalCutlistService,
  validateMetalCutlistParts,
} from "../../../../services/production/pre-production/MetalCutlist.service";

const service = new MetalCutlistService();

const getParam = (param: string | string[] | undefined): string | undefined =>
  Array.isArray(param) ? param[0] : param;

const handleError = (res: Response, label: string, error: any) => {
  if (error instanceof MetalCutlistError) {
    return res.status(error.statusCode).json({ success: false, message: error.message });
  }
  console.error(`[MetalCutlistController] ${label} Error:`, error);
  return res.status(500).json({
    success: false,
    message: error?.message || "Internal server error",
  });
};

export class MetalCutlistController {
  static async getMetalCutlist(req: Request, res: Response) {
    try {
      const vendorId = Number(getParam(req.params.vendorId));
      const leadId = Number(getParam(req.params.leadId));

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const instanceId = Number(getParam(req.query.instance_id as string | string[] | undefined)) || null;
      const data = await service.getMetalCutlist(vendorId, leadId, instanceId);
      return res.status(200).json({
        success: true,
        message: "Metalwork Cutlist fetched successfully",
        data,
      });
    } catch (error: any) {
      return handleError(res, "getMetalCutlist", error);
    }
  }

  static async saveMetalCutlist(req: Request, res: Response) {
    try {
      const vendorId = Number(getParam(req.params.vendorId));
      const leadId = Number(getParam(req.params.leadId));
      const createdBy = Number(req.body.created_by);
      const images = (req.files as Express.Multer.File[] | undefined) ?? [];

      if (!vendorId || !leadId || !createdBy) {
        return res.status(400).json({
          success: false,
          message: "vendorId, leadId and created_by are required",
        });
      }

      if (images.some((image) => image.mimetype !== "image/png")) {
        return res.status(400).json({
          success: false,
          message: "Part images must be PNG files",
        });
      }

      let rawParts: unknown;
      try {
        rawParts = JSON.parse(req.body.parts ?? "");
      } catch {
        return res.status(400).json({
          success: false,
          message: "parts must be a JSON array",
        });
      }

      const parts = validateMetalCutlistParts(rawParts, images.length);
      const instanceId = Number(req.body.instance_id) || null;
      const data = await service.saveMetalCutlist(vendorId, leadId, createdBy, parts, images, instanceId);

      return res.status(201).json({
        success: true,
        message: "Metalwork Cutlist saved successfully",
        data,
      });
    } catch (error: any) {
      return handleError(res, "saveMetalCutlist", error);
    }
  }
}
