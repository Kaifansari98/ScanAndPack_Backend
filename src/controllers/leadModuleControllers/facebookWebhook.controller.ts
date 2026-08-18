import { Request, Response } from "express";
import { prisma } from "../../prisma/client";
import { LeadEntryType } from "../../../generated/prisma_client/client";
import logger from "../../utils/logger";
import axios from "axios";
import { generateLeadCode } from "../../utils/generateLeadCode";

export class FacebookWebhookController {
  /**
   * GET /webhook/facebook
   * Webhook verification handshake with Meta Graph API.
   */
  verifyWebhook = async (req: Request, res: Response): Promise<Response> => {
    try {
      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];

      const systemVerifyToken = process.env.FB_WEBHOOK_VERIFY_TOKEN || "vloq_fb_webhook_verify_token_2026";

      if (mode === "subscribe" && token === systemVerifyToken) {
        logger.info("[FACEBOOK WEBHOOK] Verification successful.");
        return res.status(200).send(challenge);
      } else {
        logger.warn(
          `[FACEBOOK WEBHOOK] Verification failed. Received token: ${token}, Expected: ${systemVerifyToken}`
        );
        return res.status(403).send("Forbidden: Verification token mismatch");
      }
    } catch (error: any) {
      logger.error("[FACEBOOK WEBHOOK] Error verifying webhook:", error);
      return res.status(500).send("Internal Server Error");
    }
  };

  /**
   * POST /webhook/facebook
   * Handles lead events sent by Meta.
   */
  handleWebhook = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { object, entry } = req.body;

      logger.info("[FACEBOOK WEBHOOK] Received webhook event", { object, entryCount: entry?.length });

      if (object !== "page") {
        return res.status(200).json({ success: true, message: "Event ignored (not a page object)" });
      }

      if (!entry || !Array.isArray(entry)) {
        return res.status(200).json({ success: true, message: "Event ignored (empty entry)" });
      }

      // Loop through all entries and changes asynchronously
      for (const ent of entry) {
        const pageId = ent.id; // Facebook Page ID
        const changes = ent.changes || [];

        for (const change of changes) {
          // Meta sends "leadgen" field for lead ads submissions
          if (change.field === "leadgen" || change.field === "leads") {
            const { leadgen_id, form_id } = change.value || {};

            if (!leadgen_id) {
              logger.warn("[FACEBOOK WEBHOOK] Missing leadgen_id in change value", { change });
              continue;
            }

            logger.info(`[FACEBOOK WEBHOOK] Processing lead submission: ${leadgen_id} for Page: ${pageId}`);

            try {
              await this.processLead(leadgen_id, form_id, pageId);
            } catch (err: any) {
              logger.error(`[FACEBOOK WEBHOOK] Failed to process lead ID ${leadgen_id}:`, err);
              // We do not crash or throw, so we can continue processing other entries in the batch
            }
          }
        }
      }

      // Always return 200 OK to Meta to acknowledge receipt and avoid retries
      return res.status(200).json({ success: true });
    } catch (error: any) {
      logger.error("[FACEBOOK WEBHOOK] Critical error in handleWebhook:", error);
      return res.status(500).json({ success: false, error: "Internal Server Error" });
    }
  };

  /**
   * Fetch lead details from Graph API and save into the database
   */
  private async processLead(leadgenId: string, formId: string, pageId: string) {
    // 1. Ensure the FACEBOOK Platform exists in ExternalPlatformMaster
    const facebookPlatform = await prisma.externalPlatformMaster.upsert({
      where: { type: "FACEBOOK" },
      update: {},
      create: {
        external_platform_name: "Facebook",
        type: "FACEBOOK",
        active: "Yes",
      },
    });

    // 2. Lookup Page Access Token by Page ID (company_id)
    const tokenRecord = await prisma.externalPlatformToken.findFirst({
      where: {
        external_platform_id: facebookPlatform.id,
        company_id: pageId,
        active: "Yes",
      },
      orderBy: {
        updated_at: "desc",
      },
    });

    if (!tokenRecord) {
      logger.warn(
        `[FACEBOOK WEBHOOK] No active Facebook Page Access Token found for Page ID: ${pageId}. Lead ${leadgenId} cannot be retrieved.`
      );
      return;
    }

    const { token, vendor_id } = tokenRecord;

    // 3. Fetch lead details from Meta Graph API
    let leadResponse;
    try {
      leadResponse = await axios.get(`https://graph.facebook.com/v20.0/${leadgenId}`, {
        params: {
          access_token: token,
        },
      });
    } catch (error: any) {
      logger.error(
        `[FACEBOOK WEBHOOK] Graph API request failed for lead ${leadgenId} using page token`,
        error?.response?.data || error.message
      );
      throw error;
    }

    const leadData = leadResponse.data;
    if (!leadData || !leadData.field_data) {
      logger.warn(`[FACEBOOK WEBHOOK] Empty lead data returned for ID ${leadgenId}`, { leadData });
      return;
    }

    // 4. Parse Meta fields from field_data
    const fields: Record<string, string> = {};
    const customFields: Array<{ question: string; answer: string }> = [];

    for (const field of leadData.field_data) {
      const name = field.name;
      const val = field.values ? field.values[0] : "";

      if (name === "full_name" || name === "first_name" || name === "last_name" || name === "email" || name === "phone_number") {
        fields[name] = val;
      } else {
        customFields.push({ question: name, answer: val });
      }
    }

    // Determine First & Last Name
    let firstName = fields["first_name"] || "";
    let lastName = fields["last_name"] || "";
    let fullName = fields["full_name"] || "";

    if (fullName && (!firstName && !lastName)) {
      const parts = fullName.trim().split(/\s+/);
      firstName = parts[0] || "";
      lastName = parts.slice(1).join(" ") || "";
    } else if (!fullName && (firstName || lastName)) {
      fullName = `${firstName} ${lastName}`.trim();
    }

    if (!fullName) {
      fullName = leadData.platform === "ig" ? "Instagram Lead" : "Facebook Lead";
    }

    const email = fields["email"] || null;
    let contactNumber = fields["phone_number"] || "";

    // Basic cleaning of contact number
    contactNumber = contactNumber.trim().replace(/[^\d+]/g, "");

    // Meta platform can be "fb" or "ig"
    const platform = leadData.platform === "ig" ? "Instagram" : "Facebook";

    // 5. Look up source_id mapping from SourceMaster
    const matchedSource = await prisma.sourceMaster.findFirst({
      where: {
        vendor_id: vendor_id,
        type: {
          contains: platform,
          mode: "insensitive",
        },
      },
    });

    // 6. Get default followup status for this vendor
    const defaultStatus = await prisma.onlineLeadFollowupStatus.findFirst({
      where: {
        vendor_id: vendor_id,
        is_active: true,
      },
      orderBy: {
        id: "asc",
      },
    });

    // Construct Remark (include Form details and custom questions)
    let remarkContent = `Lead automatically ingested from Meta Ad Form.\n`;
    if (leadData.form_name) {
      remarkContent += `Form Name: ${leadData.form_name}\n`;
    }
    if (formId) {
      remarkContent += `Form ID: ${formId}\n`;
    }
    remarkContent += `Leadgen ID: ${leadgenId}\n`;

    if (customFields.length > 0) {
      remarkContent += `\n--- Form Questionnaire ---\n`;
      for (const cf of customFields) {
        remarkContent += `Q: ${cf.question}\nA: ${cf.answer}\n`;
      }
    }

    const vendorRecord = await prisma.vendorMaster.findUnique({
      where: { id: vendor_id },
      select: { is_year_wise_lead_code_enabled: true },
    });
    let generatedCode: string | null = null;
    if (vendorRecord?.is_year_wise_lead_code_enabled) {
      generatedCode = await generateLeadCode(prisma, {
        franchiseId: 1, // dummy value, year-wise doesn't use franchiseId
        vendorId: vendor_id,
      });
    }

    // 7. Insert lead into PostgreSQL online_leads table
    const lead = await prisma.onlineLead.create({
      data: {
        vendor_id: vendor_id,
        leads_name: fullName,
        lead_code: generatedCode,
        firstname: firstName || null,
        lastname: lastName || null,
        email: email,
        contact: contactNumber || "0000000000",
        source: platform,
        source_id: matchedSource?.id || null,
        lead_entry_type: LeadEntryType.ONLINE,
        remark: remarkContent,
        status: defaultStatus?.id || null,
      },
    });

    // 8. Log lead history status
    if (defaultStatus) {
      await prisma.onlineLeadHistory.create({
        data: {
          vendor_id: vendor_id,
          online_lead_id: lead.id,
          remark: "Lead automatically created from Meta Ads integration",
          created_by: 1, // system / admin placeholder
          online_lead_status_id: defaultStatus.id,
        },
      });
    }

    logger.info(
      `[FACEBOOK WEBHOOK] Successfully ingested lead ${leadgenId} for Vendor ${vendor_id} as OnlineLead ID ${lead.id}`
    );
  }
}

export const facebookWebhookController = new FacebookWebhookController();
