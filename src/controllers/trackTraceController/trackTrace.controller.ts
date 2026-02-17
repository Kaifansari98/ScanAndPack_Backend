import { Request, Response } from 'express';
import * as trackTraceService from '../../services/trackTraceServices/trackTrace.service';
import * as machineService from '../../services/machineService/machineService.service';

import { ApiResponse } from 'src/utils/apiResponse';
import { CutListSavePayload, QRParam } from 'src/types/track-trace';
import { generateWarehouseQRPDF } from "../../utils/warehouse-qr-generator";

export const scan_item = async (req: Request, res: Response) => {
    console.log("Query params:", req.body);

    let serviceResponse = await trackTraceService.updateScannedItem(req.body);    
    if (serviceResponse.status == 0) {
        return res
            .status(200)
            .json(
                ApiResponse.error(
                    serviceResponse.message,
                    500
                )
            );
    } else {
        return res
            .status(200)
            .json(
                ApiResponse.success(
                    serviceResponse.status,
                    serviceResponse.message,
                    200
                )
            );
    }
};



export const getAllMachines = async (_req: Request, res: Response) => {
    console.log("Query params:", _req.query);
    // res.json(_req.params.vendor_id);

    try {
        const vendor_id = Number(_req.params.vendor_id);
        const user_id = Number(_req.params.user_id);

        const projects = await machineService.getAllMachines(vendor_id, user_id);

        return res
            .status(200)
            .json(
                ApiResponse.success(
                    projects,
                    "",
                    200
                )
            );
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch machines', details: err });
    }
};


export const getTrackTraceDashboardPayload = (
    req: Request
) => {

    const vendorIdRaw = req.params.vendor_id;

    if (!vendorIdRaw || isNaN(Number(vendorIdRaw))) {
        throw new Error('Invalid or missing vendor_id');
    }

    return {
        vendor_id: Number(vendorIdRaw),
        project_id: req.query.project_id
            ? String(req.query.project_id)
            : undefined,
        machine_id: req.query.machine_id
            ? String(req.query.machine_id)
            : undefined,
        created_by: req.query.created_by
            ? String(req.query.created_by)
            : undefined,
    };
};

export const getKPIS = async (req: Request, res: Response) => {
    try {

        const payload = await getTrackTraceDashboardPayload(req);
        console.log(payload)
        // const payload = {
        //     vendor_id: Number(req.query.vendor_id),
        //     project_id: Number(req.query.project_id),
        //     machine_id: Number(req.query.machine_id),
        //     unique_code: String(req.query.unique_code),
        //     created_by: Number(req.query.created_by),
        // };

        const response = await trackTraceService.getKPIS(payload);
        console.log(response);
        return res
            .status(200)
            .json(
                ApiResponse.success(
                    response,
                    "",
                    200
                )
            );

    } catch (error) {

        console.error('Error fetching KPIs:', error);
        return res
            .status(200)
            .json(
                ApiResponse.error(
                    "Error fetching KPIs",
                    200
                )
            );
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
        return res
            .status(200)
            .json(
                ApiResponse.success(
                    response,
                    "",
                    200
                )
            );

    } catch (error) {

        console.error('Error fetching KPIs:', error);
        return res
            .status(200)
            .json(
                ApiResponse.error(
                    "Error fetching KPIs",
                    200
                )
            );
    }



};


export const getMachineStatus = async (req: Request, res: Response) => {

    try {

        const payload = await getTrackTraceDashboardPayload(req);

        const response = await trackTraceService.getMachineStatus(payload);
        // console.log(response);
        return res
            .status(200)
            .json(
                ApiResponse.success(
                    response,
                    "",
                    200
                )
            );

    } catch (error) {

        console.error('Error fetching KPIs:', error);
        return res
            .status(200)
            .json(
                ApiResponse.error(
                    "Error fetching KPIs",
                    200
                )
            );
    }



};

export const getHourlyProduction = async (req: Request, res: Response) => {

    try {

        const payload = await getTrackTraceDashboardPayload(req);

        const response = await trackTraceService.getHourlyProduction(payload);
        console.log(response);
        return res
            .status(200)
            .json(
                ApiResponse.success(
                    response,
                    "",
                    200
                )
            );

    } catch (error) {

        console.error('Error fetching KPIs:', error);
        return res
            .status(200)
            .json(
                ApiResponse.error(
                    "Error fetching KPIs",
                    200
                )
            );
    }
};


export const getMachineUtilization = async (req: Request, res: Response) => {
    try {

        const payload = await getTrackTraceDashboardPayload(req);

        const response = await trackTraceService.getMachineUtilization(payload);
        console.log(response);
        return res
            .status(200)
            .json(
                ApiResponse.success(
                    response,
                    "",
                    200
                )
            );

    } catch (error) {

        console.error('Error fetching KPIs:', error);
        return res
            .status(200)
            .json(
                ApiResponse.error(
                    "Error fetching KPIs",
                    200
                )
            );
    }
};
export const getTopPerformer = async (req: Request, res: Response) => {
    try {

        const payload = await getTrackTraceDashboardPayload(req);

        const response = await trackTraceService.getTopPerformer(payload);
        console.log(response);
        return res
            .status(200)
            .json(
                ApiResponse.success(
                    response,
                    "",
                    200
                )
            );

    } catch (error) {

        console.error('Error fetching KPIs:', error);
        return res
            .status(200)
            .json(
                ApiResponse.error(
                    "Error fetching KPIs",
                    200
                )
            );
    }
};

export const getProjectProgress = async (req: Request, res: Response) => {
    try {

        const payload = await getTrackTraceDashboardPayload(req);

        const response = await trackTraceService.getProjectProgress(payload);
        console.log(response);
        return res
            .status(200)
            .json(
                ApiResponse.success(
                    response,
                    "",
                    200
                )
            );

    } catch (error) {

        console.error('Error fetching KPIs:', error);
        return res
            .status(200)
            .json(
                ApiResponse.error(
                    "Error fetching KPIs",
                    200
                )
            );
    }
};

export const getBottleNeck = async (req: Request, res: Response) => {
    try {

        const payload = await getTrackTraceDashboardPayload(req);

        const response = await trackTraceService.getBottleNeck(payload);
        console.log(response);
        return res
            .status(200)
            .json(
                ApiResponse.success(
                    response,
                    "",
                    200
                )
            );

    } catch (error) {

        console.error('Error fetching KPIs:', error);
        return res
            .status(200)
            .json(
                ApiResponse.error(
                    "Error fetching KPIs",
                    200
                )
            );
    }
};

export const get_filter_track_trace = async (_req: Request, res: Response) => {
    console.log("Query params:", _req.query);
    // res.json(_req.params.vendor_id);

    try {
        const vendor_id = Number(_req.params.vendor_id);

        const projects = await trackTraceService.getAllProjectsByVendorId(vendor_id);
        const machines = await trackTraceService.getAllMachinesByVendorId(vendor_id);
        const users = await trackTraceService.getAllUsersByVendorId(vendor_id);

        const response = {
            project: projects,
            machine: machines,
            user: users
        }

        return res
            .status(200)
            .json(
                ApiResponse.success(
                    response,
                    "",
                    200
                )
            );
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch projects', details: err });
    }
};

export const getCutListMachine = async (_req: Request, res: Response) => {

    console.log("Query params:", _req.query);
    // res.json(_req.params.vendor_id);

    try {
        const vendor_id = Number(_req.params.vendor_id);
        const project_id = String(_req.params.project_id);

        const projects = await trackTraceService.getCutListMachine(vendor_id, project_id);

        const response = {
            cutlist: projects,
        }

        return res
            .status(200)
            .json(
                ApiResponse.success(
                    response,
                    "",
                    200
                )
            );
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch projects', details: err });
    }
}


export const assignMachine = async (_req: Request, res: Response) => {

    console.log("Query params:", _req.body);
    // res.json(_req.params.vendor_id);

    try {

        const payload: CutListSavePayload = {
            project_id: String(_req.body.project_id),
            vendor_id: Number(_req.body.vendor_id),
            cutListIds: String(_req.body.cutListIds),
            machine_id: Number(_req.body.machine_id),
            machine_name: String(_req.body.machine_name),
            assigned: Boolean(_req.body.assigned),
            created_by: Number(_req.body.vendor_id)
        }
        // const vendor_id = Number(_req.params.vendor_id);
        // const project_id = String(_req.params.project_id);


        const serviceResponse = await trackTraceService.assignMachine(payload);

        if (serviceResponse.status == 0) {
            return res
                .status(200)
                .json(
                    ApiResponse.error(
                        serviceResponse.message,
                        500
                    )
                );
        } else {
            return res
                .status(200)
                .json(
                    ApiResponse.success(
                        serviceResponse.status,
                        serviceResponse.message,
                        200
                    )
                );
        }
    } catch (err) {

        return res
            .status(200)
            .json(
                ApiResponse.error(
                    "Error",
                    500
                )
            );
    }
}


// import { generateQrLabel } from "../../utils/qr-label";
// import { generateMultiQRLabel } from "../../utils/multi-qr-label";




export const createQR = async (_req: Request, res: Response) => {

    console.log("Query params:", _req.body);

    const payload: QRParam = {
        vendorId: Number(_req.body.vendorId),
        projectId: String(_req.body.projectId),
        cutListIds: String(_req.body.cutListIds)
    }


    console.log(payload)

    try {

        const data = await trackTraceService.createQR(payload);

        if (data) {
            const filePath = await generateWarehouseQRPDF({
                itemQRs: data.map((item: any) => ({
                    value: item.cut_list.unique_code,        // QR encoded value
                    itemCode: item.cut_list.unique_code,     // Bold label
                    itemName: item.cut_list.description || "", // Second label,
                    columns: 3
                })),


            });
            return res
                .status(200)
                .json(
                    ApiResponse.success(
                        filePath,
                        "",
                        200
                    )
                );
        } else {
            return res
                .status(200)
                .json(
                    ApiResponse.error(
                        "No data avialbale",
                        200
                    )
                );
        }







    } catch (err) {

        return res
            .status(200)
            .json(
                ApiResponse.error(
                    "",
                    500
                )
            );
    }
}



export const downloadCutListExcel = async (_req: Request, res: Response) => {
    try {
        const searchParams = _req.body.searchParams;
        const vendorId = _req.body.vendorId;
        console.log("vendorId",vendorId);
        const unique_project_id =_req.body.unique_project_id;// searchParams.get('unique_project_id');

        if (!unique_project_id) {
            return res
                .status(200)
                .json(
                    ApiResponse.error(
                        "Project Id is required",
                        200
                    )
                );
        }

        // Generate Excel
        const filePath = await trackTraceService.downloadCutListExcel(vendorId, unique_project_id);


        // Return Excel file


        return res
            .status(200)
            .json(
                ApiResponse.success(
                    filePath,
                    "",
                    200
                )
            );
    } catch (error: any) {
        console.error('Error downloading Excel:', error);

    }

}