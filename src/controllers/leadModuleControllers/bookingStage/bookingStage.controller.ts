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
}
