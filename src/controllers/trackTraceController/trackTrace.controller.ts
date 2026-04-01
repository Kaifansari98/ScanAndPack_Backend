import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import * as trackTraceService from "../../services/trackTraceServices/trackTrace.service";
import * as machineService from "../../services/machineService/machineService.service";

import { ApiResponse } from "../../../src/utils/apiResponse";
import {
  CutListSavePayload,
  MarkDefectPayload,
  QRParam,
} from "../../../src/types/track-trace";
import * as XLSX from "xlsx";

import { generateWarehouseQRPDF } from "../../utils/warehouse-qr-generator";

export const scan_item = async (req: Request, res: Response) => {
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

export const check_item = async (req: Request, res: Response) => {
  console.log("Query params:", req.body);

  let serviceResponse = await trackTraceService.updateScannedItem(
    req.body,
    true,
  );
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

    date_range: req.query.date_range ? String(req.query.date_range) : "today",

    start_date: req.query.start_date ? String(req.query.start_date) : undefined,

    end_date: req.query.end_date ? String(req.query.end_date) : undefined,
  };
};

export const getKPIS = async (req: Request, res: Response) => {
  try {
    const payload = await getTrackTraceDashboardPayload(req);

    const response = await trackTraceService.getKPIS(payload);

    return res.status(200).json(ApiResponse.success(response, "", 200));
  } catch (error) {
    console.error("Error fetching KPIs:", error);
    return res.status(200).json(ApiResponse.error("Error fetching KPIs", 200));
  }
};

export const getRealTimeItemTracking = async (req: Request, res: Response) => {
  try {
    const payload = await getTrackTraceDashboardPayload(req);

    const response = await trackTraceService.getRealTimeItemTracking(payload);

    return res.status(200).json(ApiResponse.success(response, "", 200));
  } catch (error) {
    console.error("Error fetching KPIs:", error);

    return res.status(500).json(
      ApiResponse.error("Error fetching KPIs", 500)
    );
  }
};

export const getMachineStatus = async (req: Request, res: Response) => {
  try {
    const payload = await getTrackTraceDashboardPayload(req);

    const response = await trackTraceService.getMachineStatus(payload);

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
  console.log("Query params:", _req.body);
  // res.json(_req.params.vendor_id);

  try {
    const payload: MarkDefectPayload = {
      vendor_id: Number(_req.body.vendor_id),
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
    };

    console.log("payload", payload);
    // const vendor_id = Number(_req.params.vendor_id);
    // const project_id = String(_req.params.project_id);

    const serviceResponse = await trackTraceService.mark_Defect(payload);

    if (serviceResponse.status == 0) {
      return res
        .status(200)
        .json(ApiResponse.error(serviceResponse.message, 500));
    } else {
      return res
        .status(200)
        .json(
          ApiResponse.success(
            serviceResponse.status,
            serviceResponse.message,
            200,
          ),
        );
    }
  } catch (err) {
    throw err;
    return res.status(200).json(ApiResponse.error("Error", 500));
  }
};

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
