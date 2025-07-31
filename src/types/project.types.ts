export interface CreateProjectInput {
    project_name: string;
    vendor_id: number;
    client_id: number;
    created_by: number;
    project_status: string;
}


// -------------- For the POST Api "Start" -------------- //

export interface ProjectItemInput {
    category: string;
    item_name: string;
    qty: number;
    L1: string;
    L2: string;
    L3: string;
    unique_id: string;
  }
  
  export interface ClientAddress {
    city?: string;
    state?: string;
    country?: string;
    pincode?: string;
    address?: string;
  }
  
  export interface ClientInput {
    id?: number;
    name: string;
    contact: string;
    alt_contact?: string;
    email?: string;
    address: ClientAddress;
  }
  
  export interface ProjectInput {
    project_name: string;
    unique_project_id: string;
    estimated_completion_date?: string;
  }
  
  export interface FullProjectCreateInput {
    client: ClientInput;
    project: ProjectInput;
    items: ProjectItemInput[];
  }

// -------------- For the POST Api "End" -------------- //
  