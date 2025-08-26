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