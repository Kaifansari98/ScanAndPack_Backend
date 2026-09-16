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

      const verifyToken = "12345";

      await prisma.metaWebhook.create({
          data: {
            data: req.query ?? {},
          },
        });

      const mode = req.query["hub.mode"] as string;
      // res.status(200).send(mode);
      const token = req.query["hub.verify_token"] as string;
      const challenge = req.query["hub.challenge"] as string;

       
      // const configuredToken = verifyToken;
        // process.env.META_WEBHOOK_VERIFY_TOKEN ||
        // process.env.META_VERIFY_TOKEN ||
        // verifyToken;

      const isValidToken =
        token === verifyToken;

      if (mode === "subscribe" && isValidToken) {
        logger.info("[META WEBHOOK] Handshake verification successful.");
        // Handshake data ko database table me save karein
        await prisma.metaWebhook.create({
          data: {
            data: req.query ?? {},
          },
        });
        // MUST return HTTP 200 with raw challenge text
        return res.status(200).send(challenge);
      } else {
        logger.warn(
          `[META WEBHOOK] Handshake verification failed. Mode: ${mode}, Token: ${token}`
        );
        return res.sendStatus(403);
      }
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
   * GET /metawebhook/list or /metawebhook/payloads
   * Fetch saved webhook entries from database table with pagination (agar records dekhne ho).
   */
  getWebhookPayloads = async (req: Request, res: Response): Promise<Response> => {
    try {
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
      logger.error("[META WEBHOOK] Error fetching webhook data:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch webhook data",
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
