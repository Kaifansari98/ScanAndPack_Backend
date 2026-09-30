import { Request, Response } from "express";
import {
    addProductItemCode,
    getAllProductItemCodes,
} from "../../services/leadModuleServices/productItemCode.service";
import { ProductItemCodeInput } from "../../types/leadModule.types";

export const createProductItemCode = async (req: Request, res: Response) => {
    console.log("[CONTROLLER] createProductItemCode called", {
        body: req.body,
    });

    try {
        const {
            vendor_id,
            item_code,
            product_structure_id,
            sub_product_structure_id,
            description,
            specification,
        } = req.body as ProductItemCodeInput;

        if (
            !vendor_id ||
            !item_code ||
            !product_structure_id ||
            !sub_product_structure_id ||
            !description ||
            !specification
        ) {
            console.warn("[CONTROLLER] Missing required fields", {
                vendor_id,
                item_code,
                product_structure_id,
                sub_product_structure_id,
                description,
                specification,
            });
            return res.status(400).json({
                error:
                    "vendor_id, item_code, product_structure_id, sub_product_structure_id, description and specification are required",
            });
        }

        const itemCode = await addProductItemCode({
            vendor_id,
            item_code,
            product_structure_id,
            sub_product_structure_id,
            description,
            specification,
        });

        return res.status(201).json({ success: true, data: itemCode });
    } catch (error: any) {
        console.error("[CONTROLLER] Error creating product item code", {
            error: error.message,
        });
        return res.status(500).json({ success: false, error: error.message });
    }
};

export const fetchAllProductItemCodes = async (req: Request, res: Response) => {
    console.log("[CONTROLLER] fetchAllProductItemCodes called", {
        query: req.query,
    });

    try {
        const vendor_id = Number(req.params.vendor_id);

        if (!vendor_id) {
            console.warn("[CONTROLLER] Missing vendor_id");
            return res.status(400).json({ error: "vendor_id is required" });
        }

        const itemCodes = await getAllProductItemCodes(vendor_id);
        return res.status(200).json({ success: true, data: itemCodes });
    } catch (error: any) {
        console.error("[CONTROLLER] Error fetching product item codes", {
            error: error.message,
        });
        return res.status(500).json({ success: false, error: error.message });
    }
};
