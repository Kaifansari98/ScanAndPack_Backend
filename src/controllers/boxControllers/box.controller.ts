import { Request, Response } from 'express';
import * as boxService from '../../services/boxServices/box.service';
import {
  getAllBoxesWithItemCountService,
  updateBoxStatus,
  // softDeleteBoxWithScanItems,
  // getGroupedItemInfoByBoxId,
  generateBoxPdfService,
  generateProjectBoxPdfService,
  generateAllBoxesPdfService,
  generateProjectFullReportService,
  markItemSiteInService,
  getBoxSiteInStatusService,
  generateProjectFullReportServiceWeb
} from '../../services/boxServices/box.service';
import { BoxStatus } from '../../prisma/generated';
import { ApiResponse } from '../../../src/utils/apiResponse';

export const createBox = async (
  req: Request,
  res: Response
) => {
  try {
    const newBox =
      await boxService.createBox({
        ...req.body,

        project_id:
          Number(req.body.project_id),

        project_details_id:
          req.body.project_details_id
            ? Number(
                req.body.project_details_id
              )
            : null,

        vendor_id:
          Number(req.body.vendor_id),

        lead_id:
          req.body.lead_id
            ? Number(req.body.lead_id)
            : null,

        created_by:
          req.body.created_by
            ? Number(req.body.created_by)
            : undefined,

        box_info_values:
          Array.isArray(
            req.body.box_info_values
          )
            ? req.body.box_info_values
            : [],
      });

    res.status(201).json({
      message: "Box created successfully",
      box: newBox,
    });
  } catch (err: any) {
    if (
      err.message ===
      "Box already exists"
    ) {
      return res
        .status(409)
        .json({
          message: err.message,
        });
    }

    res.status(400).json({
      error: err.message,
      message: err.message,
    });
  }
};

export const updateBoxName = async (
  req: Request,
  res: Response
) => {
  const {
    id,
    vendor_id,
    project_id,
    client_id,
    lead_id,
    box_name,
    box_info_values,
    updated_by,
  } = req.body;

  try {
    const updatedBox =
      await boxService.updateBoxName(
        Number(id),
        Number(vendor_id),
        Number(project_id),
        Number(
          lead_id || client_id
        ),
        String(box_name || ""),
        Array.isArray(box_info_values)
          ? box_info_values
          : [],
        updated_by
          ? Number(updated_by)
          : undefined
      );

    res.status(200).json(updatedBox);
  } catch (err: any) {
    throw err;
    if (
      err.message ===
      "Box not found"
    ) {
      return res
        .status(404)
        .json({
          message: err.message,
        });
    }

    if (
      err.message ===
      "Another box with the same name already exists"
    ) {
      return res
        .status(409)
        .json({
          message: err.message,
        });
    }

    res.status(400).json({
      error: err.message,
      message: err.message,
    });
  }
};

export const getAllBoxes = async (req: Request, res: Response) => {
  try {
    const boxes = await boxService.getAllBoxes();
    res.status(200).json(boxes);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const getBoxesByVendorAndProject = async (req: Request, res: Response) => {
  try {
    console.log("getBoxesByVendorAndProject");
    const vendorId = Number(req.params.vendorId);
    const projectId = Number(req.params.projectId);

    if (isNaN(vendorId) || isNaN(projectId)) {
      return res.status(400).json({ error: "Invalid vendorId or projectId" });
    }

    const boxes = await boxService.getBoxesByVendorAndProject(vendorId, projectId);

    res.status(200).json(boxes);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const getBoxDetailsWithItems = async (req: Request, res: Response) => {
  try {
    const vendorId = Number(req.params.vendorId);
    const projectId = Number(req.params.projectId);
    const clientId = Number(0);
    const boxId = Number(req.params.boxId);

    if ([vendorId, projectId, clientId, boxId].some(isNaN)) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    const data = await boxService.getBoxDetailsWithItems(vendorId, projectId, clientId, boxId);
    res.status(200).json(data);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

export const getAllBoxesWithItemCount = async (req: Request, res: Response) => {
  try {
    const vendorId = Number(req.params.vendorId);
    const projectId = Number(req.params.projectId);
    const clientId = Number(req.params.clientId);

    if ([vendorId, projectId, clientId].some(isNaN)) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    const data = await getAllBoxesWithItemCountService(vendorId, projectId, clientId);
    return res.status(200).json(data);
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

export const markBoxAsPacked = async (req: Request, res: Response) => {
  try {
    const {
      user_id,
    } =
      req.body;


    // console.log("user_id",user_id);return;
    const boxId = Number(req.params.boxId);
    if (isNaN(boxId)) return res.status(400).json({ error: 'Invalid boxId' });

    const updatedBox = await updateBoxStatus(boxId, BoxStatus.packed,user_id);
    res.status(200).json(updatedBox);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

export const markBoxAsUnpacked = async (req: Request, res: Response) => {
  try {
    const {
      user_id,
    } =
      req.body;
    const boxId = Number(req.params.boxId);
    if (isNaN(boxId)) return res.status(400).json({ error: 'Invalid boxId' });

    const updatedBox = await updateBoxStatus(boxId, BoxStatus.unpacked,user_id);
    res.status(200).json(updatedBox);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

// export const deleteBoxAndItsScanItems = async (req: Request, res: Response) => {
//   const boxId = Number(req.params.boxId);
//   const deletedBy = Number(req.body.deleted_by);

//   if (isNaN(boxId) || isNaN(deletedBy)) {
//     return res.status(400).json({ error: 'Invalid boxId or deleted_by' });
//   }

//   try {
//     const result = await softDeleteBoxWithScanItems(boxId, deletedBy);
//     res.status(200).json(result);
//   } catch (error: any) {
//     console.error('[Delete Box]', error);
//     res.status(500).json({ error: error.message || 'Failed to delete box' });
//   }
// };

// export const getGroupedItemInfo = async (req: Request, res: Response) => {
//   try {
//     const boxIdParam = Array.isArray(req.params.boxId)
//       ? req.params.boxId[0]
//       : req.params.boxId;
//     const boxId = Number(boxIdParam);
//     if (isNaN(boxId)) {
//       return res.status(400).json({ error: 'Invalid box ID' });
//     }

//     const result = await getGroupedItemInfoByBoxId(boxId);
//     if (!result) {
//       return res.status(404).json({ message: 'No grouped items found in this box' });
//     }

//     return res.status(200).json(result);
//   } catch (error) {
//     console.error('Error fetching grouped item info:', error);
//     return res.status(500).json({ error: 'Internal server error' });
//   }
// };

export const generateBoxPdf = async (req: Request, res: Response) => {
  try {
    const box_id = Number(req.params.boxId);
    const project_id = req.params.project_id;
    const vendor_id = Number(req.params.vendor_id);

    console.log(project_id)
    if (isNaN(box_id) || isNaN(vendor_id)) {
      return res.status(400).json(ApiResponse.error("Invalid parameters", 400));
    }
    if (isNaN(Number(project_id))) {
      console.log("generateBoxPdfService")
      const result = await boxService.generateBoxPdfServiceWeb(box_id, String(project_id), vendor_id);
      
      if (result.status === 0) {
        return res.status(200).json(ApiResponse.error(result.message, 500));
      }

      return res.status(200).json(
        ApiResponse.success(result.data, result.message, 200)
      );
    } else {
      console.log("generateBoxPdfServiceWeb")
      const result = await generateBoxPdfService(box_id, Number(project_id), vendor_id);
      if (result.status === 0) {
        return res.status(200).json(ApiResponse.error(result.message, 500));
      }

      return res.status(200).json(
        ApiResponse.success(result.data, result.message, 200)
      );
    }




  } catch (err) {
    console.error("generateBoxPdf controller error:", err);
    return res.status(500).json(ApiResponse.error("Internal server error", 500));
  }
};

export const generateProjectBoxPdf = async (req: Request, res: Response) => {
  try {

    const project_id = Number(req.params.project_id);
    const vendor_id = Number(req.params.vendor_id);

    if (isNaN(project_id) || isNaN(vendor_id)) {
      return res.status(400).json(ApiResponse.error("Invalid parameters", 400));
    }

    const result = await generateProjectBoxPdfService(project_id, vendor_id);

    if (result.status === 0) {
      return res.status(200).json(ApiResponse.error(result.message, 500));
    }

    return res.status(200).json(
      ApiResponse.success(result.data, result.message, 200)
    );
  } catch (err) {
    console.error("generateBoxPdf controller error:", err);
    return res.status(500).json(ApiResponse.error("Internal server error", 500));
  }
};


export const generateAllBoxesPdf = async (req: Request, res: Response) => {
  const project_id = Number(req.params.project_id);
  const vendor_id = Number(req.params.vendor_id);
  const result = await generateAllBoxesPdfService(project_id, vendor_id);
  if (result.status === 0) return res.status(200).json(ApiResponse.error(result.message, 500));
  return res.status(200).json(ApiResponse.success(result.data, result.message, 200));
};



export const generateProjectFullReport = async (
  req: Request,
  res: Response
) => {
  try {
    const project_id = req.params.project_id;
    const vendor_id = Number(req.params.vendor_id);

    if (!project_id || !vendor_id || Number.isNaN(vendor_id)) {
      return res
        .status(400)
        .json(ApiResponse.error("Invalid project_id or vendor_id", 400));
    }

    const numericProjectId = Number(project_id);

    const result = Number.isNaN(numericProjectId)
      ? await generateProjectFullReportServiceWeb(String(project_id), vendor_id)
      : await generateProjectFullReportService(numericProjectId, vendor_id);

    if (result.status === 0) {
      return res
        .status(500)
        .json(ApiResponse.error(result.message, 500));
    }

    return res
      .status(200)
      .json(ApiResponse.success(result.data, result.message, 200));
  } catch (error: any) {
    console.error("generateProjectFullReport error:", error);

    return res
      .status(500)
      .json(ApiResponse.error(error.message || "Failed to generate report", 500));
  }
};




export const markItemSiteIn = async (req: Request, res: Response) => {
  try {
    console.log(req.body);
    const box_id = Number(req.params.box_id);
    const project_id = Number(req.body.project_id);
    const vendor_id = Number(req.body.vendor_id);
    const user_id = Number(req.body.user_id);
    const unique_code = String(req.body.unique_code ?? "").trim();

    if ([box_id, project_id, vendor_id, user_id].some(isNaN) || !unique_code) {
      return res.status(400).json(ApiResponse.error("Invalid parameters", 400));
    }

    const result = await markItemSiteInService(
      unique_code, box_id, project_id, vendor_id, user_id
    );

    if (result.status === 0) {
      return res.status(200).json(ApiResponse.error(result.message, 500));
    }

    return res.status(200).json(ApiResponse.success(result.data, result.message, 200));
  } catch (err) {
    console.error("markItemSiteIn error:", err);
    return res.status(500).json(ApiResponse.error("Internal server error", 500));
  }
};

// GET /boxes/:box_id/site-in-status?project_id=&vendor_id=
export const getBoxSiteInStatus = async (req: Request, res: Response) => {
  try {
    const box_id = Number(req.params.box_id);
    const project_id = Number(req.query.project_id);
    const vendor_id = Number(req.query.vendor_id);

    if ([box_id, project_id, vendor_id].some(isNaN)) {
      return res.status(400).json(ApiResponse.error("Invalid parameters", 400));
    }

    const result = await getBoxSiteInStatusService(box_id, project_id, vendor_id);

    if (result.status === 0) {
      return res.status(200).json(ApiResponse.error(result.message, 500));
    }

    return res.status(200).json(ApiResponse.success(result.data, result.message, 200));
  } catch (err) {
    console.error("getBoxSiteInStatus error:", err);
    return res.status(500).json(ApiResponse.error("Internal server error", 500));
  }
};



export const getProjectBoxInfoFields = async (
  req: Request,
  res: Response
) => {
  try {
    const projectId =
      Number(req.params.projectId);

    const vendorId =
      Number(req.params.vendorId);

    if (
      !projectId ||
      !vendorId
    ) {
      return res.status(400).json({
        message:
          "Invalid projectId or vendorId",
        data: [],
      });
    }

    const fields =
      await boxService.getProjectBoxInfoFieldsService(
        projectId,
        vendorId
      );

    return res.status(200).json({
      success: true,
      message:
        "Box info fields fetched successfully",
      data: fields,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message:
        err.message ||
        "Failed to fetch box info fields",
      data: [],
    });
  }
};

export const getBoxInfoValues = async (
  req: Request,
  res: Response
) => {
  try {
    const boxId =
      Number(req.params.boxId);

    const projectId =
      Number(req.query.project_id);

    const vendorId =
      Number(req.query.vendor_id);

    if (
      !boxId ||
      !projectId ||
      !vendorId
    ) {
      return res.status(400).json({
        message:
          "Invalid boxId, project_id or vendor_id",
        data: [],
      });
    }

    const values =
      await boxService.getBoxInfoValuesService(
        boxId,
        projectId,
        vendorId
      );

    return res.status(200).json({
      success: true,
      message:
        "Box info values fetched successfully",
      data: values,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message:
        err.message ||
        "Failed to fetch box info values",
      data: [],
    });
  }
};