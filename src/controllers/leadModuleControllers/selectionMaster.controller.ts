import { Request, Response } from "express";
import {
  getAllCarcassTypes,
  getAllCarcasMaterials,
  getCarcassMaterialFinishes,
  getFastProductionTimelineRules,
  getAllHandleTypes,
  getAllShutterTypes,
  getAllShutterMaterials,
  getShutterMaterialFinishes,
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

export const fetchAllCarcasMaterials = async (req: Request, res: Response) => {
  try {
    const vendor_id = getVendorId(req, res);
    if (!vendor_id) return;

    const materials = await getAllCarcasMaterials(vendor_id);
    return res.status(200).json({ success: true, data: materials });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const fetchCarcassMaterialFinishes = async (
  req: Request,
  res: Response,
) => {
  try {
    const carcas_material_id = Number(req.params.carcas_material_id);
    if (!carcas_material_id) {
      return res.status(400).json({ error: "carcas_material_id is required" });
    }

    const finishes = await getCarcassMaterialFinishes(carcas_material_id);
    return res.status(200).json({ success: true, data: finishes });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const fetchAllShutterMaterials = async (req: Request, res: Response) => {
  try {
    const vendor_id = getVendorId(req, res);
    if (!vendor_id) return;

    const materials = await getAllShutterMaterials(vendor_id);
    return res.status(200).json({ success: true, data: materials });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const fetchShutterMaterialFinishes = async (
  req: Request,
  res: Response,
) => {
  try {
    const shutter_material_id = Number(req.params.shutter_material_id);
    if (!shutter_material_id) {
      return res
        .status(400)
        .json({ error: "shutter_material_id is required" });
    }

    const finishes = await getShutterMaterialFinishes(shutter_material_id);
    return res.status(200).json({ success: true, data: finishes });
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
