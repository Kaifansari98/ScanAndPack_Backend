import { LeadPriority, DocumentType } from "@prisma/client";

export interface ProductTypeInput {
    vendor_id: number;
    type: string;
    tag: string;
}
  
export interface ProductType {
    id: number;
    type: string;
    tag: string;
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

export interface DocumentTypeInput {
    vendor_id: number;
    type: string;
    tag: string;
}

export interface DocumentTypeValue{
    id: number;
    type: string;
    tag: string;
    vendor_id: number;
}
export interface PaymentTypeInput {
    vendor_id: number;
    type: string;
    tag: string;
}

export interface PaymentTypeValue{
    id: number;
    type: string;
    tag: string;
    vendor_id: number;
}
export interface StatusTypeInput {
    vendor_id: number;
    type: string;
}

export interface StatusType{
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
    status_id: number;
    assign_to?: number;
    assigned_by?: number;
    product_types: number[];
    product_structures: number[];
    initial_site_measurement_date?: Date;
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
    initial_site_measurement_date?: Date | string;
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
export interface SiteSupervisorData {
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

export interface CreatePaymentUploadDto {
    lead_id: number;
    account_id: number;
    vendor_id: number;
    created_by: number;
    client_id: number;
    amount?: number;
    payment_date?: Date;
    payment_text?: string;
    sitePhotos?: Express.Multer.File[];
    pdfFile?: Express.Multer.File;
    paymentImageFile?: Express.Multer.File;
  }
  
  export interface PaymentUploadResponseDto {
    paymentInfo: {
      id: number;
      amount: number | null;
      payment_date: Date | null;
      payment_text: string | null;
    } | null;
    ledgerEntry: {
      id: number;
      amount: number;
      type: string;
      payment_date: Date;
    } | null;
    documentsUploaded: {
      id: number;
      type: string;
      originalName: string;
      s3Key: string;
    }[];
    message: string;
  }

  export interface PaymentUploadResponseDtoo {
    paymentInfo: {
      id: number;
      amount: number | null;
      payment_date: Date | null;
      payment_text: string | null;
    } | null;
    ledgerEntry: {
      id: number;
      amount: number;
      type: string;
      payment_date: Date;
    } | null;
    documentsUploaded: PaymentDocumentDto[];
    message: string;
  }

  export interface PaymentUploadDetailDtoo {
    id: number;
    lead_id: number;
    account_id: number;
    vendor_id: number;
    amount: number | null;
    payment_date: Date | null;
    payment_text: string | null;
    payment_file_id: number | null;
    created_at: Date;
    created_by: number;
    lead: {
      id: number;
      firstname: string;
      lastname: string;
      contact_no: string;
      email: string | null;
      site_address: string;
    };
    account: {
      id: number;
      name: string;
      contact_no: string;
      email: string | null;
    };
    createdBy: {
      id: number;
      user_name: string;
      user_email: string;
    };
    documents: PaymentDocumentDto[];
  }

  export interface PaymentUploadDetailDto {
    id: number;
    type: 'payment_upload' | 'document_upload';
    lead: {
      id: number;
      firstname: string;
      lastname: string;
      contact_no: string;
      email: string | null;
    } | null;
    account: {
      id: number;
      name: string;
      contact_no: string;
      email: string | null;
    } | null;
    paymentInfo: {
      id: number;
      amount: number | null;
      payment_date: Date | null;
      payment_text: string | null;
      payment_file_id: number | null;
    } | null;
    ledgerEntry: {
      id: number;
      amount: number;
      type: string;
      payment_date: Date;
    } | null;
    documents: {
      id: number;
      doc_og_name: string;
      doc_sys_name: string;
      doc_type: string;
      created_at: Date;
      createdBy: {
        id: number;
        user_name: string;
      };
    }[];
    createdBy: {
      id: number;
      user_name: string;
      user_email: string;
    };
    created_at: Date;
  }
  
  export interface PaymentUploadListDto {
    id: number;
    lead: {
      id: number;
      firstname: string;
      lastname: string;
      contact_no: string;
    };
    account: {
      id: number;
      name: string;
    };
    amount: number | null;
    payment_date: Date | null;
    payment_text: string | null;
    createdBy: string;
    created_at: Date;
  }
  
  export interface DocumentDownloadDto {
    id: number;
    originalName: string;
    downloadUrl: string;
    expiresAt: Date;
  }
  
  export interface PaymentAnalyticsDto {
    totalAmount: number;
    totalPayments: number;
    averagePayment: number;
    totalDocuments: number;
    monthlyBreakdown: {
      month: string;
      total_amount: number;
      payment_count: number;
    }[];
    dateRange: {
      startDate: Date | null;
      endDate: Date | null;
    };
  }

  export interface LeadDetailDto {
    id: number;
    firstname: string;
    lastname: string;
    country_code: string;
    contact_no: string;
    alt_contact_no: string | null;
    email: string | null;
    site_address: string;
    priority: string;
    billing_name: string | null;
    archetech_name: string | null;
    designer_remark: string | null;
    created_at: Date;
    updated_at: Date;
    
    // Related entities
    vendor: {
      id: number;
      vendor_name: string;
      vendor_code: string;
    };
    
    siteType: {
      id: number;
      type: string;
    } | null;
    
    source: {
      id: number;
      type: string;
    };
    
    account: {
      id: number;
      name: string;
      contact_no: string;
      email: string | null;
    };
    
    statusType: {
      id: number;
      type: string;
    };
    
    createdBy: {
      id: number;
      user_name: string;
      user_email: string;
    };
    
    updatedBy: {
      id: number;
      user_name: string;
      user_email: string;
    } | null;
    
    assignedTo: {
      id: number;
      user_name: string;
      user_email: string;
    } | null;
    
    assignedBy: {
      id: number;
      user_name: string;
      user_email: string;
    } | null;
    
    // Summary statistics
    summary: {
      totalPayments: number;
      totalDocuments: number;
      totalLedgerEntries: number;
      totalProductMappings: number;
    };
  }

  export interface UpdatePaymentUploadDto {
    lead_id: number;
    account_id: number;
    vendor_id: number;
    updated_by: number;
    amount?: number;
    payment_date?: Date;
    payment_text?: string;
    currentSitePhotos?: Express.Multer.File[];
    paymentDetailPhotos?: Express.Multer.File[];
  }

  export interface PaymentDocumentDto {
    id: number;
    type: string;
    originalName: string;
    s3Key: string;
    signed_url?: string;
    file_type?: string;
    is_image?: boolean;
    document_type?: string;
    created_at?: Date;
  }

  // Soft Delete Document Request DTO
export interface SoftDeleteDocumentDto {
  user_id: number;
  vendor_id: number;
}

// Soft Delete Response DTO
export interface SoftDeleteResponseDto {
  success: boolean;
  message: string;
  document?: {
    id: number;
    doc_og_name: string;
    doc_sys_name: string;
    doc_type: {
      id: number;
      type: string;
    };
    lead?: {
      id: number;
      firstname: string;
      lastname: string;
    };
    account?: {
      id: number;
      name: string;
    };
    deleted_by?: {
      id: number;
      user_name: string;
      user_email: string;
    };
    deleted_at?: Date;
  };
}

// Deleted Document List Item
export interface DeletedDocumentDto {
  id: number;
  doc_og_name: string;
  doc_sys_name: string;
  created_at: Date;
  deleted_at: Date | null;
  is_deleted: boolean;
  lead?: {
    id: number;
    firstname: string;
    lastname: string;
  };
  account?: {
    id: number;
    name: string;
  };
  documentType: {
    id: number;
    type: string;
  };
  deletedBy?: {
    id: number;
    user_name: string;
    user_email: string;
  };
}

// Deleted Documents List Response
export interface DeletedDocumentsResponseDto {
  success: boolean;
  message: string;
  data: DeletedDocumentDto[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalRecords: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// API Error Response
export interface ApiErrorResponse {
  success: false;
  message: string;
  error?: string;
}

// API Success Response
export interface ApiSuccessResponse<T = any> {
  success: true;
  message: string;
  data?: T;
  pagination?: {
    currentPage: number;
    totalPages: number;
    totalRecords: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}