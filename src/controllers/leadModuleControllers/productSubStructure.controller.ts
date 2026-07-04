import { Request, Response } from "express";
import {
    addProductSubStructure,
    getAllProductSubStructures,
} from "../../services/leadModuleServices/productSubStructure.service";
import { ProductSubStructureInput } from "../../types/leadModule.types";

export const createProductSubStructure = async (req: Request, res: Response) => {
    console.log("[CONTROLLER] createProductSubStructure called", {
        body: req.body,
    });

    try {
        const { vendor_id, type, product_structure_id } =
            req.body as ProductSubStructureInput;

        if (!vendor_id || !type || !product_structure_id) {
            console.warn("[CONTROLLER] Missing required fields", {
                vendor_id,
                type,
                product_structure_id,
            });
            return res.status(400).json({
                error: "vendor_id, type and product_structure_id are required",
            });
        }

        const productSubStructure = await addProductSubStructure({
            vendor_id,
            type,
            product_structure_id,
        });

        return res.status(201).json({ success: true, data: productSubStructure });
    } catch (error: any) {
        console.error("[CONTROLLER] Error creating product sub structure", {
            error: error.message,
        });
        return res.status(500).json({ success: false, error: error.message });
    }
};

export const fetchAllProductSubStructures = async (
    req: Request,
    res: Response
) => {
    console.log("[CONTROLLER] fetchAllProductSubStructures called", {
        query: req.query,
    });

    try {
        const vendor_id = Number(req.params.vendor_id);

        if (!vendor_id) {
            console.warn("[CONTROLLER] Missing vendor_id");
            return res.status(400).json({ error: "vendor_id is required" });
        }

        const productSubStructures = await getAllProductSubStructures(vendor_id);
        return res.status(200).json({ success: true, data: productSubStructures });
    } catch (error: any) {
        console.error("[CONTROLLER] Error fetching product sub structures", {
            error: error.message,
        });
        return res.status(500).json({ success: false, error: error.message });
    }
};
