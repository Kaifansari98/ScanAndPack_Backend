import { prisma } from "../../prisma/client";
import { CreateBookingStageDto } from "../../types/booking-stage.dto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import wasabi from "../../utils/wasabiClient";
import { sanitizeFilename } from "../../utils/sanitizeFilename";

export class BookingStageService {
  public async createBookingStage(data: CreateBookingStageDto) {
    return await prisma.$transaction(async (tx) => {
      const response: any = {
        documentsUploaded: [],
        paymentInfo: null,
        supervisorAssigned: null,
        message: "Booking stage completed successfully"
      };

      // 1. Upload Final Documents (mandatory)
      if (!data.finalDocuments || data.finalDocuments.length === 0) {
        throw new Error("Final documents are required");
      }

      const finalDocType = await tx.documentTypeMaster.findFirst({
        where: { vendor_id: data.vendor_id, tag: "Type 8" },
      });
      if (!finalDocType) {
        throw new Error("Document type (Final Documents) not found for this vendor");
      }

      for (const file of data.finalDocuments) {
        const sanitizedName = sanitizeFilename(file.originalname);
        const s3Key = `final-documents-booking/${data.vendor_id}/${data.lead_id}/${Date.now()}-${sanitizedName}`;

        await wasabi.send(new PutObjectCommand({
          Bucket: process.env.WASABI_BUCKET_NAME!,
          Key: s3Key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }));

        const document = await tx.leadDocuments.create({
          data: {
            doc_og_name: file.originalname,
            doc_sys_name: s3Key,
            created_by: data.created_by,
            doc_type_id: finalDocType.id,
            account_id: data.account_id,
            lead_id: data.lead_id,
            vendor_id: data.vendor_id,
          }
        });

        response.documentsUploaded.push({
          id: document.id,
          type: "final_document",
          originalName: file.originalname,
          s3Key,
        });
      }

      // 2. Booking Amount (PaymentInfo)
      const bookingPaymentType = await tx.paymentTypeMaster.findFirst({
        where: { vendor_id: data.vendor_id, tag: "Type 2" },
      });
      if (!bookingPaymentType) {
        throw new Error("Payment type (Booking Amount) not found for this vendor");
      }

      const bookingPayment = await tx.paymentInfo.create({
        data: {
          lead_id: data.lead_id,
          account_id: data.account_id,
          vendor_id: data.vendor_id,
          created_by: data.created_by,
          amount: data.bookingAmount,
          payment_date: new Date(),
          payment_type_id: bookingPaymentType.id,
        }
      });

      response.paymentInfo = bookingPayment;

      // ➕ NEW: Ledger Entry
      await tx.ledger.create({
        data: {
          lead_id: data.lead_id,
          account_id: data.account_id,
          client_id: data.client_id,            // required
          vendor_id: data.vendor_id,
          created_by: data.created_by,
          amount: data.bookingAmount,
          payment_date: new Date(),             // required
          type: "credit",
        }
      });      

      // 3. Booking Amount Payment Details
      let paymentFileId: number | null = null;
      if (data.bookingAmountPaymentDetailsFile) {
        const sanitizedName = sanitizeFilename(data.bookingAmountPaymentDetailsFile.originalname);
        const s3Key = `booking-amount-payment-details/${data.vendor_id}/${data.lead_id}/${Date.now()}-${sanitizedName}`;

        await wasabi.send(new PutObjectCommand({
          Bucket: process.env.WASABI_BUCKET_NAME!,
          Key: s3Key,
          Body: data.bookingAmountPaymentDetailsFile.buffer,
          ContentType: data.bookingAmountPaymentDetailsFile.mimetype,
        }));

        const document = await tx.leadDocuments.create({
          data: {
            doc_og_name: data.bookingAmountPaymentDetailsFile.originalname,
            doc_sys_name: s3Key,
            created_by: data.created_by,
            doc_type_id: finalDocType.id,
            account_id: data.account_id,
            lead_id: data.lead_id,
            vendor_id: data.vendor_id,
          }
        });

        paymentFileId = document.id;
      }

      await tx.paymentInfo.create({
        data: {
          lead_id: data.lead_id,
          account_id: data.account_id,
          vendor_id: data.vendor_id,
          created_by: data.created_by,
          amount: data.bookingAmount,
          payment_text: data.bookingAmountPaymentDetailsText || null,
          payment_file_id: paymentFileId,
          payment_date: new Date(),
          payment_type_id: bookingPaymentType.id,
        }
      });

      // 4. Update LeadMaster final_booking_amt
      await tx.leadMaster.update({
        where: { id: data.lead_id },
        data: { final_booking_amt: data.finalBookingAmount, status_id: 4 }, // Assuming status 3 = Booking
      });

      // 5. Assign Site Supervisor
      const supervisor = await tx.leadSiteSupervisorMapping.create({
        data: {
          lead_id: data.lead_id,
          user_id: data.siteSupervisorId,
          vendor_id: data.vendor_id,
          account_id: data.account_id,
          created_by: data.created_by, // ✅ required field
        }
      });      

      response.supervisorAssigned = supervisor;

      return response;
    }, {
      timeout: 15000, // 15 seconds instead of 5
    });
  }
}
