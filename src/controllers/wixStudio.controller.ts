import { Request, Response } from "express";
import { wixStudioService, ProcessWixLeadResult } from "../services/wixStudio.service";
import logger from "../utils/logger";

export class WixStudioController {
  /**
   * Flow A: POST /api/wix-studio/data?vendor_token=<token>
   * Mandatory vendor_token query parameter (or header/body). Validates vendor and feature flag,
   * captures raw Wix Studio webhook payload, saves to DB with vendor_id,
   * then processes into Lead Pool via common service.
   */
  captureData = async (req: Request, res: Response): Promise<Response> => {
    try {
      // 1. Extract vendor_token strictly (vendor_id is NOT accepted)
      const rawVendorToken =
        req.query.vendor_token ||
        req.query.vendorToken ||
        req.headers["x-vendor-token"] ||
        req.headers["vendor_token"] ||
        req.headers["vendor-token"] ||
        req.body?.vendor_token ||
        req.body?.vendorToken;

      const vendorToken =
        typeof rawVendorToken === "string"
          ? rawVendorToken.trim()
          : Array.isArray(rawVendorToken)
          ? String(rawVendorToken[0]).trim()
          : "";

      if (!vendorToken) {
        return res.status(400).json({
          success: false,
          message: "vendor_token query parameter is required (e.g. /api/wix-studio/data?vendor_token=<VENDOR_TOKEN>)",
        });
      }

      const vendorCheck = await wixStudioService.validateVendorToken(vendorToken);
      if (!vendorCheck.valid) {
        return res.status(vendorCheck.statusCode || 401).json({
          success: false,
          message: vendorCheck.error,
        });
      }

      const vendorId = vendorCheck.vendor.id;

      let payload = req.body;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
          req.body = payload;
        } catch {
          // If parsing fails, proceed with raw payload
        }
      }

      // 2. Save raw payload into wix_studio_data_capture table with vendor_id
      const record = await wixStudioService.captureData(payload, vendorId);

      // 3. Process into Lead Pool using the ONE common processing service for this vendor
      let leadPoolResult: ProcessWixLeadResult = { leadCreated: false };
      try {
        leadPoolResult = await wixStudioService.processWixPayload(record.payload, {
          req,
          captureRecordId: record.id,
          explicitVendorId: vendorId,
        });
      } catch (leadError: any) {
        logger.error("[WIX STUDIO] Error creating lead in Lead Pool:", leadError);
        leadPoolResult = {
          leadCreated: false,
          reason: leadError.message || "Failed to create lead in Lead Pool",
        };
      }

      // 4. Return response with capture ID, vendor info, and Lead Pool status
      return res.status(200).json({
        success: true,
        message: leadPoolResult.leadCreated
          ? (leadPoolResult.isNew
              ? `Wix Studio data captured and lead added to Lead Pool successfully for vendor '${vendorCheck.vendor.vendor_name}'`
              : `Wix Studio data captured and existing lead updated in Lead Pool successfully for vendor '${vendorCheck.vendor.vendor_name}'`)
          : `Wix Studio data captured successfully (${leadPoolResult.reason || "Lead creation skipped"})`,
        data: {
          id: record.id,
          vendor_id: vendorId,
          vendor_token: vendorToken,
          vendor_name: vendorCheck.vendor.vendor_name,
          lead_created: leadPoolResult.leadCreated,
          lead_id: leadPoolResult.lead?.id || null,
          lead_code: leadPoolResult.lead?.lead_code || null,
          is_new: leadPoolResult.isNew,
          missing_fields: leadPoolResult.missingFields,
          reason: leadPoolResult.reason,
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

  /**
   * Flow B: POST /api/wix-studio/data/:id/process
   * Processes a specific existing record from wix_studio_data_capture by ID.
   * Uses stored vendor_id or optional explicit vendor_token parameter.
   */
  processCapturedRecord = async (req: Request, res: Response): Promise<Response> => {
    try {
      const rawId = req.params.id;
      const captureId = Number(rawId);

      if (!rawId || isNaN(captureId) || captureId <= 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid capture record ID: '${rawId}'. ID must be a positive integer.`,
        });
      }

      // Optional explicit vendor_token override (vendor_id is NOT accepted)
      const rawVendorToken =
        req.query.vendor_token ||
        req.query.vendorToken ||
        req.headers["x-vendor-token"] ||
        req.headers["vendor_token"] ||
        req.headers["vendor-token"];
      const vendorToken =
        typeof rawVendorToken === "string"
          ? rawVendorToken.trim()
          : Array.isArray(rawVendorToken)
          ? String(rawVendorToken[0]).trim()
          : "";

      let explicitVendorId: number | undefined;
      if (vendorToken) {
        const tokenCheck = await wixStudioService.validateVendorToken(vendorToken);
        if (!tokenCheck.valid) {
          return res.status(tokenCheck.statusCode || 401).json({
            success: false,
            message: tokenCheck.error,
          });
        }
        explicitVendorId = tokenCheck.vendor.id;
      }

      // Process the existing record by ID
      const result = await wixStudioService.processCapturedRecordById(captureId, req, explicitVendorId);

      if (!result.found) {
        return res.status(404).json({
          success: false,
          message: `Wix Studio capture record with ID ${captureId} not found.`,
        });
      }

      if (!result.leadCreated) {
        return res.status(200).json({
          success: false,
          message: `Wix Studio record ID ${captureId} processed, but Lead Pool lead creation was skipped (${result.reason || "Validation or vendor criteria not met"})`,
          data: {
            capture_id: captureId,
            lead_created: false,
            missing_fields: result.missingFields,
            reason: result.reason,
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: result.isNew
          ? `Lead successfully created in Lead Pool from Wix Studio record ID ${captureId}`
          : `Existing lead updated in Lead Pool from Wix Studio record ID ${captureId} (Idempotent)`,
        data: {
          capture_id: captureId,
          lead_created: true,
          lead_id: result.lead?.id || null,
          lead_code: result.lead?.lead_code || null,
          is_new: result.isNew,
          lead: {
            id: result.lead?.id,
            lead_code: result.lead?.lead_code,
            leads_name: result.lead?.leads_name,
            contact: result.lead?.contact,
            city: result.lead?.city,
            source: result.lead?.source,
            remark: result.lead?.remark,
            product_types: result.lead?.product_types,
            assign_to: result.lead?.assign_to,
          },
        },
      });
    } catch (error: any) {
      logger.error(`[WIX STUDIO] Error processing capture record ${req.params.id}:`, error);
      return res.status(500).json({
        success: false,
        message: error.message || `Failed to process Wix Studio capture record ${req.params.id}`,
      });
    }
  };

  /**
   * Flow C: POST or GET /api/wix-studio/data/process?vendor_token=<token>
   * Mandatory vendor_token query parameter. Validates vendor and feature flag.
   * Finds the oldest unprocessed wix_studio_data_capture record and processes it
   * into Lead Pool for this vendor.
   * Already processed records are prevented from creating duplicate leads.
   */
  processUnprocessedRecords = async (req: Request, res: Response): Promise<Response> => {
    try {
      // 1. Mandatory vendor_token check (accepts only vendor_token; vendor_id is NOT accepted)
      const rawVendorToken =
        req.query.vendor_token ||
        req.query.vendorToken ||
        req.headers["x-vendor-token"] ||
        req.headers["vendor_token"] ||
        req.headers["vendor-token"] ||
        req.body?.vendor_token ||
        req.body?.vendorToken;

      const vendorToken =
        typeof rawVendorToken === "string"
          ? rawVendorToken.trim()
          : Array.isArray(rawVendorToken)
          ? String(rawVendorToken[0]).trim()
          : "";

      if (!vendorToken) {
        return res.status(400).json({
          success: false,
          message: "vendor_token query parameter is required (e.g. /api/wix-studio/data/process?vendor_token=<VENDOR_TOKEN>)",
        });
      }

      // Validate vendor token strictly
      const vendorCheck = await wixStudioService.validateVendorToken(vendorToken);
      if (!vendorCheck.valid) {
        return res.status(vendorCheck.statusCode || 401).json({
          success: false,
          message: vendorCheck.error,
        });
      }

      const vendorId = vendorCheck.vendor.id;

      // 2. Process the oldest unprocessed record for this vendor
      const result = await wixStudioService.processOldestUnprocessedRecord(vendorId, req);

      if (!result.processed) {
        return res.status(200).json({
          success: true,
          message: `No pending unprocessed Wix Studio records found for vendor '${vendorCheck.vendor.vendor_name}'`,
          data: null,
        });
      }

      return res.status(200).json({
        success: true,
        message: result.isNew
          ? `Oldest unprocessed Wix Studio record ID ${result.recordId} successfully processed into Lead Pool for vendor '${vendorCheck.vendor.vendor_name}'`
          : `Existing lead updated in Lead Pool from Wix Studio record ID ${result.recordId} for vendor '${vendorCheck.vendor.vendor_name}'`,
        data: {
          capture_id: result.recordId,
          vendor_id: vendorId,
          vendor_token: vendorToken,
          vendor_name: vendorCheck.vendor.vendor_name,
          lead_created: result.leadCreated,
          lead_id: result.leadId || null,
          lead_code: result.leadCode || null,
          is_new: result.isNew,
          lead: {
            id: result.lead?.id,
            lead_code: result.lead?.lead_code,
            leads_name: result.lead?.leads_name,
            contact: result.lead?.contact,
            city: result.lead?.city,
            source: result.lead?.source,
            remark: result.lead?.remark,
            product_types: result.lead?.product_types,
            assign_to: result.lead?.assign_to,
          },
        },
      });
    } catch (error: any) {
      logger.error("[WIX STUDIO] Error in processing oldest unprocessed record:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to process oldest unprocessed Wix Studio record",
      });
    }
  };
}

export const wixStudioController = new WixStudioController();

