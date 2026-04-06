import { Request, Response } from "express";
import {
  addIssueType,
  fetchIssueTypes,
  removeIssueType,
  updateIssueType,
  updateIssueTypeStatus,
} from "../../services/leadModuleServices/issueType.service";

const getParam = (param: string | string[] | undefined): string | undefined =>
  Array.isArray(param) ? param[0] : param;

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
    const vendor_id = Number(getParam(req.params.vendor_id));

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
    const id = Number(getParam(req.params.id));
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

export const editIssueType = async (req: Request, res: Response) => {
  console.log("[CONTROLLER] editIssueType called", {
    params: req.params,
    body: req.body,
  });

  try {
    const id = Number(getParam(req.params.id));
    const name = String(req.body?.name ?? "").trim();

    if (!id) return res.status(400).json({ success: false, error: "id is required" });
    if (!name) return res.status(400).json({ success: false, error: "name is required" });

    const data = await updateIssueType(id, name);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    console.error("[CONTROLLER] Error editing issue type", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const toggleIssueTypeStatus = async (req: Request, res: Response) => {
  console.log("[CONTROLLER] toggleIssueTypeStatus called", {
    params: req.params,
    body: req.body,
  });

  try {
    const id = Number(getParam(req.params.id));
    const status = String(req.body?.status ?? "").toLowerCase();

    if (!id) return res.status(400).json({ success: false, error: "id is required" });
    if (!status) {
      return res.status(400).json({ success: false, error: "status is required" });
    }
    if (!["active", "inactive"].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "status must be either 'active' or 'inactive'",
      });
    }

    const data = await updateIssueTypeStatus(id, status as "active" | "inactive");
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    console.error("[CONTROLLER] Error updating issue type status", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};
