import { Request, Response } from "express";
import {
  addMiscTeam,
  addMiscType,
  fetchMiscTeams,
  fetchMiscTypes,
  removeMiscTeam,
  removeMiscType,
  getPendingMiscellaneousLeads as getPendingMiscellaneousLeadsService,
  getPendingMiscellaneousLeadCountService
} from "../../services/leadModuleServices/miscellaneousMaster.service";
import logger from "../../../src/utils/logger";

const getParam = (param: string | string[] | undefined): string | undefined =>
  Array.isArray(param) ? param[0] : param;

/* ------------------------ Miscellaneous Type Master ------------------------ */

// CREATE Type
export const createMiscType = async (req: Request, res: Response) => {
  console.log("[CONTROLLER] createMiscType called", { body: req.body });

  try {
    const { vendor_id, name, created_by } = req.body;

    if (!vendor_id || !name || !created_by) {
      console.warn("[CONTROLLER] Missing fields", {
        vendor_id,
        name,
        created_by,
      });
      return res.status(400).json({
        success: false,
        error: "vendor_id, name, and created_by are required",
      });
    }

    const data = await addMiscType({ vendor_id, name, created_by });
    return res.status(201).json({ success: true, data });
  } catch (error: any) {
    console.error("[CONTROLLER] Error creating misc type", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// GET All Types
export const getMiscTypes = async (req: Request, res: Response) => {
  console.log("[CONTROLLER] getMiscTypes called", { params: req.params });

  try {
    const vendor_id = Number(getParam(req.params.vendor_id));
    if (!vendor_id) {
      return res.status(400).json({ error: "vendor_id is required" });
    }

    const list = await fetchMiscTypes(vendor_id);
    return res.status(200).json({ success: true, data: list });
  } catch (error: any) {
    console.error("[CONTROLLER] Error fetching misc types", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE Type
export const deleteMiscType = async (req: Request, res: Response) => {
  console.log("[CONTROLLER] deleteMiscType called", { params: req.params });

  try {
    const id = Number(getParam(req.params.id));
    if (!id) return res.status(400).json({ error: "id is required" });

    await removeMiscType(id);
    return res
      .status(200)
      .json({ success: true, message: "Type deleted successfully" });
  } catch (error: any) {
    console.error("[CONTROLLER] Error deleting misc type", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/* -------------------------- Miscellaneous Team Master -------------------------- */

// CREATE Team
export const createMiscTeam = async (req: Request, res: Response) => {
  console.log("[CONTROLLER] createMiscTeam called", { body: req.body });

  try {
    const { vendor_id, name, created_by } = req.body;

    if (!vendor_id || !name || !created_by) {
      return res.status(400).json({
        success: false,
        error: "vendor_id, name, and created_by are required",
      });
    }

    const data = await addMiscTeam({ vendor_id, name, created_by });
    return res.status(201).json({ success: true, data });
  } catch (error: any) {
    console.error("[CONTROLLER] Error creating misc team", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// GET All Teams
export const getMiscTeams = async (req: Request, res: Response) => {
  console.log("[CONTROLLER] getMiscTeams called", { params: req.params });

  try {
    const vendor_id = Number(getParam(req.params.vendor_id));
    if (!vendor_id)
      return res.status(400).json({ error: "vendor_id is required" });

    const list = await fetchMiscTeams(vendor_id);
    return res.status(200).json({ success: true, data: list });
  } catch (error: any) {
    console.error("[CONTROLLER] Error fetching misc teams", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE Team
export const deleteMiscTeam = async (req: Request, res: Response) => {
  console.log("[CONTROLLER] deleteMiscTeam called", { params: req.params });

  try {
    const id = Number(getParam(req.params.id));
    if (!id) return res.status(400).json({ error: "id is required" });

    await removeMiscTeam(id);
    return res
      .status(200)
      .json({ success: true, message: "Team deleted successfully" });
  } catch (error: any) {
    console.error("[CONTROLLER] Error deleting misc team", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};


// controllers/miscellaneous.controller.ts

export const  getPendingMiscellaneousLeads = async (req: Request, res: Response) => {
  try {
    const vendorId = Number(req.params.vendorId);
    const franchiseId = Number(req.body.franchise_id);
    const page = parseInt((req.body.page as string) || "1");
    const limit = parseInt((req.body.limit as string) || "10");

    // ============================
    // DATE RANGE VALIDATION
    // ============================

    let dateRange: { from: string; to: string } | undefined;

    if (req.body.date_range) {
      const { from, to } = req.body.date_range;

      if (from && isNaN(Date.parse(from))) {
        return res.status(400).json({
          success: false,
          message: "Invalid 'from' date format. Use YYYY-MM-DD",
        });
      }

      if (to && isNaN(Date.parse(to))) {
        return res.status(400).json({
          success: false,
          message: "Invalid 'to' date format. Use YYYY-MM-DD",
        });
      }

      // Normalize single date → range
      if (from && !to) {
        dateRange = { from, to: from };
      } else if (from && to) {
        if (new Date(from) > new Date(to)) {
          return res.status(400).json({
            success: false,
            message: "'from' date cannot be after 'to' date",
          });
        }
        dateRange = { from, to };
      } else if (!from && to) {
        dateRange = { from: to, to };
      }
    }

    // ============================
    // FILTER OBJECT
    // ============================

    const filters = {
      global_search: req.body.global_search,
      filter_lead_code: req.body.filter_lead_code,
      filter_name: req.body.filter_name,
      contact: req.body.contact,
      furniture_type: req.body.furniture_type,
      furniture_structure: req.body.furniture_structure,
      site_map_link: req.body.site_map_link,
      site_type: req.body.site_type,
      assign_to: req.body.assign_to,
      site_address: req.body.site_address,
      archetech_name: req.body.archetech_name,
      source: req.body.source,
      date_range: dateRange,
    };

    if (!vendorId || !franchiseId) {
      return res.status(400).json({
        success: false,
        message: "Vendor ID and Franchise ID are required",
      });
    }

    logger.info("[MiscellaneousController] getPendingMiscellaneousLeads called", {
      vendorId,
      page,
      limit,
    });

    // ============================
    // SERVICE CALL
    // ============================

    const { leads, count } = await getPendingMiscellaneousLeadsService(
      vendorId,
      franchiseId,
      page,
      limit,
      filters
    );

    return res.status(200).json({
      success: true,
      message: "Pending miscellaneous leads fetched successfully",
      count,
      data: leads,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalRecords: count,
        hasNext: page * limit < count,
        hasPrev: page > 1,
      },
    });

  } catch (error: any) {
    logger.error("[MiscellaneousController] getPendingMiscellaneousLeads Error", {
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};



export const  getPendingMiscellaneousLeadCount = async (req: Request, res: Response) => {
  try {
    const vendorId = Number(req.params.vendorId);
    const franchiseId = req.query.franchise_id
      ? Number(req.query.franchise_id)
      : undefined;

    if (!vendorId || !franchiseId) {
      return res.status(400).json({
        success: false,
        message: "Vendor ID and Franchise ID are required",
      });
    }

    const count = await getPendingMiscellaneousLeadCountService(
      vendorId,
      franchiseId
    );

    return res.status(200).json({
      success: true,
      pending_miscellaneous_leads: count,
    });

  } catch (error: any) {
    logger.error("[MiscellaneousController] Count Error", {
      error: error.message,
    });

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
