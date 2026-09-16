import { Request, Response } from "express";
import { getAllSmallOrderRequestTypes } from "../../services/leadModuleServices/smallOrderRequestType.service";

export const fetchAllSmallOrderRequestTypes = async (
  req: Request,
  res: Response,
) => {
  try {
    const vendor_id = Number(req.params.vendor_id);

    if (!vendor_id) {
      return res.status(400).json({ error: "vendor_id is required" });
    }

    const types = await getAllSmallOrderRequestTypes(vendor_id);
    return res.status(200).json({ success: true, data: types });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch small order request types",
    });
  }
};
