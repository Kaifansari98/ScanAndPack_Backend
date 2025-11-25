import { Request, Response } from "express";
import {
  ClientDocumentationDto,
  ClientDocumentationService,
  CustomMulterFile,
} from "../../../services/leadModuleServices/clientDocumentationStage/clientDocumentation.service";

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

      // ✅ helper ensures type correctness
      const tagFiles = (
        files: Express.Multer.File[],
        tag: "Type 11" | "Type 12"
      ) => files.map((f) => ({ ...f, docTypeTag: tag } as CustomMulterFile));

      const documents: CustomMulterFile[] = [
        ...tagFiles(pptFiles, "Type 11"),
        ...tagFiles(pythaFiles, "Type 12"),
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

  public static async get(req: Request, res: Response): Promise<void> {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const leadId = parseInt(req.params.leadId);

      if (!vendorId || !leadId) {
        res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
        return;
      }

      const data = await clientDocumentationService.getClientDocumentation(
        vendorId,
        leadId
      );

      res.status(200).json({
        success: true,
        message: "Client documentation fetched successfully",
        data,
      });
    } catch (error: any) {
      console.error("[ClientDocumentationController] Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  public static async addMoreDocuments(
    req: Request,
    res: Response
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

      // Tag files properly
      const tagFiles = (
        files: Express.Multer.File[],
        tag: "Type 11" | "Type 12"
      ) => files.map((f) => ({ ...f, docTypeTag: tag } as CustomMulterFile));

      const documents: CustomMulterFile[] = [
        ...tagFiles(pptFiles, "Type 11"),
        ...tagFiles(pythaFiles, "Type 12"),
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
    res: Response
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
          userId
        );

      const count = leads.length;

      return res.status(200).json({
        success: true,
        message: "Client Documentation leads fetched successfully",
        count,
        data: leads,
      });
    } catch (error: any) {
      console.error(
        "[ClientDocumentationController] getAllClientDocumentations Error:",
        error
      );
      return res.status(500).json({
        success: false,
        message: error.message || "Something went wrong",
      });
    }
  };
}
