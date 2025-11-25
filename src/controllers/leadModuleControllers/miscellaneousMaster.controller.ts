import { Request, Response } from "express";
import {
  addMiscTeam,
  addMiscType,
  fetchMiscTeams,
  fetchMiscTypes,
  removeMiscTeam,
  removeMiscType,
} from "../../services/leadModuleServices/miscellaneousMaster.service";

/* ------------------------ Miscellaneous Type Master ------------------------ */

// CREATE Type
export const createMiscType = async (req: Request, res: Response) => {
  console.log("[CONTROLLER] createMiscType called", { body: req.body });

  try {
    const { vendor_id, name, created_by } = req.body;

    if (!vendor_id || !name || !created_by) {
      console.warn("[CONTROLLER] Missing fields", {
        vendor_id,
        name,
        created_by,
      });
      return res.status(400).json({
        success: false,
        error: "vendor_id, name, and created_by are required",
      });
    }

    const data = await addMiscType({ vendor_id, name, created_by });
    return res.status(201).json({ success: true, data });
  } catch (error: any) {
    console.error("[CONTROLLER] Error creating misc type", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// GET All Types
export const getMiscTypes = async (req: Request, res: Response) => {
  console.log("[CONTROLLER] getMiscTypes called", { params: req.params });

  try {
    const vendor_id = parseInt(req.params.vendor_id);
    if (!vendor_id) {
      return res.status(400).json({ error: "vendor_id is required" });
    }

    const list = await fetchMiscTypes(vendor_id);
    return res.status(200).json({ success: true, data: list });
  } catch (error: any) {
    console.error("[CONTROLLER] Error fetching misc types", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE Type
export const deleteMiscType = async (req: Request, res: Response) => {
  console.log("[CONTROLLER] deleteMiscType called", { params: req.params });

  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: "id is required" });

    await removeMiscType(id);
    return res
      .status(200)
      .json({ success: true, message: "Type deleted successfully" });
  } catch (error: any) {
    console.error("[CONTROLLER] Error deleting misc type", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/* -------------------------- Miscellaneous Team Master -------------------------- */

// CREATE Team
export const createMiscTeam = async (req: Request, res: Response) => {
  console.log("[CONTROLLER] createMiscTeam called", { body: req.body });

  try {
    const { vendor_id, name, created_by } = req.body;

    if (!vendor_id || !name || !created_by) {
      return res.status(400).json({
        success: false,
        error: "vendor_id, name, and created_by are required",
      });
    }

    const data = await addMiscTeam({ vendor_id, name, created_by });
    return res.status(201).json({ success: true, data });
  } catch (error: any) {
    console.error("[CONTROLLER] Error creating misc team", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// GET All Teams
export const getMiscTeams = async (req: Request, res: Response) => {
  console.log("[CONTROLLER] getMiscTeams called", { params: req.params });

  try {
    const vendor_id = parseInt(req.params.vendor_id);
    if (!vendor_id)
      return res.status(400).json({ error: "vendor_id is required" });

    const list = await fetchMiscTeams(vendor_id);
    return res.status(200).json({ success: true, data: list });
  } catch (error: any) {
    console.error("[CONTROLLER] Error fetching misc teams", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE Team
export const deleteMiscTeam = async (req: Request, res: Response) => {
  console.log("[CONTROLLER] deleteMiscTeam called", { params: req.params });

  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: "id is required" });

    await removeMiscTeam(id);
    return res
      .status(200)
      .json({ success: true, message: "Team deleted successfully" });
  } catch (error: any) {
    console.error("[CONTROLLER] Error deleting misc team", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};
