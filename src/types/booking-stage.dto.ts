import { Express } from "express";

export interface CreateBookingStageDto {
  lead_id: number;
  account_id: number;
  vendor_id: number;
  created_by: number;
  client_id: number;
  bookingAmount: number;
  bookingAmountPaymentDetailsText?: string;
  finalBookingAmount: number;
  siteSupervisorId: number;

  // Files
  finalDocuments: Express.Multer.File[];
  bookingAmountPaymentDetailsFile?: Express.Multer.File;
}

export interface AddPaymentDto {
  lead_id: number;
  account_id: number;
  vendor_id: number;
  client_id: number;
  created_by: number;
  amount: number;
  payment_text: string;       // ✅ mandatory
  payment_date: string;       // ✅ mandatory
  payment_file?: Express.Multer.File; // optional
}