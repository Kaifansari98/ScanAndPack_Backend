import { Request, Response } from "express";
import {
  addLeadRequirementMaterial,
  getLeadRequirementMaterials,
  updateLeadRequirementMaterial,
  deleteLeadRequirementMaterial,
} from "../../services/leadModuleServices/leadRequirementMaterial.service";

export const createLeadRequirementMaterialHandler = async (
  req: Request,
  res: Response,
) => {
  try {
    const {
      lead_id,
      vendor_id,
      product_type_id,
      b2b_requirement_type_id,
      product_id,
      product_ids,
      quantity,
      unit_id,
      unit_name,
      supplied_by,
      client_percentage,
      frankvin_percentage,
      created_by,
      materials,
    } = req.body;

    const rawTypeId = b2b_requirement_type_id ?? product_type_id;
    const userId = Number((req as any).user?.id || created_by || 1);

    if (!lead_id || !vendor_id || !rawTypeId) {
      return res.status(400).json({
        success: false,
        message: "lead_id, vendor_id, and requirement type ID (b2b_requirement_type_id/product_type_id) are required",
      });
    }

    if (Array.isArray(materials) && materials.length > 0) {
      for (const mat of materials) {
        if (!mat.product_id || mat.quantity == null) {
          return res.status(400).json({
            success: false,
            message: "Each material in list requires a product_id and a quantity",
          });
        }
      }
    } else {
      const hasProductId = product_id != null || (Array.isArray(product_ids) && product_ids.length > 0);
      if (!hasProductId || quantity == null) {
        return res.status(400).json({
          success: false,
          message: "product_id(s) and quantity are required when materials array is not provided",
        });
      }
    }

    const createdByVal = isNaN(userId) ? 1 : userId;

    const result = await addLeadRequirementMaterial({
      lead_id: Number(lead_id),
      vendor_id: Number(vendor_id),
      product_type_id: rawTypeId ? Number(rawTypeId) : undefined,
      b2b_requirement_type_id: rawTypeId ? Number(rawTypeId) : undefined,
      product_id: product_id ? Number(product_id) : undefined,
      product_ids: Array.isArray(product_ids) ? product_ids.map(Number) : undefined,
      quantity: quantity != null ? Number(quantity) : undefined,
      unit_id: unit_id ? Number(unit_id) : null,
      unit_name: unit_name || null,
      supplied_by,
      client_percentage: client_percentage != null ? Number(client_percentage) : undefined,
      frankvin_percentage: frankvin_percentage != null ? Number(frankvin_percentage) : undefined,
      created_by: createdByVal,
      materials: Array.isArray(materials)
        ? materials.map((mat: any) => ({
            product_id: Number(mat.product_id),
            quantity: Number(mat.quantity),
            unit_id: mat.unit_id ? Number(mat.unit_id) : null,
            unit_name: mat.unit_name || null,
            supplied_by: mat.supplied_by,
            client_percentage: mat.client_percentage != null ? Number(mat.client_percentage) : undefined,
            frankvin_percentage: mat.frankvin_percentage != null ? Number(mat.frankvin_percentage) : undefined,
          }))
        : undefined,
    });

    return res.status(201).json({
      success: true,
      message: "Lead requirement material(s) created successfully",
      data: result,
    });
  } catch (error: any) {
    console.error("[ERROR] createLeadRequirementMaterialHandler:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getLeadRequirementMaterialsHandler = async (
  req: Request,
  res: Response,
) => {
  try {
    const lead_id = Number(req.params.lead_id || req.query.lead_id);
    const vendor_id = Number(req.params.vendor_id || req.query.vendor_id);

    if (!lead_id || !vendor_id) {
      return res.status(400).json({
        success: false,
        message: "lead_id and vendor_id are required",
      });
    }

    const materials = await getLeadRequirementMaterials(lead_id, vendor_id);

    return res.status(200).json({
      success: true,
      data: materials,
    });
  } catch (error: any) {
    console.error("[ERROR] getLeadRequirementMaterialsHandler:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateLeadRequirementMaterialHandler = async (
  req: Request,
  res: Response,
) => {
  try {
    const id = Number(req.params.id);
    const {
      vendor_id,
      quantity,
      unit_id,
      unit_name,
      supplied_by,
      client_percentage,
      frankvin_percentage,
    } = req.body;

    if (!id || !vendor_id || quantity == null) {
      return res.status(400).json({
        success: false,
        message: "id, vendor_id, and quantity are required",
      });
    }

    const updated = await updateLeadRequirementMaterial(id, {
      vendor_id: Number(vendor_id),
      quantity: Number(quantity),
      unit_id: unit_id ? Number(unit_id) : null,
      unit_name: unit_name || null,
      supplied_by,
      client_percentage: client_percentage != null ? Number(client_percentage) : undefined,
      frankvin_percentage: frankvin_percentage != null ? Number(frankvin_percentage) : undefined,
    });

    return res.status(200).json({
      success: true,
      message: "Lead requirement material updated successfully",
      data: updated,
    });
  } catch (error: any) {
    console.error("[ERROR] updateLeadRequirementMaterialHandler:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const deleteLeadRequirementMaterialHandler = async (
  req: Request,
  res: Response,
) => {
  try {
    const id = Number(req.params.id);
    const vendor_id = Number(req.query.vendor_id || req.body.vendor_id);

    if (!id || !vendor_id) {
      return res.status(400).json({
        success: false,
        message: "id and vendor_id are required",
      });
    }

    await deleteLeadRequirementMaterial(id, vendor_id);

    return res.status(200).json({
      success: true,
      message: "Lead requirement material deleted successfully",
    });
  } catch (error: any) {
    console.error("[ERROR] deleteLeadRequirementMaterialHandler:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
