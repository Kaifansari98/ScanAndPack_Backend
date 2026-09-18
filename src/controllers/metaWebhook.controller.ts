import { Request, Response } from "express";
import { prisma } from "../prisma/client";
import logger from "../utils/logger";
import {
  createOrUpdateOnlineLead,
  resolveTargetOnlineLeadVendor,
} from "../services/leadModuleServices/onlineLead.service";

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
   * POST /webhook & /metawebhook
   * Receives incoming JSON data from Google Sheets, Meta, or external tools:
   * 1. Preserves raw payload in MetaWebhook table.
   * 2. Creates or updates lead in online_leads with assign_to = null (Lead Pool).
   */
  handleWebhook = async (req: Request, res: Response): Promise<Response> => {
    try {
      const body = req.body || {};

      logger.info("[WEBHOOK] Received webhook payload", {
        bodyType: typeof body,
      });

      // 1. Keep existing MetaWebhook raw-payload save (Requirement 4)
      let savedPayloadId: number | null = null;
      try {
        const savedPayload = await prisma.metaWebhook.create({
          data: {
            data: body ?? {},
          },
        });
        savedPayloadId = savedPayload.id;
        logger.info(
          `[WEBHOOK] Successfully saved raw data to MetaWebhook table. ID: ${savedPayload.id}`
        );
      } catch (saveErr: any) {
        logger.warn(
          "[WEBHOOK] Warning saving raw payload to MetaWebhook table:",
          saveErr?.message
        );
      }

      // 2. Extract lead details flexibly (supports Google Sheet, direct JSON, or nested structures)
      const rawContact =
        body.contact ||
        body.phone ||
        body.phone_number ||
        body.mobile ||
        body.contact_no ||
        (body.lead && (body.lead.contact || body.lead.phone || body.lead.phone_number)) ||
        (body.entry?.[0]?.changes?.[0]?.value?.phone_number) ||
        null;

      const leadsName =
        body.leads_name ||
        body.name ||
        body.customer_name ||
        body.fullName ||
        body.lead_name ||
        (body.lead && (body.lead.leads_name || body.lead.name || body.lead.customer_name)) ||
        (body.entry?.[0]?.changes?.[0]?.value?.customer_name) ||
        null;

      // If contact or name is present, process into Lead Pool
      if (rawContact || leadsName) {
        // Dynamically resolve target vendor based on is_online_lead_feature_enabled
        const vendorResolution = await resolveTargetOnlineLeadVendor(req);
        if (vendorResolution.error) {
          logger.warn(
            `[WEBHOOK] Vendor resolution failed: ${vendorResolution.error}`
          );
          return res.status(vendorResolution.ambiguous ? 422 : 400).json({
            success: false,
            error: vendorResolution.error,
            eligible_vendors: vendorResolution.eligibleVendors,
            metaWebhookId: savedPayloadId,
          });
        }

        const vendorId = vendorResolution.vendorId!;

        const email =
          body.email ||
          body.email_id ||
          (body.lead && body.lead.email) ||
          (body.entry?.[0]?.changes?.[0]?.value?.email) ||
          null;

        const city =
          body.city ||
          (body.lead && body.lead.city) ||
          (body.entry?.[0]?.changes?.[0]?.value?.city) ||
          null;

        const source =
          body.source ||
          (body.lead && body.lead.source) ||
          "Google Sheet";

        const remark =
          body.remark ||
          body.notes ||
          body.comments ||
          (body.lead && body.lead.remark) ||
          null;

        const priority =
          body.priority ||
          (body.lead && body.lead.priority) ||
          "Medium";

        // Parse product_types (array or comma-separated string)
        let productTypes: string[] = [];
        const rawTypes =
          body.product_types ||
          body.productTypes ||
          (body.lead && (body.lead.product_types || body.lead.productTypes));
        if (Array.isArray(rawTypes)) {
          productTypes = rawTypes.map(String).filter(Boolean);
        } else if (typeof rawTypes === "string" && rawTypes.trim()) {
          productTypes = rawTypes
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean);
        }

        // Parse product_structures (array or comma-separated string)
        let productStructures: string[] = [];
        const rawStructs =
          body.product_structures ||
          body.productStructures ||
          (body.lead && (body.lead.product_structures || body.lead.productStructures));
        if (Array.isArray(rawStructs)) {
          productStructures = rawStructs.map(String).filter(Boolean);
        } else if (typeof rawStructs === "string" && rawStructs.trim()) {
          productStructures = rawStructs
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean);
        }

        const { lead, isNew } = await createOrUpdateOnlineLead({
          vendor_id: vendorId,
          leads_name: String(leadsName || "Google Sheet Lead").trim(),
          contact: String(rawContact || "").trim(),
          email,
          city,
          source,
          remark,
          priority,
          product_types: productTypes,
          product_structures: productStructures,
          assign_to: null, // Lead Pool
        });

        logger.info(
          `[WEBHOOK] Successfully ${isNew ? "created" : "updated"} lead in Lead Pool. ID: ${lead.id}, Code: ${lead.lead_code}`
        );

        return res.status(200).json({
          success: true,
          message: isNew
            ? "Lead received and created in Lead Pool"
            : "Lead received and updated in Lead Pool",
          metaWebhookId: savedPayloadId,
          lead: {
            id: lead.id,
            lead_code: lead.lead_code,
            leads_name: lead.leads_name,
            contact: lead.contact,
            source: lead.source,
            assign_to: lead.assign_to,
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: "Webhook data received and stored successfully in database",
        id: savedPayloadId,
      });
    } catch (error: any) {
      logger.error("[WEBHOOK] Error processing webhook data:", error);
      return res.status(500).json({
        success: false,
        error: "Internal Server Error processing webhook data",
        details: error.message,
      });
    }
  };
}

export const metaWebhookController = new MetaWebhookController();
