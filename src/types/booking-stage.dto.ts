import { Express } from "express";

export interface CreateBookingStageDto {
  lead_id: number;
  account_id: number;
  vendor_id: number;
  created_by: number;
  product_type_id?: number;
  client_id?: number;
  bookingAmount: number;
  basic_amount?: number;
  gst_percentage?: number;
  gst_amount?: number;
  total_amount?: number;
  bookingAmountPaymentDetailsText?: string;
  finalBookingAmount: number;
  siteSupervisorId?: number;
  mrpValue: number;
  baseUrl: string;
  scopedInstanceIds?: number[];
  // Files
  finalDocuments: UploadedFileRef[];
  bookingAmountPaymentDetailsFile?: UploadedFileRef;
}

export interface UploadedFileRef {
  originalName: string;
  sysName: string;
}

export interface AddPaymentDto {
  lead_id: number;
  account_id: number;
  vendor_id: number;
  product_type_id?: number;
  client_id?: number;
  created_by: number;
  amount: number;
  payment_text: string;       // ✅ mandatory
  payment_date: string;       // ✅ mandatory
  baseUrl : string;
  payment_file?: UploadedFileRef; // optional
}

export interface LeadBillingAddressInput {
  name?: string | null;
  address?: string | null;
  map_link?: string | null;
  gst_number?: string | null;
  state_name?: string | null;
  place_of_supply?: string | null;
}

export interface UpsertLeadBillingAddressesDto {
  lead_id: number;
  vendor_id: number;
  product_type_id?: number | null;
  billingAddress?: LeadBillingAddressInput | null;
  shippingAddress?: LeadBillingAddressInput | null;
}
