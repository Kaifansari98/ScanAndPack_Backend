import { Request, Response } from "express";
import {
  getAllCarcassTypes,
  getFastProductionTimelineRules,
  getAllHandleTypes,
  getAllShutterTypes,
} from "../../services/leadModuleServices/selectionMaster.service";

const getVendorId = (req: Request, res: Response): number | null => {
  const vendor_id = Number(req.params.vendor_id);
  if (!vendor_id) {
    res.status(400).json({ error: "vendor_id is required" });
    return null;
  }
  return vendor_id;
};

export const fetchAllCarcassTypes = async (req: Request, res: Response) => {
  try {
    const vendor_id = getVendorId(req, res);
    if (!vendor_id) return;

    const types = await getAllCarcassTypes(vendor_id);
    return res.status(200).json({ success: true, data: types });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const fetchAllShutterTypes = async (req: Request, res: Response) => {
  try {
    const vendor_id = getVendorId(req, res);
    if (!vendor_id) return;

    const types = await getAllShutterTypes(vendor_id);
    return res.status(200).json({ success: true, data: types });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const fetchAllHandleTypes = async (req: Request, res: Response) => {
  try {
    const vendor_id = getVendorId(req, res);
    if (!vendor_id) return;

    const types = await getAllHandleTypes(vendor_id);
    return res.status(200).json({ success: true, data: types });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const fetchFastProductionTimelineRules = async (
  req: Request,
  res: Response,
) => {
  try {
    const vendor_id = getVendorId(req, res);
    if (!vendor_id) return;

    const rules = await getFastProductionTimelineRules(vendor_id);
    return res.status(200).json({ success: true, data: rules });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
