import { Request, Response } from "express";
import { ConfigureService } from "src/services/trackTraceServices/configure.service";
import logger from "src/utils/logger";

const configureService = new ConfigureService();

const getParam = (param: string | string[] | undefined): string | undefined =>
  Array.isArray(param) ? param[0] : param;

export const getVendorLeadsController = async (
  req: Request,
  res: Response
) => {
  try {
    const token = getParam(req.params.token);
    const projectId = getParam(req.params.projectId);

    if (!token || !projectId) {
      logger.warn("Missing required params", { params: req.params });

      return res.status(400).json({
        success: false,
        message: "token and projectId are required",
      });
    }

    logger.info("Incoming request for vendor leads", { token, projectId });

    const data = await configureService.getLeadsVendorById(token, projectId);

    return res.status(200).json({
      success: true,
      message: "Leads fetched successfully",
      data,
    });

  } catch (error: any) {
    logger.error("Error fetching vendor leads", { error });

    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};


export const getVendorLeadsControllerPost = async (
  req: Request,
  res: Response
) => {
  try {
    const token = getParam(req.params.token);
    const projectId = getParam(req.params.projectId);

    if (!token || !projectId) {
      return res.status(400).json({
        success: false,
        message: "token and projectId are required",
      });
    }

    // ✅ Pagination with defaults
    const page = parseInt(req.body.page || "1", 10);
    const limit = parseInt(req.body.limit || "20", 10);

    // ✅ Log incoming request
    console.log("Configure Request:", {
      token,
      projectId,
      page,
      limit,
      body: req.body,
    });

    // ✅ Date Range Normalization
    let dateRange: { from: string; to: string } | undefined;

    if (req.body.date_range) {
      const { from, to } = req.body.date_range;

      if (from && !to) dateRange = { from, to: from };
      else if (!from && to) dateRange = { from: to, to };
      else if (from && to) dateRange = { from, to };
    }

    const filters = {
      global_search: req.body.global_search,
      product_structure: req.body.product_structure,
      product_mapping: req.body.product_mapping,
      site_map_link: req.body.site_map_link,
      site_type: req.body.site_type,
      assign_to: req.body.assign_to,
      source: req.body.source,
      site_address: req.body.site_address,
      date_range: dateRange,
    };

    const { leads, count } = await configureService.getLeadsVendorByIdPost(
      token,
      projectId,
      page,
      limit,
      filters
    );

    // ✅ Log response
    console.log("Response:", { count, leadsLength: leads.length });

    return res.status(200).json({
      success: true,
      message: "Leads fetched successfully",
      count,
      data: leads, // ✅ Make sure this is 'data' not 'leads'
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalRecords: count,
        hasNext: page * limit < count,
        hasPrev: page > 1,
      },
    });
  } catch (error: any) {
    console.error("Error fetching vendor leads:", error);
    logger.error("Error fetching vendor leads", { error });

    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
      data: [], // ✅ Return empty array on error
      count: 0,
      pagination: {
        currentPage: 1,
        totalPages: 0,
        totalRecords: 0,
        hasNext: false,
        hasPrev: false,
      },
    });
  }
};


export const applyConfigurationController = async (
  req: Request,
  res: Response
) => {
  try {
    const { projectId, leadId } = req.body;

    // Basic validation
    if (!projectId || !leadId) {
      logger.warn("Missing required fields", { body: req.body });

      return res.status(400).json({
        success: false,
        message: "projectId and leadId are required",
      });
    }

    if (typeof leadId !== "number") {
      return res.status(400).json({
        success: false,
        message: "leadId must be a number",
      });
    }

    logger.info("Apply configuration API hit", { projectId, leadId });

    const result = await configureService.applyConfiguration(
      projectId,
      leadId
    );

    return res.status(200).json({
      success: true,
      message: "Configuration applied successfully",
      data: result,
    });

  } catch (error: any) {
    logger.error("Apply configuration failed", { error });

    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
}
