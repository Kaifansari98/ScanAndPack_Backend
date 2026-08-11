import { Request, Response } from "express";
import {
  createFranchise,
  getFranchisesByVendorId,
  createHeadSiteSupervisorFranchiseMapping,
  updateHeadSiteSupervisorFranchiseMappingStatus,
  getHeadSiteSupervisorFranchiseMapping,
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

export const createHeadSiteSupervisorFranchiseMappingController = async (
  req: Request,
  res: Response
) => {
  try {
    const payload = req.body ?? {};
    const mapping = await createHeadSiteSupervisorFranchiseMapping(payload);

    return res.status(201).json({
      success: true,
      message: "Head site supervisor franchise mapping created successfully",
      data: mapping,
    });
  } catch (error: any) {
    console.error("Error creating head site supervisor mapping:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.message ||
        "Internal server error while creating head site supervisor mapping",
    });
  }
};

export const updateHeadSiteSupervisorFranchiseMappingStatusController = async (
  req: Request,
  res: Response
) => {
  try {
    const id = Number(req.params.id);
    const status = req.body?.status;

    const mapping = await updateHeadSiteSupervisorFranchiseMappingStatus(
      id,
      status
    );

    return res.status(200).json({
      success: true,
      message: "Head site supervisor franchise mapping status updated",
      data: mapping,
    });
  } catch (error: any) {
    console.error(
      "Error updating head site supervisor mapping status:",
      error
    );
    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.message ||
        "Internal server error while updating head site supervisor mapping status",
    });
  }
};

export const getHeadSiteSupervisorFranchiseMappingController = async (
  req: Request,
  res: Response
) => {
  try {
    const vendorId = Number(req.query.vendor_id);
    const franchiseId = Number(req.query.franchise_id);

    const mapping = await getHeadSiteSupervisorFranchiseMapping(
      vendorId,
      franchiseId
    );

    return res.status(200).json({
      success: true,
      message: "Head site supervisor franchise mapping fetched successfully",
      data: mapping,
    });
  } catch (error: any) {
    console.error(
      "Error fetching head site supervisor franchise mapping:",
      error
    );
    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.message ||
        "Internal server error while fetching head site supervisor franchise mapping",
    });
  }
};
