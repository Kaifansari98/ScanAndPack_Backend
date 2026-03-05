import { Request, Response } from "express";
import {
  createFranchise,
  getFranchisesByVendorId,
} from "../../services/franchise/franchise.service";

export const createFranchiseController = async (
  req: Request,
  res: Response
) => {
  try {
    const payload = req.body ?? {};
    const franchise = await createFranchise(payload);

    return res.status(201).json({
      success: true,
      message: "Franchise created successfully",
      data: franchise,
    });
  } catch (error: any) {
    console.error("Error creating franchise:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Internal server error while creating franchise",
    });
  }
};

export const getFranchisesByVendorIdController = async (
  req: Request,
  res: Response
) => {
  try {
    const vendorId = Number(req.params.vendorId);
    if (!vendorId || Number.isNaN(vendorId)) {
      return res.status(400).json({
        success: false,
        message: "Valid vendorId is required",
      });
    }

    const franchises = await getFranchisesByVendorId(vendorId);

    return res.status(200).json({
      success: true,
      message: "Franchises fetched successfully",
      data: franchises,
    });
  } catch (error: any) {
    console.error("Error fetching franchises:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Internal server error while fetching franchises",
    });
  }
};
