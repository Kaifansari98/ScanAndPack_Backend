import { Request, Response } from "express";
import * as vendorService from "../services/vendor.service";

export const createVendor = async (req: Request, res: Response) => {
  try {
    const vendor = await vendorService.createVendor(req.body);
    res.status(201).json(vendor);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Vendor creation failed" });
  }
};

export const getAllVendors = async (_req: Request, res: Response) => {
  const vendors = await vendorService.getAllVendors();
  res.json(vendors);
};

export const getVendorUsersController = async (req: Request, res: Response) => {
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

export const seedVendorMastersController = async (
  req: Request,
  res: Response,
) => {
  try {
    const vendorId = Number(req.body.vendor_id);
    if (!vendorId) {
      return res
        .status(400)
        .json({ success: false, message: "vendor_id is required" });
    }

    const vendor = await vendorService.getVendorById(vendorId);
    if (!vendor) {
      return res
        .status(404)
        .json({
          success: false,
          message: `Vendor with id ${vendorId} not found`,
        });
    }

    await vendorService.seedVendorMasters(vendorId);
    return res.status(201).json({
      success: true,
      message: "Vendor masters seeded successfully",
    });
  } catch (err: any) {
    console.error("Seed Vendor Masters Error:", err?.message ?? err);
    return res
      .status(500)
      .json({ success: false, message: "Seeding failed", error: err?.message });
  }
};

export const onboardVendorController = async (req: Request, res: Response) => {
  try {
    const vendor = await vendorService.onboardVendor(req.body);
    return res.status(201).json({
      success: true,
      message: "Vendor onboarded successfully",
      data: vendor,
    });
  } catch (err) {
    console.error("Onboard Vendor Error:", err);
    return res.status(500).json({
      success: false,
      message: "Vendor onboarding failed",
    });
  }
};

export const getVendorStatusTypesController = async (
  req: Request,
  res: Response,
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

export const getLeadsOverviewReportController = async (
  req: Request,
  res: Response,
) => {
  try {
    const vendorId = Number(req.query.vendor_id);
    const franchiseId = req.query.franchise_id
      ? Number(req.query.franchise_id)
      : null;
    const fromDate = req.query.from_date ? String(req.query.from_date) : null;
    const toDate = req.query.to_date ? String(req.query.to_date) : null;

    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: "vendor_id is required",
      });
    }

    const data = await vendorService.getLeadsOverviewReportData(
      vendorId,
      franchiseId,
      fromDate,
      toDate,
    );

    return res.status(200).json({
      success: true,
      message: "Leads overview report data fetched successfully",
      data,
    });
  } catch (error) {
    console.error("Leads Overview Report Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getTechCheckStageReportController = async (
  req: Request,
  res: Response,
) => {
  try {
    const vendorId = Number(req.query.vendor_id);
    const franchiseId = req.query.franchise_id
      ? Number(req.query.franchise_id)
      : null;
    const fromDate = req.query.from_date ? String(req.query.from_date) : null;
    const toDate = req.query.to_date ? String(req.query.to_date) : null;

    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: "vendor_id is required",
      });
    }

    const data = await vendorService.getTechCheckStageReportData(
      vendorId,
      franchiseId,
      fromDate,
      toDate,
    );

    return res.status(200).json({
      success: true,
      message: "Tech check stage report data fetched successfully",
      data,
    });
  } catch (error) {
    console.error("Tech Check Stage Report Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getErdReportController = async (
  req: Request,
  res: Response,
) => {
  try {
    const vendorId = Number(req.query.vendor_id);
    const franchiseId = req.query.franchise_id
      ? Number(req.query.franchise_id)
      : null;
    const fromDate = req.query.from_date ? String(req.query.from_date) : null;
    const toDate = req.query.to_date ? String(req.query.to_date) : null;

    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: "vendor_id is required",
      });
    }

    const data = await vendorService.getErdReportData(
      vendorId,
      franchiseId,
      fromDate,
      toDate,
    );

    return res.status(200).json({
      success: true,
      message: "ERD report data fetched successfully",
      data,
    });
  } catch (error) {
    console.error("ERD Report Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getLeadTrackingReportController = async (
  req: Request,
  res: Response,
) => {
  try {
    const vendorId = Number(req.query.vendor_id);
    const franchiseId = req.query.franchise_id
      ? Number(req.query.franchise_id)
      : null;
    const userType = req.query.user_type ? String(req.query.user_type) : null;
    const userId = req.query.user_id ? Number(req.query.user_id) : null;
    const leadId = req.query.lead_id ? Number(req.query.lead_id) : null;
    const fromDate = req.query.from_date ? String(req.query.from_date) : null;
    const toDate = req.query.to_date ? String(req.query.to_date) : null;

    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: "vendor_id is required",
      });
    }

    const data = await vendorService.getLeadTrackingReportData(
      vendorId,
      franchiseId,
      userType,
      userId,
      leadId,
      fromDate,
      toDate,
    );

    return res.status(200).json({
      success: true,
      message: "Lead tracking report data fetched successfully",
      data,
    });
  } catch (error) {
    console.error("Lead Tracking Report Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getPaymentsBetweenClientAndStoreReportController = async (
  req: Request,
  res: Response,
) => {
  try {
    const vendorId = Number(req.query.vendor_id);
    const franchiseId = req.query.franchise_id
      ? Number(req.query.franchise_id)
      : null;
    const leadId = req.query.lead_id ? Number(req.query.lead_id) : null;
    const fromDate = req.query.from_date ? String(req.query.from_date) : null;
    const toDate = req.query.to_date ? String(req.query.to_date) : null;

    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: "vendor_id is required",
      });
    }

    const data = await vendorService.getPaymentsBetweenClientAndStoreReportData(
      vendorId,
      franchiseId,
      leadId,
      fromDate,
      toDate,
    );

    return res.status(200).json({
      success: true,
      message: "Payments report data fetched successfully",
      data,
    });
  } catch (error) {
    console.error("Payments Report Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
