import { Request, Response } from "express";
import {
  ClientDocumentationDto,
  ClientDocumentationService,
  CustomMulterFile,
} from "../../../services/leadModuleServices/clientDocumentationStage/clientDocumentation.service";
import { uploadToWasabClientDocumentationFile } from "../../../utils/wasabiClient";
import fs from "node:fs/promises";

const clientDocumentationService = new ClientDocumentationService();

export class ClientDocumentationController {
  public static async create(req: Request, res: Response): Promise<void> {
    try {
      const { lead_id, account_id, vendor_id, created_by } = req.body;
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      if (!lead_id || !account_id || !vendor_id || !created_by) {
        res
          .status(400)
          .json({ success: false, message: "Missing required fields" });
        return;
      }

      const pptFiles = files?.client_documentations_ppt || [];
      const pythaFiles = files?.client_documentations_pytha || [];

      if (pptFiles.length === 0 && pythaFiles.length === 0) {
        res.status(400).json({
          success: false,
          message: "At least one PPT or Pytha file is required",
        });
        return;
      }

      const uploadTaggedFiles = async (
        docs: Express.Multer.File[],
        tag: "Type 11" | "Type 12",
      ): Promise<CustomMulterFile[]> => {
        const folder =
          tag === "Type 11"
            ? "client_documentations/client_documentations_ppt"
            : "client_documentations/client_documentations_pytha";

        const uploaded: CustomMulterFile[] = [];

        for (const doc of docs) {
          const sysName = await uploadToWasabClientDocumentationFile(
            doc.path,
            Number(vendor_id),
            Number(lead_id),
            doc.originalname,
            doc.mimetype,
            folder,
          );

          await fs.unlink(doc.path);

          uploaded.push({
            originalName: doc.originalname,
            sysName,
            docTypeTag: tag,
          });
        }

        return uploaded;
      };

      const documents: CustomMulterFile[] = [
        ...(await uploadTaggedFiles(pptFiles, "Type 11")),
        ...(await uploadTaggedFiles(pythaFiles, "Type 12")),
      ];

      const dto: ClientDocumentationDto = {
        lead_id: parseInt(lead_id),
        account_id: parseInt(account_id),
        vendor_id: parseInt(vendor_id),
        created_by: parseInt(created_by),
        documents,
      };

      const result =
        await clientDocumentationService.createClientDocumentationStage(dto);
      res.status(201).json({
        success: true,
        message: "Client documentation stage completed",
        data: result,
      });
    } catch (error: any) {
      console.error("[ClientDocumentationController] Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  public static async canMoveToOrderLoginController(
    req: Request,
    res: Response,
  ) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const result =
        await clientDocumentationService.canMoveToOrderLoginButtonEnabled(
          vendorId,
          leadId,
        );

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error("Order Login Eligibility Error:", error);

      return res.status(500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  }

  public static async addMoreDocuments(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const { lead_id, account_id, vendor_id, created_by } = req.body;
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      const pptFiles = files?.client_documentations_ppt || [];
      const pythaFiles = files?.client_documentations_pytha || [];

      if (!lead_id || !account_id || !vendor_id || !created_by) {
        res
          .status(400)
          .json({ success: false, message: "Missing required fields" });
        return;
      }

      if (pptFiles.length === 0 && pythaFiles.length === 0) {
        res.status(400).json({
          success: false,
          message: "At least one PPT or Pytha file is required",
        });
        return;
      }

      const uploadTaggedFiles = async (
        docs: Express.Multer.File[],
        tag: "Type 11" | "Type 12",
      ): Promise<CustomMulterFile[]> => {
        const folder =
          tag === "Type 11"
            ? "client_documentations/client_documentations_ppt"
            : "client_documentations/client_documentations_pytha";

        const uploaded: CustomMulterFile[] = [];

        for (const doc of docs) {
          const sysName = await uploadToWasabClientDocumentationFile(
            doc.path,
            Number(vendor_id),
            Number(lead_id),
            doc.originalname,
            doc.mimetype,
            folder,
          );

          await fs.unlink(doc.path);

          uploaded.push({
            originalName: doc.originalname,
            sysName,
            docTypeTag: tag,
          });
        }

        return uploaded;
      };

      const documents: CustomMulterFile[] = [
        ...(await uploadTaggedFiles(pptFiles, "Type 11")),
        ...(await uploadTaggedFiles(pythaFiles, "Type 12")),
      ];

      const dto: ClientDocumentationDto = {
        lead_id: parseInt(lead_id),
        account_id: parseInt(account_id),
        vendor_id: parseInt(vendor_id),
        created_by: parseInt(created_by),
        documents,
      };

      const result =
        await clientDocumentationService.addMoreClientDocumentation(dto);

      res.status(201).json({
        success: true,
        message: "Additional client documentation uploaded successfully",
        data: result,
      });
    } catch (error: any) {
      console.error("[ClientDocumentationController] Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  public static getAllClientDocumentations = async (
    req: Request,
    res: Response,
  ) => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const userId = parseInt(req.params.userId);

      if (!vendorId || !userId) {
        return res.status(400).json({
          success: false,
          message: "Vendor ID and User ID are required",
        });
      }

      const leads =
        await clientDocumentationService.getLeadsWithStatusClientDocumentation(
          vendorId,
          userId,
        );

      return res.status(200).json({
        success: true,
        message: "Client Documentation leads fetched successfully",
        count: leads.length,
        data: leads,
      });
    } catch (error: any) {
      console.error(
        "[ClientDocumentationController] getAllClientDocumentations Error:",
        error,
      );
      return res.status(500).json({
        success: false,
        message: error.message || "Something went wrong",
      });
    }
  };

  public static async get(req: Request, res: Response): Promise<void> {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const leadId = parseInt(req.params.leadId);
      const userId = Number(req.query.userId);

      if (!vendorId || !leadId || !userId) {
        res.status(400).json({
          success: false,
          message: "vendorId, leadId and userId are required",
        });
        return;
      }

      const data = await clientDocumentationService.getClientDocumentation(
        vendorId,
        leadId,
        userId,
      );

      res.status(200).json({
        success: true,
        message: "Client documentation fetched successfully",
        data,
      });
    } catch (error: any) {
      console.error("[ClientDocumentationController:get]", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }
}
