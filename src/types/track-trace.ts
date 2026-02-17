interface TrackTraceDashboardPayload {
    project_id?: string;
    vendor_id: number;
    machine_id?: string;
    created_by?: string;
}

export interface CutListSavePayload {
    project_id: string;
    vendor_id: number;
    cutListIds: string;
    machine_id: number;
    machine_name: string;
    assigned: boolean;
    created_by: Number
}


export interface QRParam {
    projectId?: string;
    vendorId: number;
    cutListIds?: string;    
}