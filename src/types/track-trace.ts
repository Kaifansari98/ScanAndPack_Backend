export interface TrackTraceDashboardPayload {
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


export interface MarkDefectPayload {
  vendor_id: number;
  project_id: number;
  cut_list_machine_mapping_id: number;
  machine_id: number;
  unique_code: string;
  created_by: number;
  defect_id: number;
  defect_name: string;
  cut_list_id:number;
}