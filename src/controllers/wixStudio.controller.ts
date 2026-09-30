import { Request, Response } from "express";
import { wixStudioService } from "../services/wixStudio.service";
import logger from "../utils/logger";

export class WixStudioController {
  captureData = async (req: Request, res: Response): Promise<Response> => {
    try {
      const record = await wixStudioService.captureData(req.body);

      return res.status(200).json({
        success: true,
        message: "Wix Studio data captured successfully",
        data: {
          id: record.id,
        },
      });
    } catch (error: any) {
      logger.error("[WIX STUDIO] Error capturing data:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to capture Wix Studio data",
      });
    }
  };
}

export const wixStudioController = new WixStudioController();

