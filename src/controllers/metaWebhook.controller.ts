import { Request, Response } from "express";
import { prisma } from "../prisma/client";
import logger from "../utils/logger";

export class MetaWebhookController {
  /**
   * GET /metawebhook
   * 1. Agar Meta verification query params (hub.mode, hub.challenge) hain -> handshake verify karke challenge return karega.
   * 2. Normal GET request (Postman / Browser) -> database me save huye records fetch karke dega.
   */
  handleGet = async (req: Request, res: Response): Promise<Response> => {
    try {
      const mode = req.query["hub.mode"] as string;

      // Meta Handshake Verification
      if (mode === "subscribe") {
        const token = req.query["hub.verify_token"] as string;
        const challenge = req.query["hub.challenge"] as string;

        const configuredToken =
          process.env.META_WEBHOOK_VERIFY_TOKEN ||
          process.env.META_VERIFY_TOKEN ||
          "furnix_meta_leads_2026";

        const isValidToken =
          token === configuredToken ||
          token === "furnix_meta_leads_2026" ||
          token === "meta_webhook_verify_token_2026";

        if (isValidToken) {
          logger.info("[META WEBHOOK] Handshake verification successful.");
          return res.status(200).send(challenge);
        } else {
          logger.warn(
            `[META WEBHOOK] Handshake verification failed. Received token: ${token}, Expected: ${configuredToken}`
          );
          return res.status(403).send("Forbidden: Verification token mismatch");
        }
      }

      // Fetch saved data list from database
      const page = Math.max(1, parseInt(String(req.query.page || 1), 10) || 1);
      const limit = Math.min(
        100,
        Math.max(1, parseInt(String(req.query.limit || 20), 10) || 20)
      );
      const skip = (page - 1) * limit;

      const [totalCount, records] = await Promise.all([
        prisma.metaWebhook.count(),
        prisma.metaWebhook.findMany({
          orderBy: { created_at: "desc" },
          skip,
          take: limit,
        }),
      ]);

      return res.status(200).json({
        success: true,
        pagination: {
          total: totalCount,
          page,
          limit,
          totalPages: Math.ceil(totalCount / limit),
        },
        data: records,
      });
    } catch (error: any) {
      logger.error("[META WEBHOOK] Error in GET /metawebhook:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to process GET /metawebhook",
        details: error.message,
      });
    }
  };

  /**
   * POST /metawebhook
   * Receives incoming JSON data and saves it directly into MetaWebhook table (id, data, created_at)
   */
  handleWebhook = async (req: Request, res: Response): Promise<Response> => {
    try {
      const body = req.body;

      logger.info("[META WEBHOOK] Received webhook payload", {
        bodyType: typeof body,
      });

      // Save raw JSON payload directly into database table MetaWebhook
      const savedPayload = await prisma.metaWebhook.create({
        data: {
          data: body ?? {},
        },
      });

      logger.info(
        `[META WEBHOOK] Successfully saved data to database. ID: ${savedPayload.id}`
      );

      return res.status(200).json({
        success: true,
        message: "Webhook data received and stored successfully in database",
        id: savedPayload.id,
      });
    } catch (error: any) {
      logger.error("[META WEBHOOK] Error saving webhook data to database:", error);
      return res.status(500).json({
        success: false,
        error: "Internal Server Error saving webhook data",
        details: error.message,
      });
    }
  };
}

export const metaWebhookController = new MetaWebhookController();
