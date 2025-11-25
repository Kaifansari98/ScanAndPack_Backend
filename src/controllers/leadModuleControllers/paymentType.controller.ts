import { Request, Response } from "express";
import { PaymentTypeInput } from "../../types/leadModule.types";
import { addPaymentType, deletePaymentType, getAllPaymentTypes } from "../../services/leadModuleServices/paymentType.service";

export const createPaymentType = async (req: Request, res: Response) => {
  console.log("[CONTROLLER] createPaymentType called", { body: req.body });

  try {
      const { vendor_id, type, tag } = req.body as PaymentTypeInput;

      if (!vendor_id || !type || !tag) {
          console.warn("[CONTROLLER] Missing required fields", { vendor_id, type, tag });
          return res.status(400).json({ error: "vendor_id, type, and tag are required" });
      }

      const paymentType = await addPaymentType({ vendor_id, type, tag });

      console.log("[CONTROLLER] Payment Type created successfully", paymentType);
      return res.status(201).json({ success: true, data: paymentType });
  } catch (error: any) {
      console.error("[CONTROLLER] Error creating Payment type", { error: error.message });
      return res.status(500).json({ success: false, error: error.message });
  }
};

export const fetchAllPaymentTypes = async (req: Request, res: Response) => {
    console.log("[CONTROLLER] fetchAllPaymentTypes called", { query: req.query });

    try {
    const vendor_id = parseInt(req.params.vendor_id);
    if (!vendor_id) {
      console.warn("[CONTROLLER] Missing vendor_id");
      return res.status(400).json({ error: "vendor_id is required" });
    }

    const paymentTypes = await getAllPaymentTypes(vendor_id);
    return res.status(200).json({ success: true, data: paymentTypes });
    } 
    catch (error: any) {
    console.error("[CONTROLLER] Error fetching Payment types", { error: error.message });
    return res.status(500).json({ success: false, error: error.message });
    }
}

export const removePaymentType = async (req: Request, res: Response) => {
    console.log("[CONTROLLER] removePaymentType called", { params: req.params });
  
    try {
      const id = parseInt(req.params.id);
      if (!id) {
        console.warn("[CONTROLLER] Missing Payment type id");
        return res.status(400).json({ error: "id is required" });
      }
  
      await deletePaymentType(id);
      return res.status(200).json({ success: true, message: "Payment Type deleted successfully" });
    } catch (error: any) {
      console.error("[CONTROLLER] Error deleting Payment type", { error: error.message });
      return res.status(500).json({ success: false, error: error.message });
    }
};