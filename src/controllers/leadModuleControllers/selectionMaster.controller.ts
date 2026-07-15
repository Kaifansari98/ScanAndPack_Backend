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
  getAllCarcassLegs,
  getSkirtingCarcassLegs,
  getSkirtingCarcassLegsColors,
  getAllLightCarcasTypes,
  getLightCarcasUnits,
  getAllOtherAppliances,
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

export const fetchAllCarcassLegs = async (req: Request, res: Response) => {
  try {
    const vendor_id = getVendorId(req, res);
    if (!vendor_id) return;

    const legs = await getAllCarcassLegs(vendor_id);
    return res.status(200).json({ success: true, data: legs });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const fetchSkirtingCarcassLegs = async (
  req: Request,
  res: Response,
) => {
  try {
    const carcass_legs_id = Number(req.params.carcass_legs_id);
    if (!carcass_legs_id) {
      return res.status(400).json({ error: "carcass_legs_id is required" });
    }

    const skirtings = await getSkirtingCarcassLegs(carcass_legs_id);
    return res.status(200).json({ success: true, data: skirtings });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const fetchSkirtingCarcassLegsColors = async (
  req: Request,
  res: Response,
) => {
  try {
    const skirting_carcass_legs_id = Number(
      req.params.skirting_carcass_legs_id,
    );
    if (!skirting_carcass_legs_id) {
      return res
        .status(400)
        .json({ error: "skirting_carcass_legs_id is required" });
    }

    const colors = await getSkirtingCarcassLegsColors(
      skirting_carcass_legs_id,
    );
    return res.status(200).json({ success: true, data: colors });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const fetchAllLightCarcasTypes = async (req: Request, res: Response) => {
  try {
    const vendor_id = getVendorId(req, res);
    if (!vendor_id) return;

    const types = await getAllLightCarcasTypes(vendor_id);
    return res.status(200).json({ success: true, data: types });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const fetchLightCarcasUnits = async (req: Request, res: Response) => {
  try {
    const light_carcas_type_id = Number(req.params.light_carcas_type_id);
    if (!light_carcas_type_id) {
      return res
        .status(400)
        .json({ error: "light_carcas_type_id is required" });
    }

    const units = await getLightCarcasUnits(light_carcas_type_id);
    return res.status(200).json({ success: true, data: units });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const fetchAllOtherAppliances = async (req: Request, res: Response) => {
  try {
    const vendor_id = getVendorId(req, res);
    if (!vendor_id) return;

    const appliances = await getAllOtherAppliances(vendor_id);
    return res.status(200).json({ success: true, data: appliances });
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
