import { Request, Response } from "express";
import { prisma } from "../prisma/client";
import logger from "../utils/logger";

export class MetaWebhookController {
  /**
   * GET /metawebhook
   * Handshake verification endpoint for Meta webhook setup.
   * Meta sends hub.mode, hub.verify_token, and hub.challenge in query params.
   */
  verifyWebhook = async (req: Request, res: Response): Promise<Response> => {
    try {
      const mode = req.query["hub.mode"] as string;
      const token = req.query["hub.verify_token"] as string;
      const challenge = req.query["hub.challenge"] as string;

      const configuredToken =
        process.env.META_WEBHOOK_VERIFY_TOKEN ||
        process.env.META_VERIFY_TOKEN ||
        "furnix_meta_leads_2026";

      // Accept configured token or fallback default tokens
      const isValidToken =
        token === configuredToken ||
        token === "furnix_meta_leads_2026" ||
        token === "meta_webhook_verify_token_2026";

      if (mode === "subscribe" && isValidToken) {
        logger.info("[META RAW WEBHOOK] Handshake verification successful.");
        return res.status(200).send(challenge);
      } else {
        logger.warn(
          `[META RAW WEBHOOK] Handshake verification failed. Received token: ${token}, Expected: ${configuredToken}`
        );
        return res.status(403).send("Forbidden: Verification token mismatch");
      }
    } catch (error: any) {
      logger.error("[META RAW WEBHOOK] Error verifying webhook:", error);
      return res.status(500).send("Internal Server Error");
    }
  };

  /**
   * POST /metawebhook
   * Receives incoming data from Meta (or any webhook) and saves it in the database table in JSON format.
   * Table: MetaWebhook (id, data, created_at)
   */
  handleWebhook = async (req: Request, res: Response): Promise<Response> => {
    try {
      const body = req.body;

      logger.info("[META RAW WEBHOOK] Received webhook payload", {
        bodyType: typeof body,
      });

      // Save raw JSON payload directly into MetaWebhook table (id, data, created_at)
      const savedPayload = await prisma.metaWebhook.create({
        data: {
          data: body ?? {},
        },
      });

      logger.info(
        `[META RAW WEBHOOK] Successfully saved webhook data to database. ID: ${savedPayload.id}`
      );

      // Meta expects an immediate 200 OK response
      return res.status(200).json({
        success: true,
        message: "Webhook data received and stored successfully in database",
        id: savedPayload.id,
      });
    } catch (error: any) {
      logger.error("[META RAW WEBHOOK] Error saving webhook data to database:", error);
      return res.status(500).json({
        success: false,
        error: "Internal Server Error saving webhook data",
        details: error.message,
      });
    }
  };

  /**
   * GET /metawebhook/payloads (or /metawebhook/get)
   * Fetch saved webhook entries from database table with pagination.
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
      logger.error("[META RAW WEBHOOK] Error fetching webhook data:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch webhook data",
        details: error.message,
      });
    }
  };

  /**
   * GET /metawebhook/payloads/:id (or /metawebhook/get/:id)
   * Fetch a single saved webhook entry by ID.
   */
  getWebhookPayloadById = async (req: Request, res: Response): Promise<Response> => {
    try {
      const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(String(rawId), 10);
      if (isNaN(id)) {
        return res.status(400).json({
          success: false,
          error: "Invalid ID parameter",
        });
      }

      const record = await prisma.metaWebhook.findUnique({
        where: { id },
      });

      if (!record) {
        return res.status(404).json({
          success: false,
          error: `Webhook record with ID ${id} not found`,
        });
      }

      return res.status(200).json({
        success: true,
        data: record,
      });
    } catch (error: any) {
      logger.error(`[META RAW WEBHOOK] Error fetching webhook record ${req.params.id}:`, error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch webhook record",
        details: error.message,
      });
    }
  };

  /**
   * DELETE /metawebhook/delete/:id
   * Delete a webhook record from database by ID.
   */
  deleteWebhookPayloadById = async (req: Request, res: Response): Promise<Response> => {
    try {
      const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(String(rawId), 10);
      if (isNaN(id)) {
        return res.status(400).json({
          success: false,
          error: "Invalid ID parameter",
        });
      }

      await prisma.metaWebhook.delete({
        where: { id },
      });

      return res.status(200).json({
        success: true,
        message: `Webhook record ${id} deleted successfully`,
      });
    } catch (error: any) {
      logger.error(`[META RAW WEBHOOK] Error deleting webhook record ${req.params.id}:`, error);
      return res.status(500).json({
        success: false,
        error: "Failed to delete webhook record",
        details: error.message,
      });
    }
  };
}

export const metaWebhookController = new MetaWebhookController();
