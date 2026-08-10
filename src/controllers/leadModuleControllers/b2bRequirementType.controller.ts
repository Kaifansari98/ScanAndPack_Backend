import { Request, Response } from "express";
import {
  getB2BRequirementTypes,
  createB2BRequirementType,
  updateB2BRequirementType,
  deleteB2BRequirementType,
  saveLeadB2BRequirementMappings,
  getLeadB2BRequirementMappings,
} from "../../services/leadModuleServices/b2bRequirementType.service";

export const getB2BRequirementTypesHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const vendor_id = Number(req.query.vendor_id || req.params.vendor_id || (req as any).user?.vendor_id);
    if (!vendor_id) {
      return res.status(400).json({ success: false, message: "vendor_id is required" });
    }

    const types = await getB2BRequirementTypes(vendor_id);
    return res.status(200).json({ success: true, data: types });
  } catch (error: any) {
    console.error("[ERROR] getB2BRequirementTypesHandler:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const createB2BRequirementTypeHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const vendor_id = Number(req.body.vendor_id || (req as any).user?.vendor_id);
    const { type } = req.body;

    if (!vendor_id || !type) {
      return res.status(400).json({ success: false, message: "vendor_id and type are required" });
    }

    const created = await createB2BRequirementType({ vendor_id, type });
    return res.status(201).json({ success: true, data: created });
  } catch (error: any) {
    console.error("[ERROR] createB2BRequirementTypeHandler:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateB2BRequirementTypeHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const id = Number(req.params.id);
    const vendor_id = Number(req.body.vendor_id || (req as any).user?.vendor_id);
    const { type, status } = req.body;

    if (!id || !vendor_id) {
      return res.status(400).json({ success: false, message: "id and vendor_id are required" });
    }

    const updated = await updateB2BRequirementType(id, { vendor_id, type, status });
    return res.status(200).json({ success: true, data: updated });
  } catch (error: any) {
    console.error("[ERROR] updateB2BRequirementTypeHandler:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteB2BRequirementTypeHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const id = Number(req.params.id);
    const vendor_id = Number(req.query.vendor_id || req.body.vendor_id || (req as any).user?.vendor_id);

    if (!id || !vendor_id) {
      return res.status(400).json({ success: false, message: "id and vendor_id are required" });
    }

    await deleteB2BRequirementType(id, vendor_id);
    return res.status(200).json({ success: true, message: "B2B requirement type deleted" });
  } catch (error: any) {
    console.error("[ERROR] deleteB2BRequirementTypeHandler:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const saveLeadB2BRequirementMappingsHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const vendor_id = Number(req.body.vendor_id || (req as any).user?.vendor_id);
    const lead_id = Number(req.body.lead_id);
    const created_by = Number((req as any).user?.id || req.body.created_by || 1);
    const { b2b_requirement_type_ids, approximate_budget, project_status } = req.body;

    if (!lead_id || !vendor_id) {
      return res.status(400).json({ success: false, message: "lead_id and vendor_id are required" });
    }

    const saved = await saveLeadB2BRequirementMappings({
      lead_id,
      vendor_id,
      b2b_requirement_type_ids: b2b_requirement_type_ids || [],
      created_by,
      approximate_budget,
      project_status,
    });

    return res.status(200).json({ success: true, data: saved });
  } catch (error: any) {
    console.error("[ERROR] saveLeadB2BRequirementMappingsHandler:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getLeadB2BRequirementMappingsHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const lead_id = Number(req.params.lead_id);
    const vendor_id = Number(req.query.vendor_id || (req as any).user?.vendor_id);

    if (!lead_id || !vendor_id) {
      return res.status(400).json({ success: false, message: "lead_id and vendor_id are required" });
    }

    const mappings = await getLeadB2BRequirementMappings(lead_id, vendor_id);
    return res.status(200).json({ success: true, data: mappings });
  } catch (error: any) {
    console.error("[ERROR] getLeadB2BRequirementMappingsHandler:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};
