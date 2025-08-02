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
  weight?: number;     // ✅ New
  group: string;       // ✅ New
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
  is_grouping?: boolean;   // ✅ New
}

export interface ProjectRoomInput {
  room_name: string;           // ✅ New
  is_grouping?: boolean;       // ✅ New
  estimated_completion_date?: string;
  items: ProjectItemInput[];
}

export interface FullProjectCreateInput {
  client: ClientInput;
  project: ProjectInput;
  rooms: ProjectRoomInput[];  // ✅ Replaces flat `items`
}

// -------------- For the POST Api "End" -------------- //
  