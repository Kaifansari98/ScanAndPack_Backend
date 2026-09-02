import { Request, Response } from "express";
import * as vendorService from "../services/vendor.service";
import { uploadToWasabiVendorAsset } from "../utils/wasabiClient";
import fs from "node:fs/promises";

const cleanString = (value: any) => {
  if (value === undefined || value === null) return undefined;

  const trimmed = String(value).trim();

  return trimmed || null;
};

const cleanNumberOrNull = (value: any) => {
  if (value === undefined || value === null || value === "") return null;

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
};

const validateOptionalVendorCompanyFields = (data: any) => {
  const gstNo = cleanString(data.gst_no);
  const websiteLink = cleanString(data.website_link);
  const pincode = cleanString(data.pincode);

  const gstRegex =
    /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

  const websiteRegex =
    /^(https?:\/\/)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/.*)?$/;

  if (gstNo && !gstRegex.test(String(gstNo).toUpperCase())) {
    throw new Error("Invalid GST number format");
  }

  if (websiteLink && !websiteRegex.test(String(websiteLink))) {
    throw new Error("Invalid website link format");
  }

  if (pincode && !/^\d{6}$/.test(String(pincode))) {
    throw new Error("Pincode must be 6 digits");
  }
};

export const createVendor = async (req: Request, res: Response) => {
  try {
    const files = req.files as { [key: string]: Express.Multer.File[] } | undefined;
    const logoFile = files?.logo?.[0];
    const iconFile = files?.icon?.[0];
    const loginImageFile = files?.login_image?.[0];

    let logoUrl = req.body.logo || "";
    let iconUrl = req.body.icon || "";
    let loginImageUrl = req.body.login_image || "";

    if (logoFile) {
      logoUrl = await uploadToWasabiVendorAsset(
        logoFile.path,
        "logo",
        logoFile.originalname,
        logoFile.mimetype
      );
      await fs.unlink(logoFile.path);
    }

    if (iconFile) {
      iconUrl = await uploadToWasabiVendorAsset(
        iconFile.path,
        "icon",
        iconFile.originalname,
        iconFile.mimetype
      );
      await fs.unlink(iconFile.path);
    }

    if (loginImageFile) {
      loginImageUrl = await uploadToWasabiVendorAsset(
        loginImageFile.path,
        "login_image",
        loginImageFile.originalname,
        loginImageFile.mimetype
      );
      await fs.unlink(loginImageFile.path);
    }

    const vendorData = {
      ...req.body,
      logo: logoUrl,
      icon: iconUrl,
      login_image: loginImageUrl,
      gst_no: cleanString(req.body.gst_no),
      toll_free_no: cleanString(req.body.toll_free_no),
      website_link: cleanString(req.body.website_link),
      tag_line: cleanString(req.body.tag_line),
      address: cleanString(req.body.address),
      pincode: cleanString(req.body.pincode),
      city: cleanString(req.body.city),
      state_id: cleanNumberOrNull(req.body.state_id),

      handlesLargeScaleProjects: req.body.handlesLargeScaleProjects === "true" || req.body.handlesLargeScaleProjects === true,
      is_crm_enabled: req.body.is_crm_enabled === "true" || req.body.is_crm_enabled === true,
      is_inventory_enabled: req.body.is_inventory_enabled === "true" || req.body.is_inventory_enabled === true,
      is_tracktrace_enabled: req.body.is_tracktrace_enabled === "true" || req.body.is_tracktrace_enabled === true,
      push_lead_to_cadbid: req.body.push_lead_to_cadbid === "true" || req.body.push_lead_to_cadbid === true,
      is_year_wise_lead_code_enabled: req.body.is_year_wise_lead_code_enabled === "true" || req.body.is_year_wise_lead_code_enabled === true,
      head_office_id: req.body.head_office_id ? Number(req.body.head_office_id) : null,
    };

    const vendor = await vendorService.createVendor(vendorData);
    res.status(201).json(vendor);
  } catch (err: any) {
    console.error("Create Vendor Error:", err);
    res.status(500).json({ error: err?.message || "Vendor creation failed" });
  }
};

export const updateVendorController = async (req: Request, res: Response) => {
  try {
    const vendorId = Number(req.params.vendor_id);

    if (!vendorId || Number.isNaN(vendorId)) {
      return res.status(400).json({
        success: false,
        message: "vendor_id must be a valid number",
      });
    }

    const files = req.files as { [key: string]: Express.Multer.File[] } | undefined;
    const logoFile = files?.logo?.[0];
    const iconFile = files?.icon?.[0];
    const loginImageFile = files?.login_image?.[0];

    let logoUrl = req.body.logo;
    let iconUrl = req.body.icon;
    let loginImageUrl = req.body.login_image;

    if (logoFile) {
      logoUrl = await uploadToWasabiVendorAsset(
        logoFile.path,
        "logo",
        logoFile.originalname,
        logoFile.mimetype
      );
      await fs.unlink(logoFile.path);
    }

    if (iconFile) {
      iconUrl = await uploadToWasabiVendorAsset(
        iconFile.path,
        "icon",
        iconFile.originalname,
        iconFile.mimetype
      );
      await fs.unlink(iconFile.path);
    }

    if (loginImageFile) {
      loginImageUrl = await uploadToWasabiVendorAsset(
        loginImageFile.path,
        "login_image",
        loginImageFile.originalname,
        loginImageFile.mimetype
      );
      await fs.unlink(loginImageFile.path);
    }

    const vendorData = {
      ...req.body,
      ...(logoUrl !== undefined && { logo: logoUrl }),
      ...(iconUrl !== undefined && { icon: iconUrl }),
      ...(loginImageUrl !== undefined && { login_image: loginImageUrl }),
      gst_no: cleanString(req.body.gst_no),
      toll_free_no: cleanString(req.body.toll_free_no),
      website_link: cleanString(req.body.website_link),
      tag_line: cleanString(req.body.tag_line),
      address: cleanString(req.body.address),
      pincode: cleanString(req.body.pincode),
      city: cleanString(req.body.city),
      state_id:
        req.body.state_id !== undefined
          ? cleanNumberOrNull(req.body.state_id)
          : undefined,

      handlesLargeScaleProjects: req.body.handlesLargeScaleProjects !== undefined
        ? (req.body.handlesLargeScaleProjects === "true" || req.body.handlesLargeScaleProjects === true)
        : undefined,
      is_crm_enabled: req.body.is_crm_enabled !== undefined
        ? (req.body.is_crm_enabled === "true" || req.body.is_crm_enabled === true)
        : undefined,
      is_inventory_enabled: req.body.is_inventory_enabled !== undefined
        ? (req.body.is_inventory_enabled === "true" || req.body.is_inventory_enabled === true)
        : undefined,
      is_tracktrace_enabled: req.body.is_tracktrace_enabled !== undefined
        ? (req.body.is_tracktrace_enabled === "true" || req.body.is_tracktrace_enabled === true)
        : undefined,
      is_year_wise_lead_code_enabled: req.body.is_year_wise_lead_code_enabled !== undefined
        ? (req.body.is_year_wise_lead_code_enabled === "true" || req.body.is_year_wise_lead_code_enabled === true)
        : undefined,
      head_office_id: req.body.head_office_id !== undefined
        ? (req.body.head_office_id ? Number(req.body.head_office_id) : null)
        : undefined,

      is_scanpack_enabled: req.body.is_scanpack_enabled !== undefined
        ? (req.body.is_scanpack_enabled === "true" || req.body.is_scanpack_enabled === true)
        : undefined,
      push_lead_to_cadbid: req.body.push_lead_to_cadbid !== undefined
        ? req.body.push_lead_to_cadbid === "true" ||
        req.body.push_lead_to_cadbid === true : undefined,

    };

    const vendor = await vendorService.updateVendor(vendorId, vendorData);

    return res.status(200).json({
      success: true,
      message: "Vendor updated successfully",
      data: vendor,
    });
  } catch (err: any) {
    console.error("Update Vendor Error:", err);
    return res.status(err?.message === "Vendor not found" ? 404 : 500).json({
      success: false,
      message: err?.message || "Vendor update failed",
    });
  }
};

export const getAllVendors = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const search = req.query.search ? String(req.query.search).trim() : undefined;

    const result = await vendorService.getAllVendorsPaginated({ page, limit, search });

    return res.status(200).json({
      success: true,
      message: "Vendors fetched successfully",
      data: result.data,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error("Get All Vendors Error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const getVendorByIdController = async (req: Request, res: Response) => {
  try {
    const vendorId = Number(req.params.vendor_id);

    if (!vendorId || Number.isNaN(vendorId)) {
      return res.status(400).json({
        success: false,
        message: "vendor_id must be a valid number",
      });
    }

    const vendor = await vendorService.getVendorById(vendorId);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Vendor fetched successfully",
      data: vendor,
    });
  } catch (err) {
    console.error("Get Vendor By Id Error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
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
    const files = req.files as { [key: string]: Express.Multer.File[] } | undefined;
    const logoFile = files?.logo?.[0];
    const iconFile = files?.icon?.[0];

    let logoUrl = req.body.logo || "";
    let iconUrl = req.body.icon || "";

    if (logoFile) {
      logoUrl = await uploadToWasabiVendorAsset(
        logoFile.path,
        "logo",
        logoFile.originalname,
        logoFile.mimetype
      );
      await fs.unlink(logoFile.path);
    }

    if (iconFile) {
      iconUrl = await uploadToWasabiVendorAsset(
        iconFile.path,
        "icon",
        iconFile.originalname,
        iconFile.mimetype
      );
      await fs.unlink(iconFile.path);
    }

    const vendorData = {
      ...req.body,
      logo: logoUrl,
      icon: iconUrl,
      gst_no: cleanString(req.body.gst_no),
      toll_free_no: cleanString(req.body.toll_free_no),
      website_link: cleanString(req.body.website_link),
      tag_line: cleanString(req.body.tag_line),
      address: cleanString(req.body.address),
      pincode: cleanString(req.body.pincode),
      city: cleanString(req.body.city),
      state_id: cleanNumberOrNull(req.body.state_id),

      handlesLargeScaleProjects: req.body.handlesLargeScaleProjects === "true" || req.body.handlesLargeScaleProjects === true,
      is_crm_enabled: req.body.is_crm_enabled === "true" || req.body.is_crm_enabled === true,
      is_inventory_enabled: req.body.is_inventory_enabled === "true" || req.body.is_inventory_enabled === true,
      is_tracktrace_enabled: req.body.is_tracktrace_enabled === "true" || req.body.is_tracktrace_enabled === true,
      is_year_wise_lead_code_enabled: req.body.is_year_wise_lead_code_enabled === "true" || req.body.is_year_wise_lead_code_enabled === true,
      head_office_id: req.body.head_office_id ? Number(req.body.head_office_id) : null,
      is_scanpack_enabled: req.body.is_scanpack_enabled === "true" || req.body.is_scanpack_enabled === true,
      push_lead_to_cadbid: req.body.push_lead_to_cadbid === "true" || req.body.push_lead_to_cadbid === true,

    };

    const vendor = await vendorService.onboardVendor(vendorData);
    return res.status(201).json({
      success: true,
      message: "Vendor onboarded successfully",
      data: vendor,
    });
  } catch (err: any) {
    console.error("Onboard Vendor Error:", err);
    return res.status(500).json({
      success: false,
      message: err?.message || "Vendor onboarding failed",
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

export const getSelfAssignTaskTypesController = async (
  req: Request,
  res: Response,
) => {
  try {
    const vendorId = Number(req.query.vendor_id);
    const userTypeIdParam = req.query.user_type_id;
    const userTypeId =
      userTypeIdParam !== undefined ? Number(userTypeIdParam) : undefined;

    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: "vendor_id is required",
      });
    }

    if (userTypeIdParam !== undefined && !userTypeId) {
      return res.status(400).json({
        success: false,
        message: "user_type_id must be a valid number",
      });
    }

    const data = await vendorService.getSelfAssignTaskTypes(
      vendorId,
      userTypeId,
    );

    return res.status(200).json({
      success: true,
      message: "Self assign task types fetched successfully",
      data,
    });
  } catch (error) {
    console.error("Self Assign Task Types API Error:", error);

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

export const getVendorBySubdomainController = async (req: Request, res: Response) => {
  try {
    const subdomain = req.query.subdomain ? String(req.query.subdomain) : "";

    if (!subdomain) {
      return res.status(400).json({
        success: false,
        message: "subdomain parameter is required",
      });
    }

    const vendor = await vendorService.getVendorBySubdomain(subdomain);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found for this subdomain",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Vendor metadata fetched successfully",
      data: vendor,
    });
  } catch (error) {
    console.error("Get Vendor By Subdomain Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


export const getStatesController = async (req: Request, res: Response) => {
  try {
    const states = await vendorService.getStates();

    return res.status(200).json({
      success: true,
      message: "States fetched successfully",
      data: states,
    });
  } catch (error) {
    console.error("Get States Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getLeadServicingReportController = async (
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

    const data = await vendorService.getLeadServicingReportData(
      vendorId,
      franchiseId,
      fromDate,
      toDate,
    );

    return res.status(200).json({
      success: true,
      message: "Lead servicing report data fetched successfully",
      data,
    });
  } catch (error) {
    console.error("Lead Servicing Report Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};export const getFastProductionReportController = async (
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

    const data = await vendorService.getFastProductionReportData(
      vendorId,
      franchiseId,
      fromDate,
      toDate,
    );

    return res.status(200).json({
      success: true,
      message: "Fast production report generated successfully",
      data,
    });
  } catch (error) {
    console.error("Error in getFastProductionReportController:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
