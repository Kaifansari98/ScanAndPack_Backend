import { Request, Response } from "express";
import {
  listTimeZones,
  getTimeZoneById,
  createTimeZone,
  updateTimeZone,
} from "../../services/timeZone/timeZone.service";

export const listTimeZonesController = async (req: Request, res: Response) => {
  try {
    const isActiveQuery = req.query.is_active;
    let isActive: boolean | undefined = undefined;
    if (isActiveQuery === "true") isActive = true;
    if (isActiveQuery === "false") isActive = false;

    const search = typeof req.query.search === "string" ? req.query.search : undefined;

    const timeZones = await listTimeZones({
      is_active: isActive,
      search,
    });

    return res.status(200).json({
      success: true,
      message: "Time zones fetched successfully",
      data: timeZones,
    });
  } catch (error: any) {
    console.error("Error fetching time zones:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Internal server error while fetching time zones",
    });
  }
};

export const getTimeZoneByIdController = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Valid time zone id is required",
      });
    }

    const timeZone = await getTimeZoneById(id);
    if (!timeZone) {
      return res.status(404).json({
        success: false,
        message: "Time zone not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Time zone fetched successfully",
      data: timeZone,
    });
  } catch (error: any) {
    console.error("Error fetching time zone by id:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Internal server error while fetching time zone",
    });
  }
};

export const createTimeZoneController = async (req: Request, res: Response) => {
  try {
    const { name, time_zone_code, is_active } = req.body ?? {};

    const created = await createTimeZone({
      name,
      time_zone_code,
      is_active,
    });

    return res.status(201).json({
      success: true,
      message: "Time zone created successfully",
      data: created,
    });
  } catch (error: any) {
    console.error("Error creating time zone:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Internal server error while creating time zone",
    });
  }
};

export const updateTimeZoneController = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Valid time zone id is required",
      });
    }

    const { name, is_active } = req.body ?? {};

    const updated = await updateTimeZone(id, {
      name,
      is_active,
    });

    return res.status(200).json({
      success: true,
      message: "Time zone updated successfully",
      data: updated,
    });
  } catch (error: any) {
    console.error("Error updating time zone:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Internal server error while updating time zone",
    });
  }
};
