import { Request, Response } from "express";
import {
  addProcessBrief,
  getAllProcessBriefs,
  getLeadProcessBriefs,
  saveLeadProcessBriefs,
  ProcessBriefInput,
  saveProcessBriefMachineMappings,
  getProcessBriefMachineMappings,
  updateProcessBrief,
  toggleProcessBriefStatus,
} from "../../services/leadModuleServices/processBrief.service";

export const createProcessBrief = async (req: Request, res: Response) => {
  console.log("[CONTROLLER] createProcessBrief called", { body: req.body });

  try {
    const { vendor_id, name, created_by, is_active } = req.body as ProcessBriefInput;

    if (!vendor_id || !name || !created_by) {
      console.warn("[CONTROLLER] Missing required fields", { vendor_id, name, created_by });
      return res.status(400).json({ error: "vendor_id, name, and created_by are required" });
    }

    const processBrief = await addProcessBrief({
      vendor_id: Number(vendor_id),
      name: String(name),
      created_by: Number(created_by),
      is_active,
    });

    console.log("[CONTROLLER] ProcessBrief created successfully", processBrief);
    return res.status(201).json({ success: true, data: processBrief });
  } catch (error: any) {
    console.error("[CONTROLLER] Error creating process brief", { error: error.message });
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const fetchAllProcessBriefs = async (req: Request, res: Response) => {
  console.log("[CONTROLLER] fetchAllProcessBriefs called", { params: req.params });

  try {
    const vendor_id = Number(req.params.vendor_id);
    if (!vendor_id) {
      return res.status(400).json({ error: "vendor_id is required" });
    }

    const briefs = await getAllProcessBriefs(vendor_id);
    return res.status(200).json({ success: true, data: briefs });
  } catch (error: any) {
    console.error("[CONTROLLER] Error fetching process briefs", { error: error.message });
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const saveLeadProcessBriefsHandler = async (req: Request, res: Response) => {
  try {
    const { lead_id, vendor_id, mappings, process_brief_ids, created_by } = req.body;
    if (!lead_id || !vendor_id) {
      return res.status(400).json({ error: "lead_id and vendor_id are required" });
    }

    const userId = Number((req as any).user?.id || created_by || 1);

    const savedMappings = await saveLeadProcessBriefs({
      lead_id: Number(lead_id),
      vendor_id: Number(vendor_id),
      mappings: Array.isArray(mappings)
        ? mappings.map((m: any) => {
            const rawTypeId = m.b2b_requirement_type_id ?? m.product_type_id;
            const parsedTypeId = rawTypeId !== undefined && rawTypeId !== null && !isNaN(Number(rawTypeId)) ? Number(rawTypeId) : undefined;
            return {
              b2b_requirement_type_id: parsedTypeId,
              product_type_id: parsedTypeId,
              process_brief_id: Number(m.process_brief_id),
            };
          })
        : undefined,
      process_brief_ids: Array.isArray(process_brief_ids) ? process_brief_ids.map(Number).filter((id) => !isNaN(id)) : undefined,
      created_by: isNaN(userId) ? 1 : userId,
    });

    return res.status(200).json({ success: true, data: savedMappings });
  } catch (error: any) {
    console.error("[CONTROLLER] Error saving lead process briefs", { error: error.message });
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const fetchLeadProcessBriefsHandler = async (req: Request, res: Response) => {
  try {
    const lead_id = Number(req.params.lead_id);
    const vendor_id = Number(req.query.vendor_id);
    if (!lead_id || !vendor_id) {
      return res.status(400).json({ error: "lead_id and vendor_id are required" });
    }

    const mappings = await getLeadProcessBriefs(lead_id, vendor_id);
    return res.status(200).json({ success: true, data: mappings });
  } catch (error: any) {
    console.error("[CONTROLLER] Error fetching lead process briefs", { error: error.message });
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const saveProcessBriefMachineMappingsHandler = async (req: Request, res: Response) => {
  try {
    const { process_brief_id, vendor_id, machine_ids, machine_type_ids, created_by } = req.body;

    if (!process_brief_id || !vendor_id) {
      return res.status(400).json({ error: "process_brief_id and vendor_id are required" });
    }

    const userId = Number((req as any).user?.id || created_by || 1);

    const savedMappings = await saveProcessBriefMachineMappings({
      process_brief_id: Number(process_brief_id),
      vendor_id: Number(vendor_id),
      machine_ids: Array.isArray(machine_ids) ? machine_ids.map(Number).filter((id) => !isNaN(id)) : [],
      machine_type_ids: Array.isArray(machine_type_ids) ? machine_type_ids.map(Number).filter((id) => !isNaN(id)) : [],
      created_by: isNaN(userId) ? 1 : userId,
    });

    return res.status(200).json({ success: true, data: savedMappings });
  } catch (error: any) {
    console.error("[CONTROLLER] Error saving process brief machine mappings", { error: error.message });
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const fetchProcessBriefMachineMappingsHandler = async (req: Request, res: Response) => {
  try {
    const process_brief_id = Number(req.params.process_brief_id);
    const vendor_id = Number(req.query.vendor_id);

    if (!process_brief_id || !vendor_id) {
      return res.status(400).json({ error: "process_brief_id and vendor_id are required" });
    }

    const mappings = await getProcessBriefMachineMappings(process_brief_id, vendor_id);
    return res.status(200).json({ success: true, data: mappings });
  } catch (error: any) {
    console.error("[CONTROLLER] Error fetching process brief machine mappings", { error: error.message });
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updateProcessBriefHandler = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { name } = req.body;

    if (!id || !name) {
      return res.status(400).json({ error: "id and name are required" });
    }

    const updatedBrief = await updateProcessBrief(id, name);
    return res.status(200).json({ success: true, data: updatedBrief });
  } catch (error: any) {
    console.error("[CONTROLLER] Error updating process brief", { error: error.message });
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const toggleProcessBriefStatusHandler = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { is_active } = req.body;

    if (!id || is_active === undefined) {
      return res.status(400).json({ error: "id and is_active are required" });
    }

    const updatedBrief = await toggleProcessBriefStatus(id, Boolean(is_active));
    return res.status(200).json({ success: true, data: updatedBrief });
  } catch (error: any) {
    console.error("[CONTROLLER] Error toggling process brief status", { error: error.message });
    return res.status(500).json({ success: false, error: error.message });
  }
};


