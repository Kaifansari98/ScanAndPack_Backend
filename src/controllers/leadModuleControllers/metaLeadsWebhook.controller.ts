import { Request, Response } from "express";
import { prisma } from "../../prisma/client";
import logger from "../../utils/logger";
import axios from "axios";
import crypto from "crypto";

export class MetaLeadsWebhookController {
  /**
   * GET /webhooks/meta/leads
   * Handshake verification endpoint for Meta webhook setup.
   */
  verifyWebhook = async (req: Request, res: Response): Promise<Response> => {
    try {
      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];

      const systemVerifyToken = process.env.META_VERIFY_TOKEN || "meta_leads_webhook_verify_token_2026";

      if (mode === "subscribe" && token === systemVerifyToken) {
        logger.info("[META WEBHOOK] Verification successful.");
        return res.status(200).send(challenge);
      } else {
        logger.warn(
          `[META WEBHOOK] Verification failed. Received token: ${token}, Expected: ${systemVerifyToken}`
        );
        return res.status(403).send("Forbidden: Verification token mismatch");
      }
    } catch (error: any) {
      logger.error("[META WEBHOOK] Error verifying webhook:", error);
      return res.status(500).send("Internal Server Error");
    }
  };

  /**
   * POST /webhooks/meta/leads
   * Receives real-time lead submission notifications from Meta.
   */
  handleWebhook = async (req: Request, res: Response): Promise<Response> => {
    try {
      const signature = req.headers["x-hub-signature-256"] as string;
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);

      // Validate signature if APP_SECRET is configured
      if (process.env.META_APP_SECRET && signature) {
        const isSignatureValid = this.verifySignature(signature, rawBody, process.env.META_APP_SECRET);
        if (!isSignatureValid) {
          logger.warn("[META WEBHOOK] Signature validation failed. Unauthorized request.");
          return res.status(401).json({ success: false, error: "Invalid signature" });
        }
      }

      const { object, entry } = req.body;
      logger.info("[META WEBHOOK] Received webhook event", { object, entryCount: entry?.length });

      if (object !== "page") {
        return res.status(200).json({ success: true, message: "Event ignored (not a page object)" });
      }

      if (!entry || !Array.isArray(entry)) {
        return res.status(200).json({ success: true, message: "Event ignored (empty entry)" });
      }

      for (const ent of entry) {
        const pageId = ent.id;
        const changes = ent.changes || [];

        // Check if event page ID matches configured PAGE_ID (if specified in env)
        if (process.env.META_PAGE_ID && pageId !== process.env.META_PAGE_ID) {
          logger.info(`[META WEBHOOK] Page ID ${pageId} does not match META_PAGE_ID ${process.env.META_PAGE_ID}. Skipping.`);
          continue;
        }

        for (const change of changes) {
          if (change.field === "leadgen") {
            const { leadgen_id, form_id } = change.value || {};

            if (!leadgen_id) {
              logger.warn("[META WEBHOOK] Missing leadgen_id in change value", { change });
              continue;
            }

            // Check if form ID matches configured FORM_ID (if specified in env)
            if (process.env.META_FORM_ID && form_id !== process.env.META_FORM_ID) {
              logger.info(`[META WEBHOOK] Form ID ${form_id} does not match META_FORM_ID ${process.env.META_FORM_ID}. Skipping.`);
              continue;
            }

            logger.info(`[META WEBHOOK] Processing lead: ${leadgen_id} from Form: ${form_id}`);

            try {
              await this.ingestMetaLead(leadgen_id, form_id);
            } catch (err: any) {
              logger.error(`[META WEBHOOK] Error ingesting lead ID ${leadgen_id}:`, err);
            }
          }
        }
      }

      return res.status(200).json({ success: true });
    } catch (error: any) {
      logger.error("[META WEBHOOK] Critical error in handleWebhook:", error);
      return res.status(500).json({ success: false, error: "Internal Server Error" });
    }
  };

  /**
   * POST /webhooks/meta/leads/debug
   * Debug/Test endpoint to verify integration works with a specific Meta lead ID manually.
   */
  debugIngest = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { lead_id, form_id } = req.body;

      if (!lead_id) {
        return res.status(400).json({
          success: false,
          error: "Required fields: lead_id",
        });
      }

      logger.info(`[META WEBHOOK DEBUG] Manually triggering ingestion for lead: ${lead_id}`);
      const lead = await this.ingestMetaLead(String(lead_id), form_id || "debug_form_id");

      return res.status(201).json({
        success: true,
        message: "Debug lead ingested successfully",
        data: lead,
      });
    } catch (error: any) {
      logger.error("[META WEBHOOK DEBUG] Error during debug ingestion:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to ingest debug lead",
      });
    }
  };

  /**
   * Main helper to ingest a Meta lead: check duplicates, fetch details, and save.
   */
  private async ingestMetaLead(leadgenId: string, formId: string) {
    // 1. Prevent Duplicate Ingestion using Unique Meta Lead ID
    const existingLead = await prisma.metaLead.findUnique({
      where: { meta_lead_id: leadgenId },
    });

    if (existingLead) {
      logger.info(`[META WEBHOOK] Duplicate lead skipped. Leadgen ID ${leadgenId} already exists in database.`);
      return existingLead;
    }

    const accessToken = process.env.META_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error("META_ACCESS_TOKEN is not configured in backend environment variables.");
    }

    // 2. Retrieve Complete Lead Information from Meta Graph API
    logger.info(`[META WEBHOOK] Calling Meta Graph API for lead ID: ${leadgenId}`);
    let response;
    try {
      response = await axios.get(`https://graph.facebook.com/v20.0/${leadgenId}`, {
        params: {
          access_token: accessToken,
        },
      });
    } catch (error: any) {
      logger.error(
        `[META WEBHOOK] Meta Graph API call failed for lead ${leadgenId}`,
        error?.response?.data || error.message
      );
      throw new Error(`Meta Graph API failure: ${error?.response?.data?.error?.message || error.message}`);
    }

    const leadData = response.data;
    if (!leadData || !leadData.field_data) {
      throw new Error(`Invalid or empty response from Graph API for lead ID ${leadgenId}`);
    }

    // 3. Parse fields: name, phone, email, and custom fields
    const parsedFields: Record<string, string> = {};
    const customFieldsMap: Record<string, string> = {};

    for (const field of leadData.field_data) {
      const fieldName = field.name;
      const fieldValue = field.values && field.values.length > 0 ? field.values[0] : "";

      if (fieldName === "full_name" || fieldName === "first_name" || fieldName === "last_name") {
        parsedFields[fieldName] = fieldValue;
      } else if (fieldName === "email") {
        parsedFields["email"] = fieldValue;
      } else if (fieldName === "phone_number" || fieldName === "phone" || fieldName === "contact") {
        parsedFields["phone_number"] = fieldValue;
      } else {
        customFieldsMap[fieldName] = fieldValue;
      }
    }

    // Combine name fields
    let fullName = parsedFields["full_name"] || "";
    if (!fullName) {
      const firstName = parsedFields["first_name"] || "";
      const lastName = parsedFields["last_name"] || "";
      fullName = `${firstName} ${lastName}`.trim();
    }
    if (!fullName) {
      fullName = "Meta Lead Ads Customer";
    }

    const email = parsedFields["email"] || null;
    let phone = parsedFields["phone_number"] || "";
    // Clean phone number (leave digits only)
    phone = phone.trim().replace(/[^\d+]/g, "");

    const platform = leadData.platform === "ig" ? "Instagram" : "Facebook";
    const leadSource = `${platform} Lead Ads`;
    const formName = leadData.form_name || "Meta Leads";

    // 4. Save to Database
    const newLead = await prisma.metaLead.create({
      data: {
        meta_lead_id: leadgenId,
        name: fullName,
        phone: phone || "0000000000",
        email: email,
        form_name: formName,
        form_id: formId,
        lead_source: leadSource,
        status: "New",
        custom_fields: customFieldsMap,
        created_date: leadData.created_time ? new Date(leadData.created_time) : new Date(),
      },
    });

    logger.info(`[META WEBHOOK] Lead ${leadgenId} successfully ingested as local ID ${newLead.id}`);
    return newLead;
  }

  /**
   * Helper to verify SHA256 Webhook Signatures
   */
  private verifySignature(signature: string, payload: string, secret: string): boolean {
    try {
      const elements = signature.split("=");
      const method = elements[0];
      const signatureHash = elements[1];

      if (method !== "sha256" || !signatureHash) {
        return false;
      }

      const expectedHash = crypto
        .createHmac("sha256", secret)
        .update(payload)
        .digest("hex");

      return signatureHash === expectedHash;
    } catch {
      return false;
    }
  }
}

export const metaLeadsWebhookController = new MetaLeadsWebhookController();
