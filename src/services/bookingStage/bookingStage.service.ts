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

  public async getBookingStage(leadId: number) {
    const lead = await prisma.leadMaster.findUnique({
      where: { id: leadId },
      include: {
        documents: {
          where: { is_deleted: false },
          include: { documentType: true },
        },
        payments: {
          include: { paymentType: true, document: true },
        },
        ledgers: true,
        siteSupervisors: {
          include: { supervisor: true },
        },
      },
    });
  
    if (!lead) {
      throw new Error("Lead not found");
    }
  
    return {
      leadId: lead.id,
      name: `${lead.firstname} ${lead.lastname}`,
      finalBookingAmount: lead.final_booking_amt,
      documents: lead.documents.map((doc) => ({
        id: doc.id,
        originalName: doc.doc_og_name,
        s3Key: doc.doc_sys_name,
        type: doc.documentType?.tag,
      })),
      payments: lead.payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        date: p.payment_date,
        text: p.payment_text,
        type: p.paymentType?.tag,
        file: p.document
          ? { id: p.document.id, originalName: p.document.doc_og_name }
          : null,
      })),
      ledger: lead.ledgers.map((l) => ({
        id: l.id,
        type: l.type,
        amount: l.amount,
        date: l.payment_date,
      })),
      supervisors: lead.siteSupervisors.map((s) => ({
        id: s.id,
        userId: s.user_id,
        userName: s.supervisor.user_name,
        status: s.status,
      })),
    };
  } 
  
  public static async getLeadsWithStatus4(vendorId: number) {
    return prisma.leadMaster.findMany({
      where: {
        status_id: 4,
        is_deleted: false,
        vendor_id: vendorId,
      },
      include: {
        // vendor: true,
        siteType: true,
        source: true,
        // account: true,
        statusType: true,
        createdBy: {
          select: {
            id: true,
            user_name: true,
          }
        },
        updatedBy: true,
        assignedTo: {
          select: {
            id: true,
            user_name: true,
          }
        },
        assignedBy: {
          select: {
            id: true,
            user_name: true,
          }
        },
        productMappings: {
          select: { productType: {
            select: {
              id: true,
              type: true,
            }
          },
         },
        },
        leadProductStructureMapping: {
          select: {
            productStructure: {
              select: {
                id: true,
                type: true,
              }
            }
          }
        },
        // documents: {
        //   include: { documentType: {
        //     select: {
        //       type: true,
        //       tag: true,
        //     }
        //   } },
        // },
        payments: {
          select: {
            id: true,
            amount: true,
            payment_date: true,
            payment_text: true,
            payment_file_id: true,
            payment_type_id: true,
            paymentType: {
              select: {
                id: true,
                type: true,
              }
            }
          }
        },
        // ledgers: true,
        // leadStatusLogs: {
        //   include: { statusType: true, createdBy: true },
        // },
        // designMeeting: true,
        // designSelection: true,
        siteSupervisors: {
          select: { supervisor: {
            select: {
              id: true,
              user_name: true,
            }
          } },
        },
      },
    });
  }  
}