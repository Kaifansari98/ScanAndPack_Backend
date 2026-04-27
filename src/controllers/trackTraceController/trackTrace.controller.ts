
import { Request, Response } from 'express';
import path from "path";
import fs from "fs";
import * as trackTraceService from '../../services/trackTraceServices/trackTrace.service';
import * as machineService from '../../services/machineService/machineService.service';

import { ApiResponse } from '../../../src/utils/apiResponse';
import { CutListSavePayload, MarkDefectPayload, QRParam } from '../../../src/types/track-trace';
import { generateWarehouseQRPDF } from "../../utils/warehouse-qr-generator";


interface TrackTracePayload {
  project_id: number;
  vendor_id: number;
  machine_id: number;
  unique_code: string;
  created_by: number;
  box_id?:number;
}
export const scan_item_old = async (req: Request, res: Response) => {
    console.log("Query params:", req.body);

    


    let serviceResponse = await trackTraceService.updateScannedItem(req.body, false);
    if (serviceResponse?.status == 0) {
        return res
            .status(200)
            .json(
                ApiResponse.error(
                    serviceResponse?.message,
                    500
                )
            );
    } else {
        return res
            .status(200)
            .json(
                ApiResponse.success(
                    serviceResponse?.status,
                    serviceResponse?.message,
                    200
                )
            );
    }

};


export const scan_item = async (_req: Request, res: Response) => {
    
    console.log(_req.body);

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

    const serviceResponse = await trackTraceService.updateScannedItem(payload, false, files);

    if (serviceResponse?.status == 0) {
      return res.status(200).json(ApiResponse.error(serviceResponse?.message, 500));
    }

    return res.status(200).json(
      ApiResponse.success(serviceResponse?.status, serviceResponse?.message, 200)
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

    let serviceResponse = await trackTraceService.updateScannedItem(req.body, true);
    console.log("serviceResponse:",serviceResponse);
    if (serviceResponse?.status == 0) {
        return res
            .status(200)
            .json(
                ApiResponse.error(
                    serviceResponse?.message,
                    500
                )
            );
    } else {

        let mappedItem = serviceResponse?.data;

        return res
            .status(200)
            .json(
                ApiResponse.success(
                    { mappedItem },
                    serviceResponse?.message,
                    200
                )
            );
    }
};

export const check_defect = async (req: Request, res: Response) => {
    console.log("Query params:", req.body);

    let serviceResponse = await trackTraceService.check_defect(req.body);
    if (serviceResponse?.status == 0) {
        return res
            .status(200)
            .json(
                ApiResponse.error(
                    serviceResponse?.message,
                    500
                )
            );
    } else {

        let mappedItem = serviceResponse?.data;

        return res
            .status(200)
            .json(
                ApiResponse.success(
                    { mappedItem },
                    serviceResponse?.message,
                    200
                )
            );
    }
};




export const get_defect = async (req: Request, res: Response) => {
    console.log("Query params:", req.body);

    const vendor_id = Number(req.params.vendor_id);
    let serviceResponse = await trackTraceService.get_defect(vendor_id);

    let defects = serviceResponse?.data;

    return res
        .status(200)
        .json(
            ApiResponse.success(
                { defects },
                "",
                200
            )
        );

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
            filename
        );

        if (!fs.existsSync(filePath)) {
            return res
                .status(404)
                .json(ApiResponse.error("File not found", 404));
        }

        return res.download(filePath, filename);
    } catch (error: any) {
        console.error("Error serving QR labels:", error);
        return res
            .status(500)
            .json(ApiResponse.error("Failed to serve file", 500));
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
            filename
        );

        if (!fs.existsSync(filePath)) {
            return res
                .status(404)
                .json(ApiResponse.error("File not found", 404));
        }

        return res.download(filePath, filename);
    } catch (error: any) {
        console.error("Error serving Excel file:", error);
        return res
            .status(500)
            .json(ApiResponse.error("Failed to serve file", 500));
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
            return res.status(200).json(ApiResponse.error("At least 1 photo is required", 422));
        }

        const vendorId = Number(_req.body.vendor_id);
        console.log("vendorId", vendorId);

        // create defected item first to get the ID for the wasabi path
        const payload: MarkDefectPayload = {
            vendor_id: vendorId,
            project_id: Number(_req.body.project_id),
            cut_list_machine_mapping_id: Number(_req.body.cut_list_machine_mapping_id),
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

        const serviceResponse = await trackTraceService.mark_Defect(payload, files, vendorId);
        console.log(serviceResponse)
        if (serviceResponse.status == 0) {
            return res.status(200).json(ApiResponse.error(serviceResponse.message, 500));
        }

        return res.status(200).json(ApiResponse.success(serviceResponse.status, serviceResponse.message, 200));

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

    let serviceResponse = await trackTraceService.getScanStatsDashboard(vendor_id, user_id);
    if (serviceResponse?.status == 0) {
        return res
            .status(200)
            .json(
                ApiResponse.error(
                    serviceResponse?.message,
                    500
                )
            );
    } else {

        let scanItem = serviceResponse?.data;

        return res
            .status(200)
            .json(
                ApiResponse.success(
                    { scanItem },
                    serviceResponse?.message,
                    200
                )
            );
    }
};

export const getReworkMachines = async (_req: Request, res: Response) => {
    try {
        // console.log(_req.params);return;
        const vendor_id = Number(_req.params.vendor_id);
        const machine_id = Number(_req.params.machine_id);

        const serviceResponse = await trackTraceService.getReworkMachines(vendor_id, machine_id);

        return res.status(200).json(
            ApiResponse.success({ serviceResponse }, "Machines fetched", 200)
        );
    } catch (err) {
        throw err;
    }
};

// controller
export const getUserModules = async (_req: Request, res: Response) => {
  const { vendor_id, user_id } = _req.params;
  const serviceResponse = await trackTraceService.getUserModules(
    Number(vendor_id),
    Number(user_id)
  );
  if (serviceResponse.status == 0) {
    return res.status(200).json(ApiResponse.error(serviceResponse.message, 500));
  }
  return res.status(200).json(
    ApiResponse.success(serviceResponse.data,'',200)
  );
};

export const getQualityCheckProjects = async (_req: Request, res: Response) => {
  const { vendor_id } = _req.params;
  const serviceResponse = await trackTraceService.getQualityCheckProjects(Number(vendor_id));
  if (serviceResponse.status == 0) {
    return res.status(200).json(ApiResponse.error(serviceResponse.message, 500));
  }
  return res.status(200).json(
    ApiResponse.success(serviceResponse.data,'',200)
  );
};


export const getTraceTraceDashboard = async (_req: Request, res: Response) => {
  const { vendor_id } = _req.params;
  const serviceResponse = await trackTraceService.getTraceTraceDashboard(Number(vendor_id));
  if (serviceResponse.status == 0) {
    return res.status(200).json(ApiResponse.error(serviceResponse.message, 500));
  }
  return res.status(200).json(
    ApiResponse.success(serviceResponse.data,'',200)
  );
};



export const getProjectCategories = async (_req: Request, res: Response) => {
    
  const { vendor_id } = _req.params;
  const serviceResponse = await trackTraceService.getProjectCategories(Number(vendor_id));
  if (serviceResponse.status == 0) {
    return res.status(200).json(ApiResponse.error(serviceResponse.message, 500));
  }
  return res.status(200).json(
    ApiResponse.success(serviceResponse.data,'',200)
  );
};


export const getProjectCategoryTypes = async (_req: Request, res: Response) => {
  const { vendor_id } = _req.params;
  const serviceResponse = await trackTraceService.getProjectCategoryTypes();
  if (serviceResponse.status == 0) {
    return res.status(200).json(ApiResponse.error(serviceResponse.message, 500));
  }
  return res.status(200).json(
    ApiResponse.success(serviceResponse.data,'',200)
  );
};


// Controller
export const createProjectCategory = async (_req: Request, res: Response) => {
  const { vendor_id, category_name, type_ids, created_by } = _req.body;

  const serviceResponse = await trackTraceService.createProjectCategory(
    Number(vendor_id),
    String(category_name),
    Array.isArray(type_ids) ? type_ids.map(Number) : [],
    Number(created_by)
  );

  if (serviceResponse.status == 0) {
    return res.status(200).json(ApiResponse.error(serviceResponse.message, 500));
  }
  return res.status(200).json(
    ApiResponse.success(serviceResponse.data, '', 200)
  );
};

export const updateProjectCategory = async (_req: Request, res: Response) => {
  const { id, vendor_id, category_name, type_ids, updated_by, status } = _req.body;

  const serviceResponse = await trackTraceService.updateProjectCategory(
    Number(id),
    Number(vendor_id),
    String(category_name),
    status as "Yes" | "No",
    Array.isArray(type_ids) ? type_ids.map(Number) : [],
    Number(updated_by)
  );

  if (serviceResponse.status == 0) {
    return res.status(200).json(ApiResponse.error(serviceResponse.message, 500));
  }
  return res.status(200).json(
    ApiResponse.success(serviceResponse.data, '', 200)
  );
};


export const toggleProjectCategoryStatus = async (_req: Request, res: Response) => {
  const { id,status } = _req.body;

  const serviceResponse = await trackTraceService.toggleProjectCategoryStatus(
    Number(id),    
    status as "Yes" | "No",
  );

  if (serviceResponse.status == 0) {
    return res.status(200).json(ApiResponse.error(serviceResponse.message, 500));
  }
  return res.status(200).json(
    ApiResponse.success(serviceResponse.data, '', 200)
  );
};

export const unsetBoxFromMapping = async (req: Request, res: Response) => {
  try {
    console.log("req.params:",req.params);
    const mapping_id = Number(req.params.id);
    const project_id = Number(req.params.project_id ?? req.params.project_id);
    const vendor_id  = Number(req.params.vendor_id  ?? req.params.vendor_id);
 
    if (isNaN(mapping_id) || isNaN(project_id) || isNaN(vendor_id)) {
      return res.status(400).json(ApiResponse.error("Invalid id, project_id or vendor_id", 400));
    }
 
    const result = await trackTraceService.unsetBoxFromMappingService(mapping_id, project_id, vendor_id);
 
    if (result.status === 0) {
      return res.status(200).json(ApiResponse.error(result.message, 500));
    }
 
    return res.status(200).json(
      ApiResponse.success(result.data, result.message, 200)
    );
  } catch (err) {
    console.error("unsetBoxFromMapping controller error:", err);
    return res.status(500).json(ApiResponse.error("Internal server error", 500));
  }
};


export const markBoxFactoryOut = async (req: Request, res: Response) => {
  try {
    const box_id     = Number(req.params.box_id);
    const project_id = Number(req.body.project_id);
    const vendor_id  = Number(req.body.vendor_id);
    const user_id    = Number(req.body.user_id);
 
    if ([box_id, project_id, vendor_id, user_id].some(isNaN)) {
      return res.status(400).json(ApiResponse.error("Invalid parameters", 400));
    }
 
    const result = await trackTraceService.markBoxFactoryOutService(box_id, project_id, vendor_id, user_id);
 
    if (result.status === 0) {
      return res.status(200).json(ApiResponse.error(result.message, 500));
    }
 
    return res.status(200).json(ApiResponse.success(result.data, result.message, 200));
  } catch (err) {
    console.error("markBoxFactoryOut error:", err);
    return res.status(500).json(ApiResponse.error("Internal server error", 500));
  }
};
 
export const markBoxSiteIn = async (req: Request, res: Response) => {
  try {
    const box_id     = Number(req.params.box_id);
    const project_id = Number(req.body.project_id);
    const vendor_id  = Number(req.body.vendor_id);
    const user_id    = Number(req.body.user_id);
 
    if ([box_id, project_id, vendor_id, user_id].some(isNaN)) {
      return res.status(400).json(ApiResponse.error("Invalid parameters", 400));
    }
 
    const result = await trackTraceService.markBoxSiteInService(box_id, project_id, vendor_id, user_id);
 
    if (result.status === 0) {
      return res.status(200).json(ApiResponse.error(result.message, 500));
    }
 
    return res.status(200).json(ApiResponse.success(result.data, result.message, 200));
  } catch (err) {
    console.error("markBoxSiteIn error:", err);
    return res.status(500).json(ApiResponse.error("Internal server error", 500));
  }
};


// POST /project-categories/sync
export const syncCategories = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.body.vendor_id ?? req.query.vendor_id);
    if (isNaN(vendor_id)) {
      return res.status(400).json(ApiResponse.error("Invalid vendor_id", 400));
    }
 
    const result = await trackTraceService.syncCategoriesFromExternalService(vendor_id);
 
    if (result.status === 0) {
      return res.status(200).json(ApiResponse.error(result.message, 500));
    }
 
    return res.status(200).json(ApiResponse.success(result.data, result.message, 200));
  } catch (err) {
    console.error("syncCategories error:", err);
    return res.status(500).json(ApiResponse.error("Internal server error", 500));
  }
};
 
// GET /project-categories/check-token?vendor_id=
export const checkToken = async (req: Request, res: Response) => {
    console.log("checkToken",req.query);
  try {
    const vendor_id = Number(req.query.vendor_id);
    if (isNaN(vendor_id)) {
      return res.status(400).json(ApiResponse.error("Invalid vendor_id", 400));
    }
 
    const result = await trackTraceService.checkExternalTokenService(vendor_id);
    return res.status(200).json(ApiResponse.success(result.data, result.message, 200));
  } catch (err) {
    console.error("checkToken error:", err);
    return res.status(500).json(ApiResponse.error("Internal server error", 500));
  }
};




// GET /track-trace/project-detail/:vendor_id/:project_id
export const getProjectDetail = async (req: Request, res: Response) => {
  try {
    console.log("getProjectDetail",req.params);
    const vendor_id  = Number(req.params.vendor_id);
    const project_id = String(req.params.project_id);
    if (isNaN(vendor_id))
      return res.status(400).json(ApiResponse.error("Invalid params", 400));
 
    const result = await trackTraceService.getProjectDetailService(vendor_id, project_id);
    console.log("result",result);
    if (result.status === 0)
      return res.status(404).json(ApiResponse.error(result.message, 404));
 
    return res.status(200).json(ApiResponse.success(result.data, result.message, 200));
  } catch (err) {
    console.error(err);
    return res.status(500).json(ApiResponse.error("Internal server error", 500));
  }
};
 
// GET /track-trace/project-detail/:vendor_id/:project_id/box/:box_id
export const getBoxItems = async (req: Request, res: Response) => {
  try {
    const vendor_id  = Number(req.params.vendor_id);
    const project_id = String(req.params.project_id);
    const box_id     = Number(req.params.box_id);
    if ([vendor_id, box_id].some(isNaN))
      return res.status(400).json(ApiResponse.error("Invalid params", 400));
 
    const result = await trackTraceService.getBoxItemsService(vendor_id, project_id, box_id);
    if (result.status === 0)
      return res.status(404).json(ApiResponse.error(result.message, 404));
 
    return res.status(200).json(ApiResponse.success(result.data, result.message, 200));
  } catch (err) {
    console.error(err);
    return res.status(500).json(ApiResponse.error("Internal server error", 500));
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
 
    return res.status(200).json(ApiResponse.success(result.data, result.message, 200));
  } catch (err) {
    console.error(err);
    return res.status(500).json(ApiResponse.error("Internal server error", 500));
  }
};
 
// GET /track-trace/defect-dashboard/:vendor_id/project/:unique_project_id
export const getProjectDefects = async (req: Request, res: Response) => {
  try {
    const vendor_id         = Number(req.params.vendor_id);
    const unique_project_id = String(req.params.unique_project_id).trim();
    if (isNaN(vendor_id) || !unique_project_id)
      return res.status(400).json(ApiResponse.error("Invalid params", 400));
 
    const result = await trackTraceService.getProjectDefectsService(vendor_id, unique_project_id);
    if (result.status === 0)
      return res.status(404).json(ApiResponse.error(result.message, 404));
 
    return res.status(200).json(ApiResponse.success(result.data, result.message, 200));
  } catch (err) {
    console.error(err);
    return res.status(500).json(ApiResponse.error("Internal server error", 500));
  }
};


export const getDefectSummary = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.params.vendor_id);
    if (isNaN(vendor_id)) return res.status(400).json(ApiResponse.error("Invalid vendor_id", 400));
    const result = await trackTraceService.getDefectSummaryService(vendor_id);
    return res.status(200).json(ApiResponse.success(result.data, result.message, 200));
  } catch (err) {
    return res.status(500).json(ApiResponse.error("Internal server error", 500));
  }
};
 
// GET /track-trace/defect-dashboard/:vendor_id/pending?page=1
export const getPendingDefects = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.params.vendor_id);
    const page      = Math.max(1, Number(req.query.page) || 1);
    if (isNaN(vendor_id)) return res.status(400).json(ApiResponse.error("Invalid vendor_id", 400));
    const result = await trackTraceService.getPendingDefectsService(vendor_id, page);
    return res.status(200).json(ApiResponse.success(result.data, result.message, 200));
  } catch (err) {
    return res.status(500).json(ApiResponse.error("Internal server error", 500));
  }
};
 
// GET /track-trace/defect-dashboard/:vendor_id/resolved?page=1
export const getResolvedDefects = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.params.vendor_id);
    const page      = Math.max(1, Number(req.query.page) || 1);
    if (isNaN(vendor_id)) return res.status(400).json(ApiResponse.error("Invalid vendor_id", 400));
    const result = await trackTraceService.getResolvedDefectsService(vendor_id, page);
    return res.status(200).json(ApiResponse.success(result.data, result.message, 200));
  } catch (err) {
    return res.status(500).json(ApiResponse.error("Internal server error", 500));
  }
};


export const syncProducts = async (req: Request, res: Response) => {
  try {
    // console.log(req.body);return;
    const vendor_id = Number(
      req.body.vendor_id ?? req.query.vendor_id
    );

    if (isNaN(vendor_id)) {
      return res
        .status(400)
        .json(ApiResponse.error("Invalid vendor_id", 400));
    }

    const result =
      await trackTraceService.syncProductsFromExternalService(
        vendor_id
      );

    if (result.status === 0) {
      return res
        .status(200)
        .json(ApiResponse.error(result.message, 500));
    }

    return res
      .status(200)
      .json(
        ApiResponse.success(
          result.data,
          result.message,
          200
        )
      );
  } catch (err) {
    console.error("syncProducts error:", err);

    return res
      .status(500)
      .json(
        ApiResponse.error(
          "Internal server error",
          500
        )
      );
  }
};