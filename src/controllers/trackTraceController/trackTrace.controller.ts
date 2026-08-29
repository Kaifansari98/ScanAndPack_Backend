import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import * as trackTraceService from "../../services/trackTraceServices/trackTrace.service";
import * as machineService from "../../services/machineService/machineService.service";
import {
  generateSignedUrl,
  uploadToWasabiCompanyVendorDocument,
} from "../../utils/wasabiClient";

import { ApiResponse } from "../../../src/utils/apiResponse";
import {
  CutListSavePayload,
  MarkDefectPayload,
  QRParam,
} from "../../../src/types/track-trace";
import { generateWarehouseQRPDF } from "../../utils/warehouse-qr-generator";

interface TrackTracePayload {
  project_id: number;
  vendor_id: number;
  machine_id: number;
  unique_code: string;
  created_by: number;
  box_id?: number;
}
export const scan_item_old = async (req: Request, res: Response) => {
  console.log("Query params:", req.body);

  let serviceResponse = await trackTraceService.updateScannedItem(
    req.body,
    false,
  );
  if (serviceResponse?.status == 0) {
    return res
      .status(200)
      .json(ApiResponse.error(serviceResponse?.message, 500));
  } else {
    return res
      .status(200)
      .json(
        ApiResponse.success(
          serviceResponse?.status,
          serviceResponse?.message,
          200,
        ),
      );
  }
};

export const scan_item = async (_req: Request, res: Response) => {
  //console.log(_req.body);

  const files = (_req.files ?? []) as Express.Multer.File[];
  try {
    const payload: TrackTracePayload = {
      project_id: Number(_req.body.project_id),
      vendor_id: Number(_req.body.vendor_id),
      machine_id: Number(_req.body.machine_id),
      unique_code: String(_req.body.unique_code),
      created_by: Number(_req.body.created_by),
      box_id: _req.body.box_id ? Number(_req.body.box_id) : undefined,
    };

    const serviceResponse = await trackTraceService.updateScannedItem(
      payload,
      false,
      files,
    );

    if (serviceResponse?.status == 0) {
      return res
        .status(200)
        .json(ApiResponse.error(serviceResponse?.message, 500));
    }

    return res
      .status(200)
      .json(
        ApiResponse.success(
          serviceResponse?.status,
          serviceResponse?.message,
          200,
        ),
      );
  } catch (err) {
    throw err;
  } finally {
    files.forEach((file) => {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    });
  }
};

export const check_item = async (req: Request, res: Response) => {
  console.log("Query params:", req.body);

  let serviceResponse = await trackTraceService.updateScannedItem(
    req.body,
    true,
  );
  console.log("serviceResponse:", serviceResponse);
  if (serviceResponse?.status == 0) {
    return res
      .status(200)
      .json(ApiResponse.error(serviceResponse?.message, 500));
  } else {
    let mappedItem = serviceResponse?.data;

    return res
      .status(200)
      .json(ApiResponse.success({ mappedItem }, serviceResponse?.message, 200));
  }
};

export const check_defect = async (req: Request, res: Response) => {
  console.log("Query params:", req.body);

  let serviceResponse = await trackTraceService.check_defect(req.body);
  if (serviceResponse?.status == 0) {
    return res
      .status(200)
      .json(ApiResponse.error(serviceResponse?.message, 500));
  } else {
    let mappedItem = serviceResponse?.data;

    return res
      .status(200)
      .json(ApiResponse.success({ mappedItem }, serviceResponse?.message, 200));
  }
};

export const get_defect = async (req: Request, res: Response) => {
  console.log("Query params:", req.body);

  const vendor_id = Number(req.params.vendor_id);
  let serviceResponse = await trackTraceService.get_defect(vendor_id);

  let defects = serviceResponse?.data;

  return res.status(200).json(ApiResponse.success({ defects }, "", 200));
};

export const getAllMachines = async (_req: Request, res: Response) => {
  console.log("Query params:", _req.query);
  // res.json(_req.params.vendor_id);

  try {
    const vendor_id = Number(_req.params.vendor_id);
    const user_id = Number(_req.params.user_id);

    const projects = await machineService.getAllMachines(vendor_id, user_id);

    console.log("machines", projects);

    return res.status(200).json(ApiResponse.success(projects, "", 200));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch machines", details: err });
  }
};

export const getTrackTraceDashboardPayload = (req: Request) => {
  const vendorIdRaw = req.params.vendor_id;

  if (!vendorIdRaw || isNaN(Number(vendorIdRaw))) {
    throw new Error("Invalid or missing vendor_id");
  }

  return {
    vendor_id: Number(vendorIdRaw),
    project_id: req.query.project_id ? String(req.query.project_id) : undefined,
    machine_id: req.query.machine_id ? String(req.query.machine_id) : undefined,
    created_by: req.query.created_by ? String(req.query.created_by) : undefined,
  };
};

export const getKPIS = async (req: Request, res: Response) => {
  try {
    const payload = await getTrackTraceDashboardPayload(req);
    console.log(payload);
    // const payload = {
    //     vendor_id: Number(req.query.vendor_id),
    //     project_id: Number(req.query.project_id),
    //     machine_id: Number(req.query.machine_id),
    //     unique_code: String(req.query.unique_code),
    //     created_by: Number(req.query.created_by),
    // };

    const response = await trackTraceService.getKPIS(payload);
    console.log(response);
    return res.status(200).json(ApiResponse.success(response, "", 200));
  } catch (error) {
    console.error("Error fetching KPIs:", error);
    return res.status(200).json(ApiResponse.error("Error fetching KPIs", 200));
  }
};

export const getRealTimeItemTracking = async (req: Request, res: Response) => {
  try {
    const payload = await getTrackTraceDashboardPayload(req);
    // const payload = {
    //     vendor_id: Number(req.query.vendor_id),
    //     project_id: Number(req.query.project_id),
    //     machine_id: Number(req.query.machine_id),
    //     unique_code: String(req.query.unique_code),
    //     created_by: Number(req.query.created_by),
    // };

    const response = await trackTraceService.getRealTimeItemTracking(payload);
    console.log(response);
    return res.status(200).json(ApiResponse.success(response, "", 200));
  } catch (error) {
    console.error("Error fetching KPIs:", error);
    return res.status(200).json(ApiResponse.error("Error fetching KPIs", 200));
  }
};

export const getMachineStatus = async (req: Request, res: Response) => {
  try {
    const payload = await getTrackTraceDashboardPayload(req);

    const response = await trackTraceService.getMachineStatus(payload);
    // console.log(response);
    return res.status(200).json(ApiResponse.success(response, "", 200));
  } catch (error) {
    console.error("Error fetching KPIs:", error);
    return res.status(200).json(ApiResponse.error("Error fetching KPIs", 200));
  }
};

export const getHourlyProduction = async (req: Request, res: Response) => {
  try {
    const payload = await getTrackTraceDashboardPayload(req);

    const response = await trackTraceService.getHourlyProduction(payload);
    console.log(response);
    return res.status(200).json(ApiResponse.success(response, "", 200));
  } catch (error) {
    console.error("Error fetching KPIs:", error);
    return res.status(200).json(ApiResponse.error("Error fetching KPIs", 200));
  }
};

export const getMachineUtilization = async (req: Request, res: Response) => {
  try {
    const payload = await getTrackTraceDashboardPayload(req);

    const response = await trackTraceService.getMachineUtilization(payload);
    console.log(response);
    return res.status(200).json(ApiResponse.success(response, "", 200));
  } catch (error) {
    console.error("Error fetching KPIs:", error);
    return res.status(200).json(ApiResponse.error("Error fetching KPIs", 200));
  }
};
export const getTopPerformer = async (req: Request, res: Response) => {
  try {
    const payload = await getTrackTraceDashboardPayload(req);

    const response = await trackTraceService.getTopPerformer(payload);
    console.log(response);
    return res.status(200).json(ApiResponse.success(response, "", 200));
  } catch (error) {
    console.error("Error fetching KPIs:", error);
    return res.status(200).json(ApiResponse.error("Error fetching KPIs", 200));
  }
};

export const getProjectProgress = async (req: Request, res: Response) => {
  try {
    const payload = await getTrackTraceDashboardPayload(req);

    const response = await trackTraceService.getProjectProgress(payload);
    console.log(response);
    return res.status(200).json(ApiResponse.success(response, "", 200));
  } catch (error) {
    console.error("Error fetching KPIs:", error);
    return res.status(200).json(ApiResponse.error("Error fetching KPIs", 200));
  }
};

export const getBottleNeck = async (req: Request, res: Response) => {
  try {
    const payload = await getTrackTraceDashboardPayload(req);

    const response = await trackTraceService.getBottleNeck(payload);
    console.log(response);
    return res.status(200).json(ApiResponse.success(response, "", 200));
  } catch (error) {
    console.error("Error fetching KPIs:", error);
    return res.status(200).json(ApiResponse.error("Error fetching KPIs", 200));
  }
};

export const get_filter_track_trace = async (_req: Request, res: Response) => {
  console.log("Query params:", _req.query);
  // res.json(_req.params.vendor_id);

  try {
    const vendor_id = Number(_req.params.vendor_id);

    const projects =
      await trackTraceService.getAllProjectsByVendorId(vendor_id);
    const machines =
      await trackTraceService.getAllMachinesByVendorId(vendor_id);
    const users = await trackTraceService.getAllUsersByVendorId(vendor_id);

    const response = {
      project: projects,
      machine: machines,
      user: users,
    };

    return res.status(200).json(ApiResponse.success(response, "", 200));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch projects", details: err });
  }
};

export const getCutListMachine = async (_req: Request, res: Response) => {
  try {
    const vendor_id = Number(_req.params.vendor_id);
    const project_id = String(_req.params.project_id);

    if (!vendor_id || isNaN(vendor_id)) {
      return res
        .status(400)
        .json(ApiResponse.error("Invalid vendor_id provided", 400));
    }

    if (!project_id || project_id === "undefined") {
      return res
        .status(400)
        .json(ApiResponse.error("Invalid project_id provided", 400));
    }

    const projects = await trackTraceService.getCutListMachine(
      vendor_id,
      project_id,
    );

    return res
      .status(200)
      .json(ApiResponse.success({ cutlist: projects }, "", 200));
  } catch (err: any) {
    console.error("getCutListMachine error:", err);

    if (err.statusCode) {
      return res
        .status(err.statusCode)
        .json(ApiResponse.error(err.message, err.statusCode));
    }

    return res
      .status(500)
      .json(ApiResponse.error("Failed to fetch cut list machine data", 500));
  }
};

export const assignMachine = async (_req: Request, res: Response) => {
  try {
    // Validate required fields
    const {
      project_id,
      vendor_id,
      cutListIds,
      machine_id,
      machine_name,
      assigned,
      user_role,
    } = _req.body;

    if (!project_id || project_id === "undefined") {
      return res
        .status(400)
        .json(ApiResponse.error("project_id is required", 400));
    }

    if (!vendor_id || isNaN(Number(vendor_id))) {
      return res
        .status(400)
        .json(ApiResponse.error("Valid vendor_id is required", 400));
    }

    if (!cutListIds) {
      return res
        .status(400)
        .json(ApiResponse.error("cutListIds is required", 400));
    }

    if (!machine_id || isNaN(Number(machine_id))) {
      return res
        .status(400)
        .json(ApiResponse.error("Valid machine_id is required", 400));
    }

    if (!machine_name || machine_name === "undefined") {
      return res
        .status(400)
        .json(ApiResponse.error("machine_name is required", 400));
    }

    if (assigned === undefined || assigned === null) {
      return res
        .status(400)
        .json(ApiResponse.error("assigned field is required", 400));
    }

    const payload: CutListSavePayload = {
      project_id: String(project_id),
      vendor_id: Number(vendor_id),
      cutListIds: String(cutListIds),
      machine_id: Number(machine_id),
      machine_name: String(machine_name),
      assigned: Boolean(assigned),
      created_by: Number(vendor_id),
      user_role: user_role ? String(user_role) : undefined,
    };

    const serviceResponse = await trackTraceService.assignMachine(payload);

    if (serviceResponse.status === 0) {
      return res
        .status(400)
        .json(ApiResponse.error(serviceResponse.message, 400));
    }

    return res
      .status(200)
      .json(
        ApiResponse.success(
          serviceResponse.status,
          serviceResponse.message,
          200,
        ),
      );
  } catch (err: any) {
    console.error("assignMachine error:", err);

    if (err.statusCode) {
      return res
        .status(err.statusCode)
        .json(ApiResponse.error(err.message, err.statusCode));
    }

    return res
      .status(500)
      .json(ApiResponse.error("Failed to assign machine", 500));
  }
};

// import { generateQrLabel } from "../../utils/qr-label";
// import { generateMultiQRLabel } from "../../utils/multi-qr-label";

export const createQR = async (_req: Request, res: Response) => {
  console.log("Query params:", _req.body);

  const payload: QRParam = {
    vendorId: Number(_req.body.vendorId),
    projectId: String(_req.body.projectId),
    cutListIds: String(_req.body.cutListIds),
  };

  console.log(payload);

  try {
    const data = await trackTraceService.createQR(payload);
    const baseUrl =
      process.env.PUBLIC_BASE_URL || `${_req.protocol}://${_req.get("host")}`;
    console.log("[downloadCutListExcel] baseUrl", baseUrl);

    if (data) {
      const filePath = await generateWarehouseQRPDF({
        itemQRs: data.map((item: any) => ({
          value: item.cut_list.unique_code,
          itemCode: item.cut_list.unique_code,
          itemName: item.cut_list.description || "",
          columns: 3,
        })),
        baseUrl,
      });
      const filename = path.basename(filePath);
      const fileUrl = `${baseUrl}/api/track-trace/qr-labels/${filename}`;
      return res.status(200).json(ApiResponse.success(fileUrl, "", 200));
    } else {
      return res.status(200).json(ApiResponse.error("No data avialbale", 200));
    }
  } catch (err) {
    return res.status(200).json(ApiResponse.error("", 500));
  }
};

export const downloadQrLabelsFile = async (req: Request, res: Response) => {
  try {
    const filename = String(req.params.filename || "").trim();
    if (!filename) {
      return res
        .status(400)
        .json(ApiResponse.error("Filename is required", 400));
    }

    const filePath = path.join(
      process.cwd(),
      "assets",
      "track-trace",
      "qr",
      filename,
    );

    if (!fs.existsSync(filePath)) {
      return res.status(404).json(ApiResponse.error("File not found", 404));
    }

    return res.download(filePath, filename);
  } catch (error: any) {
    console.error("Error serving QR labels:", error);
    return res.status(500).json(ApiResponse.error("Failed to serve file", 500));
  }
};

export const downloadCutListExcel = async (_req: Request, res: Response) => {
  try {
    const searchParams = _req.body.searchParams;
    const vendorId = _req.body.vendorId;
    const baseUrl =
      process.env.PUBLIC_BASE_URL || `${_req.protocol}://${_req.get("host")}`;
    console.log("vendorId", vendorId);
    const unique_project_id = _req.body.unique_project_id; // searchParams.get('unique_project_id');

    if (!unique_project_id) {
      return res
        .status(200)
        .json(ApiResponse.error("Project Id is required", 200));
    }

    // Generate Excel
    const filename = await trackTraceService.downloadCutListExcel(
      vendorId,
      unique_project_id,
      baseUrl,
    );
    const fileUrl = `${baseUrl}/api/track-trace/cutlist-excel/${filename}`;
    console.log("[downloadCutListExcel] fileUrl", fileUrl);

    // Return Excel file

    return res.status(200).json(ApiResponse.success(fileUrl, "", 200));
  } catch (error: any) {
    console.error("Error downloading Excel:", error);
  }
};

export const downloadCutListExcelFile = async (req: Request, res: Response) => {
  try {
    const filename = String(req.params.filename || "").trim();
    if (!filename) {
      return res
        .status(400)
        .json(ApiResponse.error("Filename is required", 400));
    }

    const filePath = path.join(
      process.cwd(),
      "public",
      "assets",
      "track-trace",
      "excel",
      filename,
    );

    if (!fs.existsSync(filePath)) {
      return res.status(404).json(ApiResponse.error("File not found", 404));
    }

    return res.download(filePath, filename);
  } catch (error: any) {
    console.error("Error serving Excel file:", error);
    return res.status(500).json(ApiResponse.error("Failed to serve file", 500));
  }
};

export const getVendorLead = async (_req: Request, res: Response) => {
  console.log("Query params:", _req.query);
  // res.json(_req.params.vendor_id);

  try {
    const vendor_id = Number(_req.params.vendor_id);
    const search = String(_req.params.search);

    const leads = await trackTraceService.getVendorLead(vendor_id, search);

    const response = {
      leads: leads,
    };

    return res.status(200).json(ApiResponse.success(response, "", 200));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch projects", details: err });
  }
};

export const linkLeadToProject = async (_req: Request, res: Response) => {
  console.log("Query params:", _req.body.lead_id);
  // res.json(_req.params.vendor_id);

  try {
    const project_id = Number(_req.params.project_id);

    const vendor_id = Number(_req.body.vendor_id);
    const lead_id = Number(_req.body.lead_id);

    const leads = await trackTraceService.linkLeadToProject(
      vendor_id,
      lead_id,
      project_id,
    );

    const response = {
      leads: leads,
    };

    return res.status(200).json(ApiResponse.success(response, "", 200));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch projects", details: err });
  }
};

export const mark_Defect = async (_req: Request, res: Response) => {
  // console.log("-----------------");
  console.log(_req.body);

  const files = (_req.files ?? []) as Express.Multer.File[];
  try {
    if (files.length === 0) {
      return res
        .status(200)
        .json(ApiResponse.error("At least 1 photo is required", 422));
    }

    const vendorId = Number(_req.body.vendor_id);
    console.log("vendorId", vendorId);

    // create defected item first to get the ID for the wasabi path
    const payload: MarkDefectPayload = {
      vendor_id: vendorId,
      project_id: Number(_req.body.project_id),
      cut_list_machine_mapping_id: Number(
        _req.body.cut_list_machine_mapping_id,
      ),
      cut_list_id: Number(_req.body.cut_list_id),
      machine_id: Number(_req.body.machine_id),
      unique_code: String(_req.body.unique_code),
      created_by: Number(_req.body.created_by),
      defect_id: Number(_req.body.defect_id),
      defect_name: String(_req.body.defect_name),
      action: String(_req.body.defect_type),
      rework_machine_id: Number(_req.body.rework_machine_id),
      images: [],
    };

    const serviceResponse = await trackTraceService.mark_Defect(
      payload,
      files,
      vendorId,
    );
    console.log(serviceResponse);
    if (serviceResponse.status == 0) {
      return res
        .status(200)
        .json(ApiResponse.error(serviceResponse.message, 500));
    }

    return res
      .status(200)
      .json(
        ApiResponse.success(
          serviceResponse.status,
          serviceResponse.message,
          200,
        ),
      );
  } catch (err) {
    throw err;
  } finally {
    // cleanup tmp files regardless of success/failure
    files.forEach((file) => {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    });
  }
};

// export const mark_Defect_old = async (_req: Request, res: Response) => {

//     console.log("Query params:", _req.body);
//     // res.json(_req.params.vendor_id);

//     try {

//         const payload: MarkDefectPayload = {
//             vendor_id: Number(_req.body.vendor_id),
//             project_id: Number(_req.body.project_id),
//             cut_list_machine_mapping_id: Number(_req.body.cut_list_machine_mapping_id),
//             cut_list_id: Number(_req.body.cut_list_id),
//             machine_id: Number(_req.body.machine_id),
//             unique_code: String(_req.body.unique_code),
//             created_by: Number(_req.body.created_by),
//             defect_id: Number(_req.body.defect_id),
//             defect_name: String(_req.body.defect_name)
//         };

//         console.log("payload", payload);
//         // const vendor_id = Number(_req.params.vendor_id);
//         // const project_id = String(_req.params.project_id);

//         const serviceResponse = await trackTraceService.mark_Defect(payload);

//         if (serviceResponse.status == 0) {
//             return res
//                 .status(200)
//                 .json(
//                     ApiResponse.error(
//                         serviceResponse.message,
//                         500
//                     )
//                 );
//         } else {
//             return res
//                 .status(200)
//                 .json(
//                     ApiResponse.success(
//                         serviceResponse.status,
//                         serviceResponse.message,
//                         200
//                     )
//                 );
//         }
//     } catch (err) {

//         throw err;
//         return res
//             .status(200)
//             .json(
//                 ApiResponse.error(
//                     "Error",
//                     500
//                 )
//             );
//     }
// }

export const getScanStatsDashboard = async (req: Request, res: Response) => {
  const vendor_id = Number(req.params.vendor_id);
  const user_id = Number(req.params.user_id);

  let serviceResponse = await trackTraceService.getScanStatsDashboard(
    vendor_id,
    user_id,
  );
  if (serviceResponse?.status == 0) {
    return res
      .status(200)
      .json(ApiResponse.error(serviceResponse?.message, 500));
  } else {
    let scanItem = serviceResponse?.data;

    return res
      .status(200)
      .json(ApiResponse.success({ scanItem }, serviceResponse?.message, 200));
  }
};

export const getReworkMachines = async (_req: Request, res: Response) => {
  try {
    // console.log(_req.params);return;
    const vendor_id = Number(_req.params.vendor_id);
    const machine_id = Number(_req.params.machine_id);

    const serviceResponse = await trackTraceService.getReworkMachines(
      vendor_id,
      machine_id,
    );

    return res
      .status(200)
      .json(ApiResponse.success({ serviceResponse }, "Machines fetched", 200));
  } catch (err) {
    throw err;
  }
};

// controller
export const getUserModules = async (_req: Request, res: Response) => {
  const { vendor_id, user_id } = _req.params;
  const serviceResponse = await trackTraceService.getUserModules(
    Number(vendor_id),
    Number(user_id),
  );
  if (serviceResponse.status == 0) {
    return res
      .status(200)
      .json(ApiResponse.error(serviceResponse.message, 500));
  }
  return res
    .status(200)
    .json(ApiResponse.success(serviceResponse.data, "", 200));
};

export const getQualityCheckProjects = async (req: Request, res: Response) => {
  const { vendor_id } = req.params;
  const page = req.query.page ? Number(req.query.page) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const search = req.query.search ? String(req.query.search).trim() : undefined;
  const status = req.query.status ? String(req.query.status).trim() : undefined;

  const serviceResponse = await trackTraceService.getQualityCheckProjects(
    Number(vendor_id),
    { page, limit, search, status },
  );
  if (serviceResponse.status == 0) {
    return res
      .status(200)
      .json(ApiResponse.error(serviceResponse.message, 500));
  }
  return res
    .status(200)
    .json(ApiResponse.success(serviceResponse.data, "", 200));
};

export const getTraceTraceDashboard = async (_req: Request, res: Response) => {
  const { vendor_id } = _req.params;
  const status = (_req.query.status as string) || (_req.query.filter as string) || "all";
  const serviceResponse = await trackTraceService.getTraceTraceDashboard(
    Number(vendor_id),
    status,
  );
  if (serviceResponse.status == 0) {
    return res
      .status(200)
      .json(ApiResponse.error(serviceResponse.message, 500));
  }
  return res
    .status(200)
    .json(ApiResponse.success(serviceResponse.data, "", 200));
};

export const getProjectCategories = async (_req: Request, res: Response) => {
  const { vendor_id } = _req.params;
  const { search, status, type, page, limit, sort_by, sort_order } = _req.query;

  const serviceResponse = await trackTraceService.getProjectCategories(
    Number(vendor_id),
    {
      search: search ? String(search) : undefined,
      status: status ? String(status) : undefined,
      type: type ? String(type) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      sort_by: sort_by ? String(sort_by) : undefined,
      sort_order: (sort_order as "asc" | "desc") || undefined,
    }
  );
  if (serviceResponse.status == 0) {
    return res
      .status(200)
      .json(ApiResponse.error(serviceResponse.message, 500));
  }
  return res
    .status(200)
    .json(ApiResponse.success(serviceResponse.data, "", 200));
};

export const getProjectCategoryTypes = async (_req: Request, res: Response) => {
  const { vendor_id } = _req.params;
  const serviceResponse = await trackTraceService.getProjectCategoryTypes();
  if (serviceResponse.status == 0) {
    return res
      .status(200)
      .json(ApiResponse.error(serviceResponse.message, 500));
  }
  return res
    .status(200)
    .json(ApiResponse.success(serviceResponse.data, "", 200));
};

// Controller
export const createProjectCategory = async (_req: Request, res: Response) => {
  const {
    vendor_id,
    category_name,
    type_ids,
    created_by,
    parent_id,
    include_in_packing,
    scan_pack_validate,
    use_in_assembled_packing,
    prefix,
    naming_structure,
  } = _req.body;

  const serviceResponse = await trackTraceService.createProjectCategory(
    Number(vendor_id),
    String(category_name),
    Array.isArray(type_ids) ? type_ids.map(Number) : [],
    Number(created_by),
    parent_id ? Number(parent_id) : null,
    include_in_packing !== undefined ? Boolean(include_in_packing) : false,
    scan_pack_validate !== undefined ? Boolean(scan_pack_validate) : false,
    use_in_assembled_packing !== undefined
      ? Boolean(use_in_assembled_packing)
      : false,
    prefix ? String(prefix) : null,
    naming_structure || null,
  );

  if (serviceResponse.status == 0) {
    return res
      .status(200)
      .json(ApiResponse.error(serviceResponse.message, 500));
  }
  return res
    .status(200)
    .json(ApiResponse.success(serviceResponse.data, "", 200));
};

export const updateProjectCategory = async (_req: Request, res: Response) => {
  const {
    id,
    vendor_id,
    category_name,
    type_ids,
    updated_by,
    status,
    parent_id,
    include_in_packing,
    scan_pack_validate,
    use_in_assembled_packing,
    prefix,
    naming_structure,
  } = _req.body;

  const serviceResponse = await trackTraceService.updateProjectCategory(
    Number(id),
    Number(vendor_id),
    String(category_name),
    status as "Yes" | "No",
    Array.isArray(type_ids) ? type_ids.map(Number) : [],
    Number(updated_by),
    parent_id ? Number(parent_id) : null,
    include_in_packing !== undefined ? Boolean(include_in_packing) : undefined,
    scan_pack_validate !== undefined ? Boolean(scan_pack_validate) : undefined,
    use_in_assembled_packing !== undefined
      ? Boolean(use_in_assembled_packing)
      : undefined,
    prefix !== undefined ? (prefix ? String(prefix) : null) : undefined,
    naming_structure || null,
  );

  if (serviceResponse.status == 0) {
    return res
      .status(200)
      .json(ApiResponse.error(serviceResponse.message, 500));
  }
  return res
    .status(200)
    .json(ApiResponse.success(serviceResponse.data, "", 200));
};

// Brand Master Controllers
export const getBrandMasters = async (req: Request, res: Response) => {
  const vendor_id = Number(req.params.vendor_id);
  const result = await trackTraceService.getBrandMasters(vendor_id);
  return res
    .status(200)
    .json(
      result.status
        ? ApiResponse.success(result.data, result.message, 200)
        : ApiResponse.error(result.message, 400),
    );
};

export const createBrandMaster = async (req: Request, res: Response) => {
  const { vendor_id, brand_name, brand_short_name, logo, created_by } =
    req.body;
  const result = await trackTraceService.createBrandMaster(
    Number(vendor_id),
    String(brand_name),
    brand_short_name,
    logo,
    created_by ? Number(created_by) : null,
  );
  return res
    .status(200)
    .json(
      result.status
        ? ApiResponse.success(result.data, result.message, 200)
        : ApiResponse.error(result.message, 400),
    );
};

export const updateBrandMaster = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const {
    vendor_id,
    brand_name,
    brand_short_name,
    logo,
    is_active,
    updated_by,
  } = req.body;
  const result = await trackTraceService.updateBrandMaster(
    id,
    Number(vendor_id),
    String(brand_name),
    brand_short_name,
    logo,
    is_active,
    updated_by ? Number(updated_by) : null,
  );
  return res
    .status(200)
    .json(
      result.status
        ? ApiResponse.success(result.data, result.message, 200)
        : ApiResponse.error(result.message, 400),
    );
};

export const toggleBrandMasterStatus = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { is_active } = req.body;
  const result = await trackTraceService.toggleBrandMasterStatus(
    id,
    Boolean(is_active),
  );
  return res
    .status(200)
    .json(
      result.status
        ? ApiResponse.success(result.data, result.message, 200)
        : ApiResponse.error(result.message, 400),
    );
};

export const deleteBrandMaster = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const vendor_id = Number(req.body.vendor_id || req.query.vendor_id || 0);
  const result = await trackTraceService.deleteBrandMaster(id, vendor_id);
  return res
    .status(200)
    .json(
      result.status
        ? ApiResponse.success(result.data, result.message, 200)
        : ApiResponse.error(result.message, 400),
    );
};

export const toggleProjectCategoryStatus = async (
  _req: Request,
  res: Response,
) => {
  const id = _req.params.id || _req.body.id;
  const { status } = _req.body;

  const serviceResponse = await trackTraceService.toggleProjectCategoryStatus(
    Number(id),
    status as "Yes" | "No",
  );

  if (serviceResponse.status == 0) {
    return res
      .status(200)
      .json(ApiResponse.error(serviceResponse.message, 500));
  }
  return res
    .status(200)
    .json(ApiResponse.success(serviceResponse.data, "", 200));
};

export const unsetBoxFromMapping = async (req: Request, res: Response) => {
  try {
    console.log("req.params:", req.params);
    const mapping_id = Number(req.params.id);
    const project_id = Number(req.params.project_id ?? req.params.project_id);
    const vendor_id = Number(req.params.vendor_id ?? req.params.vendor_id);

    if (isNaN(mapping_id) || isNaN(project_id) || isNaN(vendor_id)) {
      return res
        .status(400)
        .json(ApiResponse.error("Invalid id, project_id or vendor_id", 400));
    }

    const result = await trackTraceService.unsetBoxFromMappingService(
      mapping_id,
      project_id,
      vendor_id,
    );

    if (result.status === 0) {
      return res.status(200).json(ApiResponse.error(result.message, 500));
    }

    return res
      .status(200)
      .json(ApiResponse.success(result.data, result.message, 200));
  } catch (err) {
    console.error("unsetBoxFromMapping controller error:", err);
    return res
      .status(500)
      .json(ApiResponse.error("Internal server error", 500));
  }
};

export const markBoxFactoryOut = async (req: Request, res: Response) => {
  try {
    const box_id = Number(req.params.box_id);
    const project_id = Number(req.body.project_id);
    const vendor_id = Number(req.body.vendor_id);
    const user_id = Number(req.body.user_id);

    if ([box_id, project_id, vendor_id, user_id].some(isNaN)) {
      return res.status(400).json(ApiResponse.error("Invalid parameters", 400));
    }

    const result = await trackTraceService.markBoxFactoryOutService(
      box_id,
      project_id,
      vendor_id,
      user_id,
    );

    if (result.status === 0) {
      return res.status(200).json(ApiResponse.error(result.message, 500));
    }

    return res
      .status(200)
      .json(ApiResponse.success(result.data, result.message, 200));
  } catch (err) {
    console.error("markBoxFactoryOut error:", err);
    return res
      .status(500)
      .json(ApiResponse.error("Internal server error", 500));
  }
};

export const markBoxSiteIn = async (req: Request, res: Response) => {
  try {
    const box_id = Number(req.params.box_id);
    const project_id = Number(req.body.project_id);
    const vendor_id = Number(req.body.vendor_id);
    const user_id = Number(req.body.user_id);

    if ([box_id, project_id, vendor_id, user_id].some(isNaN)) {
      return res.status(400).json(ApiResponse.error("Invalid parameters", 400));
    }

    const result = await trackTraceService.markBoxSiteInService(
      box_id,
      project_id,
      vendor_id,
      user_id,
    );

    if (result.status === 0) {
      return res.status(200).json(ApiResponse.error(result.message, 500));
    }

    return res
      .status(200)
      .json(ApiResponse.success(result.data, result.message, 200));
  } catch (err) {
    console.error("markBoxSiteIn error:", err);
    return res
      .status(500)
      .json(ApiResponse.error("Internal server error", 500));
  }
};

// POST /project-categories/sync
export const syncCategories = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.body.vendor_id ?? req.query.vendor_id);
    if (isNaN(vendor_id)) {
      return res.status(400).json(ApiResponse.error("Invalid vendor_id", 400));
    }

    const result =
      await trackTraceService.syncCategoriesFromExternalService(vendor_id);

    if (result.status === 0) {
      return res.status(200).json(ApiResponse.error(result.message, 500));
    }

    return res
      .status(200)
      .json(ApiResponse.success(result.data, result.message, 200));
  } catch (err) {
    console.error("syncCategories error:", err);
    return res
      .status(500)
      .json(ApiResponse.error("Internal server error", 500));
  }
};

// GET /project-categories/check-token?vendor_id=
export const checkToken = async (req: Request, res: Response) => {
  console.log("checkToken", req.query);
  try {
    const vendor_id = Number(req.query.vendor_id);
    if (isNaN(vendor_id)) {
      return res.status(400).json(ApiResponse.error("Invalid vendor_id", 400));
    }

    const result = await trackTraceService.checkExternalTokenService(vendor_id);
    return res
      .status(200)
      .json(ApiResponse.success(result.data, result.message, 200));
  } catch (err) {
    console.error("checkToken error:", err);
    return res
      .status(500)
      .json(ApiResponse.error("Internal server error", 500));
  }
};

// GET /track-trace/project-detail/:vendor_id/:project_id
export const getProjectDetail = async (req: Request, res: Response) => {
  try {
    console.log("getProjectDetailsss", req.params);
    const vendor_id = Number(req.params.vendor_id);
    const project_id = String(req.params.project_id);
    if (isNaN(vendor_id))
      return res.status(400).json(ApiResponse.error("Invalid params", 400));

    const search = req.query.search ? String(req.query.search).trim() : undefined;
    const group = req.query.group ? String(req.query.group).trim() : undefined;
    const category = req.query.category ? String(req.query.category).trim() : undefined;
    const machine_id = req.query.machine_id ? String(req.query.machine_id).trim() : undefined;
    const box_id = req.query.box_id ? String(req.query.box_id).trim() : undefined;
    const box_status = req.query.box_status ? String(req.query.box_status).trim() : undefined;
    const page = req.query.page ? String(req.query.page).trim() : undefined;
    const limit = req.query.limit ? String(req.query.limit).trim() : undefined;

    const result = await trackTraceService.getProjectDetailService(
      vendor_id,
      project_id,
      { search, group, category, machine_id, box_id, box_status, page, limit }
    );
    console.log("result", result);
    if (result.status === 0)
      return res.status(404).json(ApiResponse.error(result.message, 404));

    return res
      .status(200)
      .json(ApiResponse.success(result.data, result.message, 200));
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json(ApiResponse.error("Internal server error", 500));
  }
};

// GET /track-trace/project-detail/:vendor_id/:project_id/box/:box_id
export const getBoxItems = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.params.vendor_id);
    const project_id = String(req.params.project_id);
    const box_id = Number(req.params.box_id);
    if ([vendor_id, box_id].some(isNaN))
      return res.status(400).json(ApiResponse.error("Invalid params", 400));

    const result = await trackTraceService.getBoxItemsService(
      vendor_id,
      project_id,
      box_id,
    );
    if (result.status === 0)
      return res.status(404).json(ApiResponse.error(result.message, 404));

    return res
      .status(200)
      .json(ApiResponse.success(result.data, result.message, 200));
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json(ApiResponse.error("Internal server error", 500));
  }
};

// GET /track-trace/project-detail/:vendor_id/:project_id/cut-list
export const getProjectCutList = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.params.vendor_id);

    const project_id = String(req.params.project_id ?? "").trim();

    if (!vendor_id || Number.isNaN(vendor_id) || !project_id) {
      return res
        .status(400)
        .json(ApiResponse.error("Invalid vendor_id or project_id", 400));
    }

    /*
    |--------------------------------------------------------------------------
    | Query params
    |--------------------------------------------------------------------------
    */

    const page = req.query.page !== undefined ? Number(req.query.page) : 1;

    const limit = req.query.limit !== undefined ? Number(req.query.limit) : 25;

    const machine_id =
      req.query.machine_id !== undefined && req.query.machine_id !== ""
        ? Number(req.query.machine_id)
        : null;

    const box_id =
      req.query.box_id !== undefined && req.query.box_id !== ""
        ? Number(req.query.box_id)
        : null;

    const min_weight =
      req.query.min_weight !== undefined && req.query.min_weight !== ""
        ? Number(req.query.min_weight)
        : null;

    const max_weight =
      req.query.max_weight !== undefined && req.query.max_weight !== ""
        ? Number(req.query.max_weight)
        : null;

    /*
    |--------------------------------------------------------------------------
    | Reject malformed number filters
    |--------------------------------------------------------------------------
    */

    if (
      Number.isNaN(page) ||
      Number.isNaN(limit) ||
      (machine_id !== null && Number.isNaN(machine_id)) ||
      (box_id !== null && Number.isNaN(box_id)) ||
      (min_weight !== null && Number.isNaN(min_weight)) ||
      (max_weight !== null && Number.isNaN(max_weight))
    ) {
      return res
        .status(400)
        .json(ApiResponse.error("Invalid numeric filter", 400));
    }

    const result = await trackTraceService.getProjectCutListPaginatedService(
      vendor_id,
      project_id,
      {
        page,
        limit,

        search: String(req.query.search ?? ""),

        group: String(req.query.group ?? "all"),

        category: String(req.query.category ?? "all"),

        machine_id,

        machine_status: String(req.query.machine_status ?? "all") as
          | "all"
          | "done"
          | "pending",

        packing_status: String(req.query.packing_status ?? "all") as
          | "all"
          | "packed"
          | "pending",

        packing_method: String(req.query.packing_method ?? "all") as
          | "all"
          | "manual"
          | "scanned",

        box_id,

        min_weight,
        max_weight,

        sort_by: String(req.query.sort_by ?? "row_number") as
          | "row_number"
          | "item_name"
          | "unique_code"
          | "group"
          | "category"
          | "weight"
          | "box",

        sort_order: String(req.query.sort_order ?? "asc") as "asc" | "desc",
      },
    );

    if (result.status === 0) {
      return res.status(404).json(ApiResponse.error(result.message, 404));
    }

    return res
      .status(200)
      .json(ApiResponse.success(result.data, result.message, 200));
  } catch (error) {
    console.error("getProjectCutList controller error:", error);

    return res
      .status(500)
      .json(ApiResponse.error("Internal server error", 500));
  }
};

export const getDefectDashboard = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.params.vendor_id);
    if (isNaN(vendor_id))
      return res.status(400).json(ApiResponse.error("Invalid vendor_id", 400));

    const result = await trackTraceService.getDefectDashboardService(vendor_id);
    if (result.status === 0)
      return res.status(500).json(ApiResponse.error(result.message, 500));

    return res
      .status(200)
      .json(ApiResponse.success(result.data, result.message, 200));
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json(ApiResponse.error("Internal server error", 500));
  }
};

// GET /track-trace/defect-dashboard/:vendor_id/project/:unique_project_id
export const getProjectDefects = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.params.vendor_id);
    const unique_project_id = String(req.params.unique_project_id).trim();
    if (isNaN(vendor_id) || !unique_project_id)
      return res.status(400).json(ApiResponse.error("Invalid params", 400));

    const result = await trackTraceService.getProjectDefectsService(
      vendor_id,
      unique_project_id,
    );
    if (result.status === 0)
      return res.status(404).json(ApiResponse.error(result.message, 404));

    return res
      .status(200)
      .json(ApiResponse.success(result.data, result.message, 200));
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json(ApiResponse.error("Internal server error", 500));
  }
};

export const getDefectSummary = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.params.vendor_id);
    if (isNaN(vendor_id))
      return res.status(400).json(ApiResponse.error("Invalid vendor_id", 400));
    const result = await trackTraceService.getDefectSummaryService(vendor_id);
    return res
      .status(200)
      .json(ApiResponse.success(result.data, result.message, 200));
  } catch (err) {
    return res
      .status(500)
      .json(ApiResponse.error("Internal server error", 500));
  }
};

// GET /track-trace/defect-dashboard/:vendor_id/pending?page=1
export const getPendingDefects = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.params.vendor_id);
    const page = Math.max(1, Number(req.query.page) || 1);
    if (isNaN(vendor_id))
      return res.status(400).json(ApiResponse.error("Invalid vendor_id", 400));
    const result = await trackTraceService.getPendingDefectsService(
      vendor_id,
      page,
    );
    return res
      .status(200)
      .json(ApiResponse.success(result.data, result.message, 200));
  } catch (err) {
    return res
      .status(500)
      .json(ApiResponse.error("Internal server error", 500));
  }
};

// GET /track-trace/defect-dashboard/:vendor_id/resolved?page=1
export const getResolvedDefects = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.params.vendor_id);
    const page = Math.max(1, Number(req.query.page) || 1);
    if (isNaN(vendor_id))
      return res.status(400).json(ApiResponse.error("Invalid vendor_id", 400));
    const result = await trackTraceService.getResolvedDefectsService(
      vendor_id,
      page,
    );
    return res
      .status(200)
      .json(ApiResponse.success(result.data, result.message, 200));
  } catch (err) {
    return res
      .status(500)
      .json(ApiResponse.error("Internal server error", 500));
  }
};

// ─── Grade Master Controllers ──────────────────────────────────────────────────
export const getGradeMasters = async (req: Request, res: Response) => {
  const vendor_id = Number(req.params.vendor_id);
  if (isNaN(vendor_id))
    return res.status(400).json({ message: "Invalid vendor_id" });
  const result = await trackTraceService.getGradeMasters(vendor_id);
  return res.status(result.status === 1 ? 200 : 500).json(result);
};
export const createGradeMaster = async (req: Request, res: Response) => {
  const { vendor_id, grade_name, created_by } = req.body;
  if (!vendor_id || !grade_name)
    return res
      .status(400)
      .json({ message: "vendor_id and grade_name are required" });
  const result = await trackTraceService.createGradeMaster(
    Number(vendor_id),
    grade_name,
    created_by,
  );
  return res.status(result.status === 1 ? 201 : 400).json(result);
};
export const updateGradeMaster = async (req: Request, res: Response) => {
  const { grade_name, updated_by } = req.body;
  const id = Number(req.params.id);
  if (!grade_name)
    return res.status(400).json({ message: "grade_name is required" });
  const result = await trackTraceService.updateGradeMaster(
    id,
    grade_name,
    updated_by,
  );
  return res.status(result.status === 1 ? 200 : 400).json(result);
};
export const toggleGradeMasterStatus = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { is_active } = req.body;
  const result = await trackTraceService.toggleGradeMasterStatus(
    id,
    Boolean(is_active),
  );
  return res.status(result.status === 1 ? 200 : 400).json(result);
};
export const deleteGradeMaster = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const result = await trackTraceService.deleteGradeMaster(id);
  return res.status(result.status === 1 ? 200 : 400).json(result);
};

// ─── Finish Master Controllers ─────────────────────────────────────────────────
export const getFinishMasters = async (req: Request, res: Response) => {
  const vendor_id = Number(req.params.vendor_id);
  if (isNaN(vendor_id))
    return res.status(400).json({ message: "Invalid vendor_id" });
  const result = await trackTraceService.getFinishMasters(vendor_id);
  return res.status(result.status === 1 ? 200 : 500).json(result);
};
export const createFinishMaster = async (req: Request, res: Response) => {
  const { vendor_id, finish_name, created_by } = req.body;
  if (!vendor_id || !finish_name)
    return res
      .status(400)
      .json({ message: "vendor_id and finish_name are required" });
  const result = await trackTraceService.createFinishMaster(
    Number(vendor_id),
    finish_name,
    created_by,
  );
  return res.status(result.status === 1 ? 201 : 400).json(result);
};
export const updateFinishMaster = async (req: Request, res: Response) => {
  const { finish_name, updated_by } = req.body;
  const id = Number(req.params.id);
  if (!finish_name)
    return res.status(400).json({ message: "finish_name is required" });
  const result = await trackTraceService.updateFinishMaster(
    id,
    finish_name,
    updated_by,
  );
  return res.status(result.status === 1 ? 200 : 400).json(result);
};
export const toggleFinishMasterStatus = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { is_active } = req.body;
  const result = await trackTraceService.toggleFinishMasterStatus(
    id,
    Boolean(is_active),
  );
  return res.status(result.status === 1 ? 200 : 400).json(result);
};
export const deleteFinishMaster = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const result = await trackTraceService.deleteFinishMaster(id);
  return res.status(result.status === 1 ? 200 : 400).json(result);
};

// ─── Type Master Controllers ───────────────────────────────────────────────────
export const getTypeMasters = async (req: Request, res: Response) => {
  const vendor_id = Number(req.params.vendor_id);
  if (isNaN(vendor_id))
    return res.status(400).json({ message: "Invalid vendor_id" });
  const result = await trackTraceService.getTypeMasters(vendor_id);
  return res.status(result.status === 1 ? 200 : 500).json(result);
};
export const createTypeMaster = async (req: Request, res: Response) => {
  const { vendor_id, type_name, created_by } = req.body;
  if (!vendor_id || !type_name)
    return res
      .status(400)
      .json({ message: "vendor_id and type_name are required" });
  const result = await trackTraceService.createTypeMaster(
    Number(vendor_id),
    type_name,
    created_by,
  );
  return res.status(result.status === 1 ? 201 : 400).json(result);
};
export const updateTypeMaster = async (req: Request, res: Response) => {
  const { type_name, updated_by } = req.body;
  const id = Number(req.params.id);
  if (!type_name)
    return res.status(400).json({ message: "type_name is required" });
  const result = await trackTraceService.updateTypeMaster(
    id,
    type_name,
    updated_by,
  );
  return res.status(result.status === 1 ? 200 : 400).json(result);
};
export const toggleTypeMasterStatus = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { is_active } = req.body;
  const result = await trackTraceService.toggleTypeMasterStatus(
    id,
    Boolean(is_active),
  );
  return res.status(result.status === 1 ? 200 : 400).json(result);
};
export const deleteTypeMaster = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const result = await trackTraceService.deleteTypeMaster(id);
  return res.status(result.status === 1 ? 200 : 400).json(result);
};

// ─── Core Product Master Controllers ───────────────────────────────────────────
export const getCoreProductMasters = async (req: Request, res: Response) => {
  const vendor_id = Number(req.params.vendor_id);
  if (isNaN(vendor_id))
    return res.status(400).json({ message: "Invalid vendor_id" });
  const result = await trackTraceService.getCoreProductMasters(vendor_id);
  return res.status(result.status === 1 ? 200 : 500).json(result);
};
export const createCoreProductMaster = async (req: Request, res: Response) => {
  const { vendor_id, core_product_name, created_by } = req.body;
  if (!vendor_id || !core_product_name)
    return res
      .status(400)
      .json({ message: "vendor_id and core_product_name are required" });
  const result = await trackTraceService.createCoreProductMaster(
    Number(vendor_id),
    core_product_name,
    created_by,
  );
  return res.status(result.status === 1 ? 201 : 400).json(result);
};
export const updateCoreProductMaster = async (req: Request, res: Response) => {
  const { core_product_name, updated_by } = req.body;
  const id = Number(req.params.id);
  if (!core_product_name)
    return res.status(400).json({ message: "core_product_name is required" });
  const result = await trackTraceService.updateCoreProductMaster(
    id,
    core_product_name,
    updated_by,
  );
  return res.status(result.status === 1 ? 200 : 400).json(result);
};
export const toggleCoreProductMasterStatus = async (
  req: Request,
  res: Response,
) => {
  const id = Number(req.params.id);
  const { is_active } = req.body;
  const result = await trackTraceService.toggleCoreProductMasterStatus(
    id,
    Boolean(is_active),
  );
  return res.status(result.status === 1 ? 200 : 400).json(result);
};
export const deleteCoreProductMaster = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const result = await trackTraceService.deleteCoreProductMaster(id);
  return res.status(result.status === 1 ? 200 : 400).json(result);
};

// ─── Brand Logo Upload ─────────────────────────────────────────────────────────
export const uploadBrandLogo = async (req: Request, res: Response) => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    const vendor_id = Number(req.body?.vendor_id);

    if (!file) return res.status(400).json({ message: "No file uploaded" });
    if (isNaN(vendor_id))
      return res.status(400).json({ message: "Invalid vendor_id" });

    const ext =
      (file.originalname || "logo").split(".").pop()?.toLowerCase() || "png";
    const allowedExts = ["jpg", "jpeg", "png", "svg", "webp"];
    if (!allowedExts.includes(ext)) {
      return res
        .status(400)
        .json({
          message: "Only image files (jpg, jpeg, png, svg, webp) are allowed",
        });
    }
    if (file.size > 2 * 1024 * 1024) {
      return res.status(400).json({ message: "File size must be under 2MB" });
    }

    const key = await uploadToWasabiCompanyVendorDocument(
      file.buffer,
      vendor_id,
      `brand_logo_${Date.now()}.${ext}`,
      file.mimetype,
    );

    const signedUrl = await generateSignedUrl(key);
    return res
      .status(200)
      .json({
        status: 1,
        message: "Logo uploaded",
        data: { key, url: signedUrl },
      });
  } catch (err) {
    console.error("Error uploading brand logo:", err);
    return res.status(500).json({ message: "Upload failed" });
  }
};

export const createUnitMaster = async (req: Request, res: Response) => {
  const { vendor_id, unit_name, short_name, created_by } = req.body;
  const result = await trackTraceService.createUnitMaster(
    Number(vendor_id),
    String(unit_name),
    String(short_name || unit_name),
    created_by ? Number(created_by) : null,
  );
  return res
    .status(200)
    .json(
      result.status
        ? ApiResponse.success(result.data, result.message, 200)
        : ApiResponse.error(result.message, 400),
    );
};

export const getManualPackingItemsController = async (
  req: Request,
  res: Response,
) => {
  try {
    const projectId = Number(req.query.project_id);
    const vendorId = Number(req.query.vendor_id);

    if (!projectId || projectId <= 0) {
      return res.status(400).json({
        success: false,
        message: "project_id is required",
      });
    }

    if (!vendorId || vendorId <= 0) {
      return res.status(400).json({
        success: false,
        message: "vendor_id is required",
      });
    }

    const result = await trackTraceService.getManualPackingItemsService(
      projectId,
      vendorId,
    );

    return res
      .status(200)
      .json(ApiResponse.success(result.data, result.message, 200));
  } catch (error: any) {
    console.error("getManualPackingItemsController error:", error);

    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to fetch manual packing items",
    });
  }
};

export const addManualPackingItem = async (req: Request, res: Response) => {
  try {
    const { project_id, vendor_id, box_id, cut_list_id, qty, user_id } =
      req.body;

    const serviceResponse = await trackTraceService.addManualPackingItemService(
      {
        project_id: Number(project_id),

        vendor_id: Number(vendor_id),

        box_id: Number(box_id),

        cut_list_id: Number(cut_list_id),

        qty: Number(qty),

        user_id: Number(user_id),
      },
    );

    if (serviceResponse.status === 0) {
      return res
        .status(200)
        .json(ApiResponse.error(serviceResponse.message, 400));
    }

    return res
      .status(200)
      .json(
        ApiResponse.success(serviceResponse.data, serviceResponse.message, 200),
      );
  } catch (error: any) {
    console.error("addManualPackingItem controller error:", error);

    return res
      .status(500)
      .json(ApiResponse.error(error?.message || "Internal server error", 500));
  }
};

const SCAN_STATUSES: trackTraceService.ProjectItemScanFilter[] = [
  "all",
  "scanned",
  "pending",
];

const toPositiveInteger = (
  value: unknown,
  fallback?: number,
): number | undefined => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
};

export const getProjectItemTracking = async (req: Request, res: Response) => {
  try {
    const vendorId = toPositiveInteger(req.params.vendorId);
    const projectId = toPositiveInteger(req.params.projectId);
    const page = toPositiveInteger(req.query.page, 1);
    const limit = toPositiveInteger(req.query.limit, 10);
    const search = String(req.query.search ?? "")
      .trim()
      .slice(0, 100);
    const rawStatus = String(req.query.scanStatus ?? "all").toLowerCase();
    const machineId = toPositiveInteger(req.query.machineId);

    if (!vendorId || !projectId) {
      return res.status(400).json({
        error: "vendorId and projectId must be positive integers",
      });
    }

    if (!page || !limit || limit > 50) {
      return res.status(400).json({
        error: "page must be positive and limit must be between 1 and 50",
      });
    }

    if (
      !SCAN_STATUSES.includes(
        rawStatus as trackTraceService.ProjectItemScanFilter,
      )
    ) {
      return res.status(400).json({
        error: "scanStatus must be all, scanned, or pending",
      });
    }

    if (
      req.query.machineId !== undefined &&
      req.query.machineId !== "" &&
      !machineId
    ) {
      return res
        .status(400)
        .json({ error: "machineId must be a positive integer" });
    }

    const result = await trackTraceService.getProjectItemTrackingService(
      vendorId,
      projectId,
      {
        page,
        limit,
        search,
        scanStatus: rawStatus as trackTraceService.ProjectItemScanFilter,
        machineId,
      },
    );

    if (!result) {
      return res.status(404).json({ error: "Project not found" });
    }

    return res.status(200).json(result);
  } catch (error: unknown) {
    console.error("getProjectItemTracking failed", error);

    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Unable to load project item tracking",
    });
  }
};
