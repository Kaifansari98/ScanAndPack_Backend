import { Request, Response } from "express";
import {
  getAllCarcassTypes,
  createCarcassType,
  getAllCarcasMaterials,
  createCarcasMaterial,
  getCarcassMaterialFinishes,
  createCarcassMaterialFinish,
  getAllCarcassMaterialFinishesForVendor,
  bulkUploadCarcassMaterialFinishes,
  getFastProductionTimelineRules,
  getAllHandleTypes,
  createHandleType,
  getAllShutterTypes,
  createShutterType,
  createShutterSubType,
  getAllShutterMaterials,
  createShutterMaterial,
  getShutterMaterialFinishes,
  createShutterMaterialFinish,
  getAllShutterMaterialFinishesForVendor,
  bulkUploadShutterMaterialFinishes,
  getAllCarcassLegs,
  createCarcassLegs,
  getSkirtingCarcassLegs,
  createSkirtingCarcassLegs,
  getAllSkirtingCarcassLegsForVendor,
  getSkirtingCarcassLegsColors,
  createSkirtingCarcassLegsColor,
  getAllSkirtingCarcassLegsColorsForVendor,
  bulkUploadSkirtingCarcassLegsColors,
  getAllLightCarcasTypes,
  createLightCarcasType,
  getLightCarcasUnits,
  createLightCarcasUnit,
  getAllLightCarcasUnitsForVendor,
  bulkUploadLightCarcasUnits,
  getAllOtherAppliances,
  createOtherAppliances,
  bulkUploadOtherAppliances,
  getOtherAppliancesReport,
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
    const onlyFastProduction =
      String(req.query.only_fast_production ?? "").toLowerCase() === "true";

    const types = await getAllCarcassTypes(vendor_id, onlyFastProduction);
    return res.status(200).json({ success: true, data: types });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const addCarcassType = async (req: Request, res: Response) => {
  try {
    const { vendor_id, name } = req.body;

    if (!vendor_id || !name) {
      return res
        .status(400)
        .json({ success: false, error: "vendor_id and name are required" });
    }

    const type = await createCarcassType(Number(vendor_id), name);
    return res.status(201).json({ success: true, data: type });
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

export const addShutterType = async (req: Request, res: Response) => {
  try {
    const { vendor_id, name } = req.body;

    if (!vendor_id || !name) {
      return res
        .status(400)
        .json({ success: false, error: "vendor_id and name are required" });
    }

    const type = await createShutterType(Number(vendor_id), name);
    return res.status(201).json({ success: true, data: type });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const addShutterSubType = async (req: Request, res: Response) => {
  try {
    const { shutter_type_id, name } = req.body;

    if (!shutter_type_id || !name) {
      return res.status(400).json({
        success: false,
        error: "shutter_type_id and name are required",
      });
    }

    const subtype = await createShutterSubType(Number(shutter_type_id), name);
    return res.status(201).json({ success: true, data: subtype });
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

export const addCarcasMaterial = async (req: Request, res: Response) => {
  try {
    const { vendor_id, name } = req.body;

    if (!vendor_id || !name) {
      return res
        .status(400)
        .json({ success: false, error: "vendor_id and name are required" });
    }

    const material = await createCarcasMaterial(Number(vendor_id), name);
    return res.status(201).json({ success: true, data: material });
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

export const fetchAllCarcassMaterialFinishesForVendor = async (
  req: Request,
  res: Response,
) => {
  try {
    const vendor_id = getVendorId(req, res);
    if (!vendor_id) return;

    const finishes = await getAllCarcassMaterialFinishesForVendor(vendor_id);
    return res.status(200).json({ success: true, data: finishes });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const addCarcassMaterialFinish = async (req: Request, res: Response) => {
  try {
    const { carcas_material_id, name } = req.body;

    if (!carcas_material_id || !name) {
      return res.status(400).json({
        success: false,
        error: "carcas_material_id and name are required",
      });
    }

    const finish = await createCarcassMaterialFinish(
      Number(carcas_material_id),
      name,
    );
    return res.status(201).json({ success: true, data: finish });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const uploadCarcassMaterialFinishes = async (
  req: Request,
  res: Response,
) => {
  try {
    const file = req.file;
    if (!file) {
      return res
        .status(400)
        .json({ success: false, error: "CSV or XLSX file is required" });
    }

    const vendor_id = Number(
      req.body.vendor_id || req.body.vendorId || req.params.vendor_id,
    );
    if (!vendor_id) {
      return res
        .status(400)
        .json({ success: false, error: "vendor_id is required" });
    }

    const isCsv =
      file.originalname.endsWith(".csv") || file.mimetype === "text/csv";

    const result = await bulkUploadCarcassMaterialFinishes(
      vendor_id,
      file.buffer,
      isCsv,
    );
    return res.status(200).json({ success: true, data: result });
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

export const addShutterMaterial = async (req: Request, res: Response) => {
  try {
    const { vendor_id, name } = req.body;

    if (!vendor_id || !name) {
      return res
        .status(400)
        .json({ success: false, error: "vendor_id and name are required" });
    }

    const material = await createShutterMaterial(Number(vendor_id), name);
    return res.status(201).json({ success: true, data: material });
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

export const fetchAllShutterMaterialFinishesForVendor = async (
  req: Request,
  res: Response,
) => {
  try {
    const vendor_id = getVendorId(req, res);
    if (!vendor_id) return;

    const finishes = await getAllShutterMaterialFinishesForVendor(vendor_id);
    return res.status(200).json({ success: true, data: finishes });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const addShutterMaterialFinish = async (req: Request, res: Response) => {
  try {
    const { shutter_material_id, name } = req.body;

    if (!shutter_material_id || !name) {
      return res.status(400).json({
        success: false,
        error: "shutter_material_id and name are required",
      });
    }

    const finish = await createShutterMaterialFinish(
      Number(shutter_material_id),
      name,
    );
    return res.status(201).json({ success: true, data: finish });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const uploadShutterMaterialFinishes = async (
  req: Request,
  res: Response,
) => {
  try {
    const file = req.file;
    if (!file) {
      return res
        .status(400)
        .json({ success: false, error: "CSV or XLSX file is required" });
    }

    const vendor_id = Number(
      req.body.vendor_id || req.body.vendorId || req.params.vendor_id,
    );
    if (!vendor_id) {
      return res
        .status(400)
        .json({ success: false, error: "vendor_id is required" });
    }

    const isCsv =
      file.originalname.endsWith(".csv") || file.mimetype === "text/csv";

    const result = await bulkUploadShutterMaterialFinishes(
      vendor_id,
      file.buffer,
      isCsv,
    );
    return res.status(200).json({ success: true, data: result });
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

export const addCarcassLegs = async (req: Request, res: Response) => {
  try {
    const { vendor_id, name } = req.body;

    if (!vendor_id || !name) {
      return res
        .status(400)
        .json({ success: false, error: "vendor_id and name are required" });
    }

    const legs = await createCarcassLegs(Number(vendor_id), name);
    return res.status(201).json({ success: true, data: legs });
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

export const fetchAllSkirtingCarcassLegsForVendor = async (
  req: Request,
  res: Response,
) => {
  try {
    const vendor_id = getVendorId(req, res);
    if (!vendor_id) return;

    const skirtings = await getAllSkirtingCarcassLegsForVendor(vendor_id);
    return res.status(200).json({ success: true, data: skirtings });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const addSkirtingCarcassLegs = async (req: Request, res: Response) => {
  try {
    const { carcass_legs_id, name, inScope } = req.body;

    if (!carcass_legs_id || !name) {
      return res.status(400).json({
        success: false,
        error: "carcass_legs_id and name are required",
      });
    }

    const skirting = await createSkirtingCarcassLegs(
      Number(carcass_legs_id),
      name,
      inScope !== false,
    );
    return res.status(201).json({ success: true, data: skirting });
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

export const fetchAllSkirtingCarcassLegsColorsForVendor = async (
  req: Request,
  res: Response,
) => {
  try {
    const vendor_id = getVendorId(req, res);
    if (!vendor_id) return;

    const colors = await getAllSkirtingCarcassLegsColorsForVendor(vendor_id);
    return res.status(200).json({ success: true, data: colors });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const addSkirtingCarcassLegsColor = async (
  req: Request,
  res: Response,
) => {
  try {
    const { carcass_legs_id, skirting_carcass_legs_id, color } = req.body;

    if (!carcass_legs_id || !skirting_carcass_legs_id || !color) {
      return res.status(400).json({
        success: false,
        error:
          "carcass_legs_id, skirting_carcass_legs_id and color are required",
      });
    }

    const colorEntry = await createSkirtingCarcassLegsColor(
      Number(carcass_legs_id),
      Number(skirting_carcass_legs_id),
      color,
    );
    return res.status(201).json({ success: true, data: colorEntry });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const uploadSkirtingCarcassLegsColors = async (
  req: Request,
  res: Response,
) => {
  try {
    const file = req.file;
    if (!file) {
      return res
        .status(400)
        .json({ success: false, error: "CSV or XLSX file is required" });
    }

    const vendor_id = Number(
      req.body.vendor_id || req.body.vendorId || req.params.vendor_id,
    );
    if (!vendor_id) {
      return res
        .status(400)
        .json({ success: false, error: "vendor_id is required" });
    }

    const isCsv =
      file.originalname.endsWith(".csv") || file.mimetype === "text/csv";

    const result = await bulkUploadSkirtingCarcassLegsColors(
      vendor_id,
      file.buffer,
      isCsv,
    );
    return res.status(200).json({ success: true, data: result });
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

export const addLightCarcasType = async (req: Request, res: Response) => {
  try {
    const { vendor_id, type } = req.body;

    if (!vendor_id || !type) {
      return res
        .status(400)
        .json({ success: false, error: "vendor_id and type are required" });
    }

    const created = await createLightCarcasType(Number(vendor_id), type);
    return res.status(201).json({ success: true, data: created });
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

export const fetchAllLightCarcasUnitsForVendor = async (
  req: Request,
  res: Response,
) => {
  try {
    const vendor_id = getVendorId(req, res);
    if (!vendor_id) return;

    const units = await getAllLightCarcasUnitsForVendor(vendor_id);
    return res.status(200).json({ success: true, data: units });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const addLightCarcasUnit = async (req: Request, res: Response) => {
  try {
    const { vendor_id, type, light_carcas_type_id } = req.body;

    if (!vendor_id || !type || !light_carcas_type_id) {
      return res.status(400).json({
        success: false,
        error: "vendor_id, type and light_carcas_type_id are required",
      });
    }

    const created = await createLightCarcasUnit(
      Number(vendor_id),
      type,
      Number(light_carcas_type_id),
    );
    return res.status(201).json({ success: true, data: created });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const uploadLightCarcasUnits = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res
        .status(400)
        .json({ success: false, error: "CSV or XLSX file is required" });
    }

    const vendor_id = Number(
      req.body.vendor_id || req.body.vendorId || req.params.vendor_id,
    );
    if (!vendor_id) {
      return res
        .status(400)
        .json({ success: false, error: "vendor_id is required" });
    }

    const isCsv =
      file.originalname.endsWith(".csv") || file.mimetype === "text/csv";

    const result = await bulkUploadLightCarcasUnits(
      vendor_id,
      file.buffer,
      isCsv,
    );
    return res.status(200).json({ success: true, data: result });
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

export const addOtherAppliances = async (req: Request, res: Response) => {
  try {
    const { vendor_id, type, article_number, description } = req.body;

    if (!vendor_id || !type || !article_number || !description) {
      return res.status(400).json({
        success: false,
        error: "vendor_id, type, article_number and description are required",
      });
    }

    const created = await createOtherAppliances(
      Number(vendor_id),
      type,
      article_number,
      description,
    );
    return res.status(201).json({ success: true, data: created });
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

export const addHandleType = async (req: Request, res: Response) => {
  try {
    const { vendor_id, name } = req.body;

    if (!vendor_id || !name) {
      return res
        .status(400)
        .json({ success: false, error: "vendor_id and name are required" });
    }

    const type = await createHandleType(Number(vendor_id), name);
    return res.status(201).json({ success: true, data: type });
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

export const uploadOtherAppliances = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res
        .status(400)
        .json({ success: false, error: "XLSX file is required" });
    }

    const vendor_id = Number(
      req.body.vendor_id || req.body.vendorId || req.params.vendor_id
    );
    if (!vendor_id) {
      return res
        .status(400)
        .json({ success: false, error: "vendor_id is required" });
    }

    const isCsv =
      file.originalname.endsWith(".csv") || file.mimetype === "text/csv";
    const type = req.body.type || req.query.type;
    if (!type) {
      return res
        .status(400)
        .json({ success: false, error: "type is required" });
    }

    const result = await bulkUploadOtherAppliances(
      vendor_id,
      file.buffer,
      isCsv,
      type
    );
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const downloadOtherAppliancesReport = async (
  req: Request,
  res: Response
) => {
  try {
    const vendor_id = Number(
      req.params.vendor_id || req.query.vendor_id || req.body.vendor_id
    );
    if (!vendor_id) {
      return res
        .status(400)
        .json({ success: false, error: "vendor_id is required" });
    }

    const buffer = await getOtherAppliancesReport(vendor_id);
    const filename = `other_appliances_${vendor_id}_${new Date().toISOString().split("T")[0]}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    return res.send(buffer);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
