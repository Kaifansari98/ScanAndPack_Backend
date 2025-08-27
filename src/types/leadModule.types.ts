import { LeadPriority, DocumentType } from "@prisma/client";

export interface ProductTypeInput {
    vendor_id: number;
    type: string;
}
  
export interface ProductType {
    id: number;
    type: string;
    vendor_id: number;
}

export interface SiteTypeInput {
    vendor_id: number;
    type: string;
}

export interface SiteType{
    id: number;
    type: string;
    vendor_id: number;
}

export interface SourceTypeInput {
    vendor_id: number;
    type: string;
}

export interface SourceType{
    id: number;
    type: string;
    vendor_id: number;
}

export interface ProductStructureTypeInput {
    vendor_id: number;
    type: string;
}

export interface ProductStructureType{
    id: number;
    type: string;
    vendor_id: number;
}

export interface CreateLeadDTO {
    firstname: string;
    lastname: string;
    country_code: string;
    contact_no: string;
    alt_contact_no?: string;
    email?: string;
    site_address: string;
    site_type_id?: number;
    priority: LeadPriority | string;
    billing_name?: string;
    source_id: number;
    archetech_name?: string;
    designer_remark?: string;
    vendor_id: number;
    created_by: number;
    assign_to?: number;
    assigned_by?: number;
    product_types?: number[];
    product_structures?: number[];
}
  
export interface DocumentUpload {
    file: Express.Multer.File;
    type?: DocumentType;
}

export interface UpdateLeadDTO {
    firstname: string;
    lastname: string;
    country_code: string;
    contact_no: string;
    alt_contact_no?: string;
    email?: string;
    site_address: string;
    site_type_id?: number;
    priority: string;
    billing_name?: string;
    source_id: number;
    archetech_name?: string;
    designer_remark?: string;
    updated_by: number;
    product_types?: number[];
    product_structures?: number[];
}

export interface SalesExecutiveData {
    id: number;
    vendor_id: number;
    user_name: string;
    user_contact: string;
    user_email: string;
    user_timezone: string;
    status: string;
    created_at: Date;
    updated_at: Date;
    user_type: {
      id: number;
      user_type: string;
    };
    documents: Array<{
      id: number;
      document_name: string;
      document_number: string;
      filename: string;
    }>;
}

/**
 * Interface for assignment payload
 */
export interface AssignLeadPayload {
    assign_to: number;
    assign_by: number;
    assignment_reason?: string;
}

/**
 * Interface for user role validation
 */
export interface UserRoleInfo {
    id: number;
    vendor_id: number;
    user_name: string;
    status: string;
    user_type: {
      id: number;
      user_type: string;
    };
}

/**
 * Interface for lead assignment result
 */
export interface LeadAssignmentResult {
    lead: {
      id: number;
      firstname: string;
      lastname: string;
      contact_no: string;
      email: string | null;
      assign_to: number | null;
      assigned_by: number | null;
      updated_at: Date;
    };
    assignedTo: {
      id: number;
      user_name: string;
      user_contact: string;
      user_email: string;
    };
    assignedBy: {
      id: number;
      user_name: string;
      user_contact: string;
      user_email: string;
    };
}