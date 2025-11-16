import { Request, Response } from "express";
import {
  addIssueType,
  fetchIssueTypes,
  removeIssueType,
} from "../../services/leadModuleServices/issueType.service";

/* ----------------------------- Issue Type Master ----------------------------- */

// CREATE Issue Type
export const createIssueType = async (req: Request, res: Response) => {
  console.log("[CONTROLLER] createIssueType called", { body: req.body });

  try {
    const { vendor_id, name, created_by } = req.body;

    if (!vendor_id || !name || !created_by) {
      return res.status(400).json({
        success: false,
        error: "vendor_id, name, and created_by are required",
      });
    }

    const data = await addIssueType({ vendor_id, name, created_by });
    return res.status(201).json({ success: true, data });
  } catch (error: any) {
    console.error("[CONTROLLER] Error creating issue type", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// GET All Issue Types by Vendor
export const getIssueTypes = async (req: Request, res: Response) => {
  console.log("[CONTROLLER] getIssueTypes called", { params: req.params });

  try {
    const vendor_id = parseInt(req.params.vendor_id);

    if (!vendor_id) {
      return res.status(400).json({ success: false, error: "vendor_id is required" });
    }

    const list = await fetchIssueTypes(vendor_id);
    return res.status(200).json({ success: true, data: list });
  } catch (error: any) {
    console.error("[CONTROLLER] Error fetching issue types", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE Issue Type
export const deleteIssueType = async (req: Request, res: Response) => {
  console.log("[CONTROLLER] deleteIssueType called", { params: req.params });

  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: "id is required" });

    await removeIssueType(id);
    return res
      .status(200)
      .json({ success: true, message: "Issue type deleted successfully" });
  } catch (error: any) {
    console.error("[CONTROLLER] Error deleting issue type", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};
