import { Request, Response } from "express";
import fs from "node:fs/promises";
import { ApiResponse } from "../../../utils/apiResponse";
import { uploadToWasabiServicingAmcContractDocumentFile } from "../../../utils/wasabiClient";
import { ServicingService } from "../../../services/installation/servicing/Servicing.service";

const service = new ServicingService();

export class ServicingController {
  async rescheduleService(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);
      const serviceId = Number(req.params.serviceId);
      const updatedBy = Number(req.body.updated_by);

      if (!vendorId || !leadId || !serviceId || !updatedBy) {
        return res.status(400).json(
          ApiResponse.error(
            "vendorId, leadId, serviceId, and updated_by are required",
            400,
          ),
        );
      }

      const result = await service.rescheduleService(
        vendorId,
        leadId,
        serviceId,
        updatedBy,
      );

      return res
        .status(200)
        .json(ApiResponse.success(result, "Service rescheduled successfully"));
    } catch (error: any) {
      return res.status(error.statusCode || 500).json(
        ApiResponse.error(
          error.message || "Internal server error while rescheduling service",
          error.statusCode || 500,
        ),
      );
    }
  }

  async getServiceSchedules(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);

      if (!vendorId || !leadId) {
        return res
          .status(400)
          .json(ApiResponse.error("vendorId and leadId are required", 400));
      }

      const result = await service.getServiceSchedules(vendorId, leadId);

      return res
        .status(200)
        .json(ApiResponse.success(result, "Service schedules fetched successfully"));
    } catch (error: any) {
      return res.status(error.statusCode || 500).json(
        ApiResponse.error(
          error.message || "Internal server error while fetching service schedules",
          error.statusCode || 500,
        ),
      );
    }
  }

  async uploadAmcContractDocuments(req: Request, res: Response) {
    try {
      const vendorId = Number(req.body.vendorId);
      const leadId = Number(req.body.leadId);
      const accountId = Number(req.body.accountId);
      const userId = Number(req.body.userId);

      if (!vendorId || !leadId || !accountId || !userId) {
        return res.status(400).json(
          ApiResponse.error(
            "vendorId, leadId, accountId, and userId are required",
            400,
          ),
        );
      }

      const files = req.files as {
        [fieldname: string]: Express.Multer.File[];
      };

      const amcDocs = files?.amc_contract_documents ?? [];

      if (amcDocs.length === 0) {
        return res.status(400).json(
          ApiResponse.error("At least one AMC contract document is required", 400),
        );
      }

      const uploaded = [];

      for (const doc of amcDocs) {
        const sysName = await uploadToWasabiServicingAmcContractDocumentFile(
          doc.path,
          vendorId,
          leadId,
          doc.originalname,
          doc.mimetype,
        );

        await fs.unlink(doc.path);

        uploaded.push({
          originalName: doc.originalname,
          sysName,
        });
      }

      const result = await service.uploadAmcContractDocuments(
        vendorId,
        leadId,
        accountId,
        userId,
        uploaded,
      );

      return res
        .status(200)
        .json(ApiResponse.success(result, "AMC contract documents uploaded successfully"));
    } catch (error: any) {
      return res.status(error.statusCode || 500).json(
        ApiResponse.error(
          error.message || "Internal server error while uploading AMC documents",
          error.statusCode || 500,
        ),
      );
    }
  }

  async getAmcContractDocuments(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);

      if (!vendorId || !leadId) {
        return res
          .status(400)
          .json(ApiResponse.error("vendorId and leadId are required", 400));
      }

      const result = await service.getAmcContractDocuments(vendorId, leadId);

      return res
        .status(200)
        .json(ApiResponse.success(result, "AMC contract documents fetched successfully"));
    } catch (error: any) {
      return res.status(error.statusCode || 500).json(
        ApiResponse.error(
          error.message || "Internal server error while fetching AMC documents",
          error.statusCode || 500,
        ),
      );
    }
  }
}
