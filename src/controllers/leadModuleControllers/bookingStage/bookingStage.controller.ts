import { Request, Response } from "express";
import { BookingStageService } from "../../../services/bookingStage/bookingStage.service";
import { CreateBookingStageDto } from "../../../types/booking-stage.dto";

export class BookingStageController {
  private bookingStageService = new BookingStageService();

  public createBookingStage = async (req: Request, res: Response): Promise<void> => {
    try {
      const { lead_id, account_id, vendor_id, created_by, client_id, bookingAmount, bookingAmountPaymentDetailsText, finalBookingAmount, siteSupervisorId } = req.body;

      if (!lead_id || !account_id || !vendor_id || !created_by || !client_id || !bookingAmount || !finalBookingAmount || !siteSupervisorId) {
        res.status(400).json({ success: false, message: "Missing required fields" });
        return;
      }

      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const finalDocuments = files?.final_documents || [];
      const bookingAmountPaymentDetailsFile = files?.booking_payment_file?.[0];

      if (!finalDocuments || finalDocuments.length === 0) {
        res.status(400).json({ success: false, message: "Final documents are mandatory" });
        return;
      }

      const dto: CreateBookingStageDto = {
        lead_id: parseInt(lead_id),
        account_id: parseInt(account_id),
        vendor_id: parseInt(vendor_id),
        created_by: parseInt(created_by),
        client_id: parseInt(client_id),
        bookingAmount: parseFloat(bookingAmount),
        bookingAmountPaymentDetailsText,
        finalBookingAmount: parseFloat(finalBookingAmount),
        siteSupervisorId: parseInt(siteSupervisorId),
        finalDocuments,
        bookingAmountPaymentDetailsFile,
      };

      const result = await this.bookingStageService.createBookingStage(dto);
      res.status(201).json({ success: true, message: "Booking stage completed", data: result });

    } catch (error: any) {
      console.error("[BookingStageController] Error:", error);
      res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  };

  public addBookingStageFiles = async (req: Request, res: Response): Promise<void> => {
    try {
      const { lead_id, account_id, vendor_id, created_by } = req.body;
  
      if (!lead_id || !account_id || !vendor_id || !created_by) {
        res.status(400).json({ success: false, message: "Missing required fields" });
        return;
      }
  
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const finalDocuments = files?.final_documents || [];
  
      if (!finalDocuments || finalDocuments.length === 0) {
        res.status(400).json({ success: false, message: "[BOOKING STAGE] At least one file must be uploaded of finalDocuments" });
        return;
      }
  
      const dto = {
        lead_id: parseInt(lead_id),
        account_id: parseInt(account_id),
        vendor_id: parseInt(vendor_id),
        created_by: parseInt(created_by),
        finalDocuments,
      };
  
      const result = await this.bookingStageService.addBookingStageFiles(dto);
      res.status(201).json({ success: true, message: "Final documents uploaded successfully", data: result });
  
    } catch (error: any) {
      console.error("[BookingStageController] Error adding files:", error);
      res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  };
  
  public getBookingStage = async (req: Request, res: Response): Promise<void> => {
    try {
      const leadId = parseInt(req.params.leadId);
  
      if (!leadId) {
        res.status(400).json({ success: false, message: "leadId is required" });
        return;
      }
  
      const result = await this.bookingStageService.getBookingStage(leadId);
  
      res.status(200).json({
        success: true,
        message: "Booking stage details fetched successfully",
        data: result,
      });
    } catch (error: any) {
      console.error("[BookingStageController] Get Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  public getBookingLeads = async (req: Request, res: Response) => {
    try {
      const vendorId = parseInt(req.params.vendorId);
  
      if (!vendorId) {
        return res.status(400).json({ success: false, message: "Vendor ID is required" });
      }
  
      const leads = await BookingStageService.getLeadsWithStatusBooking(vendorId);
  
      return res.status(200).json({
        success: true,
        message: "Leads with status_id = 4 fetched successfully",
        data: leads,
      });
    } catch (error: any) {
      console.error("[BookingStageController] GetStatus4Leads Error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Something went wrong",
      });
    }
  };

  public getOpenLeads = async (req: Request, res: Response) => {
    try {
      const vendorId = parseInt(req.params.vendorId);
  
      if (!vendorId) {
        return res.status(400).json({ success: false, message: "Vendor ID is required" });
      }
  
      const leads = await BookingStageService.getLeadsWithStatusOpen(vendorId);
  
      return res.status(200).json({
        success: true,
        message: "Leads with status_id = 1 fetched successfully",
        data: leads,
      });
    } catch (error: any) {
      console.error("[BookingStageController] getOpenLeads Error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Something went wrong",
      });
    }
  };

  // bookingStage.controller.ts
  public editBookingStage = async (req: Request, res: Response) => {
    try {
      const dto = {
        lead_id: parseInt(req.body.lead_id),
        account_id: parseInt(req.body.account_id),
        vendor_id: parseInt(req.body.vendor_id),
        created_by: parseInt(req.body.created_by),
        client_id: req.body.client_id ? parseInt(req.body.client_id) : undefined,
        bookingAmount: req.body.bookingAmount ? parseFloat(req.body.bookingAmount) : undefined,
        finalBookingAmount: req.body.finalBookingAmount ? parseFloat(req.body.finalBookingAmount) : undefined,
        siteSupervisorId: req.body.siteSupervisorId ? parseInt(req.body.siteSupervisorId) : undefined,
        bookingAmountPaymentDetailsText: req.body.bookingAmountPaymentDetailsText || undefined, // ✅ added
      };
  
      const result = await this.bookingStageService.editBookingStage(dto);
      res.status(200).json({ success: true, message: "Booking stage updated", data: result });
    } catch (error: any) {
      console.error("[BookingStageController] Edit Error:", error);
      res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  };    
  
}