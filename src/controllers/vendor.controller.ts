import { Request, Response } from 'express';
import * as vendorService from '../services/vendor.service';

export const createVendor = async (req: Request, res: Response) => {
  try {
    const vendor = await vendorService.createVendor(req.body);
    res.status(201).json(vendor);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Vendor creation failed' });
  }
};

export const getAllVendors = async (_req: Request, res: Response) => {
  const vendors = await vendorService.getAllVendors();
  res.json(vendors);
};


export const getVendorUsersController = async (
  req: Request,
  res: Response
) => {
  try {
    const vendorId = Number(req.query.vendor_id);

    // Validation Layer
    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: "vendor_id is required",
      });
    }

    const users = await vendorService.getVendorUsers(vendorId);

    return res.status(200).json({
      success: true,
      message: "Vendor users fetched successfully",
      data: users,
    });

  } catch (error) {
    console.error("Get Vendor Users Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getVendorStatusTypesController = async (
  req: Request,
  res: Response
) => {
  try {

    const vendorId = Number(req.query.vendor_id);

    // Input validation
    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: "vendor_id is required",
      });
    }

    const data = await vendorService.getVendorStatusTypes(vendorId);

    return res.status(200).json({
      success: true,
      message: "Status types fetched successfully",
      data: data,
    });

  } catch (error) {
    console.error("Status Type API Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
