import { Request, Response } from "express";
import {
  getOrSeedRequirementDocumentTypes,
  uploadRequirementDocument,
  getRequirementDocuments,
  deleteRequirementDocument,
} from "../../services/leadModuleServices/leadRequirementDocument.service";

export const getRequirementDocumentTypesHandler = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.query.vendor_id);
    if (!vendor_id) {
      return res.status(400).json({ success: false, message: "vendor_id is required" });
    }

    const types = await getOrSeedRequirementDocumentTypes(vendor_id);
    return res.status(200).json({ success: true, data: types });
  } catch (error: any) {
    console.error("[CONTROLLER ERROR] getRequirementDocumentTypesHandler:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to fetch document types" });
  }
};

export const uploadRequirementDocumentHandler = async (req: Request, res: Response) => {
  try {
    const { lead_id, vendor_id, product_type_id, b2b_requirement_type_id, doc_type_id, stage, created_by } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const document = await uploadRequirementDocument({
      lead_id: Number(lead_id),
      vendor_id: Number(vendor_id),
      product_type_id: product_type_id ? Number(product_type_id) : undefined,
      b2b_requirement_type_id: b2b_requirement_type_id ? Number(b2b_requirement_type_id) : undefined,
      doc_type_id: doc_type_id ? Number(doc_type_id) : undefined,
      stage: stage ? String(stage) : "Designing",
      created_by: Number(created_by || 1),
      file,
    });

    return res.status(201).json({ success: true, data: document });
  } catch (error: any) {
    console.error("[CONTROLLER ERROR] uploadRequirementDocumentHandler:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to upload document" });
  }
};

export const getRequirementDocumentsHandler = async (req: Request, res: Response) => {
  try {
    const lead_id = Number(req.query.lead_id);
    const vendor_id = Number(req.query.vendor_id);
    const product_type_id = req.query.product_type_id ? Number(req.query.product_type_id) : undefined;
    const b2b_requirement_type_id = req.query.b2b_requirement_type_id ? Number(req.query.b2b_requirement_type_id) : undefined;
    const stage = req.query.stage ? String(req.query.stage) : undefined;

    if (!lead_id || !vendor_id) {
      return res.status(400).json({ success: false, message: "lead_id and vendor_id are required" });
    }

    const documents = await getRequirementDocuments(
      lead_id,
      vendor_id,
      product_type_id,
      b2b_requirement_type_id,
      stage
    );
    return res.status(200).json({ success: true, data: documents });
  } catch (error: any) {
    console.error("[CONTROLLER ERROR] getRequirementDocumentsHandler:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to fetch documents" });
  }
};

export const deleteRequirementDocumentHandler = async (req: Request, res: Response) => {
  try {
    const document_id = Number(req.params.id);
    const deleted_by = Number(req.body.deleted_by || req.query.deleted_by || 1);

    if (!document_id) {
      return res.status(400).json({ success: false, message: "document_id is required" });
    }

    await deleteRequirementDocument(document_id, deleted_by);
    return res.status(200).json({ success: true, message: "Document deleted successfully" });
  } catch (error: any) {
    console.error("[CONTROLLER ERROR] deleteRequirementDocumentHandler:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to delete document" });
  }
};
