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
  createTimelineRule,
  updateTimelineRule,
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
  getAllHardwareTypes,
  createHardwareType,
  getHardwareItems,
  createHardwareItem,
  getAllHardwareItemsForVendor,
  getHardwareItemOptions,
  createHardwareItemOption,
  getAllHardwareItemOptionsForVendor,
  bulkUploadHardwareItemOptions,
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

export const fetchAllHardwareTypes = async (req: Request, res: Response) => {
  try {
    const vendor_id = getVendorId(req, res);
    if (!vendor_id) return;

    const hardwareTypes = await getAllHardwareTypes(vendor_id);
    return res.status(200).json({ success: true, data: hardwareTypes });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const addHardwareType = async (req: Request, res: Response) => {
  try {
    const { vendor_id, name } = req.body;

    if (!vendor_id || !name) {
      return res
        .status(400)
        .json({ success: false, error: "vendor_id and name are required" });
    }

    const hardwareType = await createHardwareType(Number(vendor_id), name);
    return res.status(201).json({ success: true, data: hardwareType });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const fetchHardwareItems = async (
  req: Request,
  res: Response,
) => {
  try {
    const hardware_type_id = Number(req.params.hardware_type_id);
    if (!hardware_type_id) {
      return res.status(400).json({ error: "hardware_type_id is required" });
    }

    const hardwareItems = await getHardwareItems(hardware_type_id);
    return res.status(200).json({ success: true, data: hardwareItems });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const fetchAllHardwareItemsForVendor = async (
  req: Request,
  res: Response,
) => {
  try {
    const vendor_id = getVendorId(req, res);
    if (!vendor_id) return;

    const hardwareItems = await getAllHardwareItemsForVendor(vendor_id);
    return res.status(200).json({ success: true, data: hardwareItems });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const addHardwareItem = async (req: Request, res: Response) => {
  try {
    const { hardware_type_id, name, inScope } = req.body;

    if (!hardware_type_id || !name) {
      return res.status(400).json({
        success: false,
        error: "hardware_type_id and name are required",
      });
    }

    const hardwareItem = await createHardwareItem(
      Number(hardware_type_id),
      name,
      inScope !== false,
    );
    return res.status(201).json({ success: true, data: hardwareItem });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const fetchHardwareItemOptions = async (
  req: Request,
  res: Response,
) => {
  try {
    const hardware_item_id = Number(
      req.params.hardware_item_id,
    );
    if (!hardware_item_id) {
      return res
        .status(400)
        .json({ error: "hardware_item_id is required" });
    }

    const options = await getHardwareItemOptions(
      hardware_item_id,
    );
    return res.status(200).json({ success: true, data: options });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const fetchAllHardwareItemOptionsForVendor = async (
  req: Request,
  res: Response,
) => {
  try {
    const vendor_id = getVendorId(req, res);
    if (!vendor_id) return;

    const options = await getAllHardwareItemOptionsForVendor(vendor_id);
    return res.status(200).json({ success: true, data: options });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const addHardwareItemOption = async (
  req: Request,
  res: Response,
) => {
  try {
    const { hardware_type_id, hardware_item_id, name } = req.body;

    if (!hardware_type_id || !hardware_item_id || !name) {
      return res.status(400).json({
        success: false,
        error:
          "hardware_type_id, hardware_item_id and name are required",
      });
    }

    const optionEntry = await createHardwareItemOption(
      Number(hardware_type_id),
      Number(hardware_item_id),
      name,
    );
    return res.status(201).json({ success: true, data: optionEntry });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const uploadHardwareItemOptions = async (
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

    const result = await bulkUploadHardwareItemOptions(
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

export const addTimelineRule = async (req: Request, res: Response) => {
  try {
    const {
      vendor_id,
      carcass_id,
      shutter_id,
      kitchen_manufacturing_days,
      other_manufacturing_days,
      kitchen_manufacturing_days_for_fast_production,
      other_manufacturing_days_for_fast_production,
    } = req.body;

    if (
      !vendor_id ||
      !carcass_id ||
      kitchen_manufacturing_days === undefined ||
      other_manufacturing_days === undefined
    ) {
      return res.status(400).json({
        success: false,
        error:
          "vendor_id, carcass_id, kitchen_manufacturing_days and other_manufacturing_days are required",
      });
    }

    const rule = await createTimelineRule({
      vendor_id: Number(vendor_id),
      carcass_id: Number(carcass_id),
      shutter_id:
        shutter_id === undefined || shutter_id === null || shutter_id === ""
          ? null
          : Number(shutter_id),
      kitchen_manufacturing_days: Number(kitchen_manufacturing_days),
      other_manufacturing_days: Number(other_manufacturing_days),
      kitchen_manufacturing_days_for_fast_production:
        kitchen_manufacturing_days_for_fast_production === undefined ||
        kitchen_manufacturing_days_for_fast_production === null ||
        kitchen_manufacturing_days_for_fast_production === ""
          ? null
          : Number(kitchen_manufacturing_days_for_fast_production),
      other_manufacturing_days_for_fast_production:
        other_manufacturing_days_for_fast_production === undefined ||
        other_manufacturing_days_for_fast_production === null ||
        other_manufacturing_days_for_fast_production === ""
          ? null
          : Number(other_manufacturing_days_for_fast_production),
    });

    return res.status(201).json({ success: true, data: rule });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const editTimelineRule = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const {
      vendor_id,
      carcass_id,
      shutter_id,
      kitchen_manufacturing_days,
      other_manufacturing_days,
      kitchen_manufacturing_days_for_fast_production,
      other_manufacturing_days_for_fast_production,
    } = req.body;

    if (
      !id ||
      !vendor_id ||
      !carcass_id ||
      kitchen_manufacturing_days === undefined ||
      other_manufacturing_days === undefined
    ) {
      return res.status(400).json({
        success: false,
        error:
          "id, vendor_id, carcass_id, kitchen_manufacturing_days and other_manufacturing_days are required",
      });
    }

    const rule = await updateTimelineRule(id, {
      vendor_id: Number(vendor_id),
      carcass_id: Number(carcass_id),
      shutter_id:
        shutter_id === undefined || shutter_id === null || shutter_id === ""
          ? null
          : Number(shutter_id),
      kitchen_manufacturing_days: Number(kitchen_manufacturing_days),
      other_manufacturing_days: Number(other_manufacturing_days),
      kitchen_manufacturing_days_for_fast_production:
        kitchen_manufacturing_days_for_fast_production === undefined ||
        kitchen_manufacturing_days_for_fast_production === null ||
        kitchen_manufacturing_days_for_fast_production === ""
          ? null
          : Number(kitchen_manufacturing_days_for_fast_production),
      other_manufacturing_days_for_fast_production:
        other_manufacturing_days_for_fast_production === undefined ||
        other_manufacturing_days_for_fast_production === null ||
        other_manufacturing_days_for_fast_production === ""
          ? null
          : Number(other_manufacturing_days_for_fast_production),
    });

    return res.status(200).json({ success: true, data: rule });
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
