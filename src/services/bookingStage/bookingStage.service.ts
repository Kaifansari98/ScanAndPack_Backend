import { prisma } from "../../prisma/client";
import { CreateBookingStageDto } from "../../types/booking-stage.dto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import wasabi, { generateSignedUrl } from "../../utils/wasabiClient";
import { sanitizeFilename } from "../../utils/sanitizeFilename";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export class BookingStageService {

  // Generate signed URL for file access
  public async generateSignedUrl(s3Key: string, vendorId: number, expiresIn: number = 3600): Promise<string> {
    try {
      // Validate that the file belongs to the vendor (security check)
      const document = await prisma.leadDocuments.findFirst({
        where: {
          doc_sys_name: s3Key,
          vendor_id: vendorId,
          deleted_at: null
        }
      });

      if (!document) {
        throw new Error('Document not found or access denied');
      }

      // Generate signed URL
      const command = new GetObjectCommand({
        Bucket: process.env.WASABI_BUCKET_NAME || 'your-bucket-name',
        Key: s3Key,
      });

      const signedUrl = await getSignedUrl(wasabi, command, { 
        expiresIn: expiresIn // URL expires in 1 hour by default
      });

      return signedUrl;

    } catch (error: any) {
      console.error('[PaymentUploadService] Error generating signed URL:', error);
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

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
        throw new Error("At least one final document must be uploaded");
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

      // ➕ NEW: Ledger Entry
      await tx.ledger.create({
        data: {
          lead_id: data.lead_id,
          account_id: data.account_id,
          client_id: data.client_id,
          vendor_id: data.vendor_id,
          created_by: data.created_by,
          amount: data.bookingAmount,
          payment_date: new Date(),
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

      const bookingPayment = await tx.paymentInfo.create({
        data: {
          lead_id: data.lead_id,
          account_id: data.account_id,
          vendor_id: data.vendor_id,
          created_by: data.created_by,
          amount: data.bookingAmount,
          payment_text: data.bookingAmountPaymentDetailsText || null,
          payment_file_id: paymentFileId, // may be null if no file
          payment_date: new Date(),
          payment_type_id: bookingPaymentType.id,
        }
      });
      response.paymentInfo = bookingPayment;

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

  public async addBookingStageFiles(data: {
    lead_id: number;
    account_id: number;
    vendor_id: number;
    created_by: number;
    finalDocuments?: Express.Multer.File[];
  }) {
    return await prisma.$transaction(async (tx) => {
      const response: any = {
        documentsUploaded: [],
      };
  
      // 1. Upload Final Documents
      if (data.finalDocuments && data.finalDocuments.length > 0) {
        const finalDocType = await tx.documentTypeMaster.findFirst({
          where: { vendor_id: data.vendor_id, tag: "Type 8" }, // Final Documents
        });
        if (!finalDocType) throw new Error("Final Document type not found for this vendor");
  
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
      }
  
      return response;
    });
  }

  public async getBookingStage(leadId: number, vendorId: number) {
    const lead = await prisma.leadMaster.findUnique({
      where: { id: leadId },
      include: {
        documents: {
          where: {
            is_deleted: false,
            documentType: {
              tag: "Type 8",
              vendor_id: vendorId, // ✅ now directly filter
            },
          },
          include: { documentType: true },
        },
        payments: {
          where: {
            paymentType: {
              type: "booking_amount", // ✅ filter only booking_amount type payments
            },
          },
          include: {
            paymentType: true,
            document: true,
          },
        },
        // ledgers: true,
        siteSupervisors: {
          where: { status: "active" }, // ✅ only active supervisors
          include: { supervisor: true },
        },
      },
    });
  
    if (!lead) {
      throw new Error("Lead not found");
    }

    // 🔹 Generate signed URLs for each document
    const documentsWithUrls = await Promise.all(
      lead.documents.map(async (doc) => {
        const signedUrl = await generateSignedUrl(doc.doc_sys_name, 3600, "inline");
        return {
          id: doc.id,
          originalName: doc.doc_og_name,
          s3Key: doc.doc_sys_name,
          type: doc.documentType?.tag,
          signedUrl, // ✅ added signed URL
        };
      })
    );
  
    return {
      leadId: lead.id,
      name: `${lead.firstname} ${lead.lastname}`,
      finalBookingAmount: lead.final_booking_amt,
      vendorId: lead.vendor_id,
      documents: documentsWithUrls,
      payments: await Promise.all(
        lead.payments.map(async (p) => {
          let file: any = null;
          if (p.document) {
            const signedUrl = await generateSignedUrl(p.document.doc_sys_name, 3600, "inline");
            file = {
              id: p.document.id,
              originalName: p.document.doc_og_name,
              signedUrl,
            };
          }
  
          return {
            id: p.id,
            amount: p.amount,
            date: p.payment_date,
            text: p.payment_text,
            type: p.paymentType?.tag,
            file,
          };
        })
      ),
      // ledger: lead.ledgers.map((l) => ({
      //   id: l.id,
      //   type: l.type,
      //   amount: l.amount,
      //   date: l.payment_date,
      // })),
      supervisors: lead.siteSupervisors.map((s) => ({
        // id: s.id,
        userId: s.user_id,
        userName: s.supervisor.user_name,
        status: s.status,
      })),
    };
  }

  public static async getLeadsWithStatusBooking(vendorId: number) {
    const leads = await prisma.leadMaster.findMany({
      where: {
        status_id: 4,
        is_deleted: false,
        vendor_id: vendorId,
      },
      include: {
        account: { select: {
          id: true,
          name: true,
        }},
        siteType: true,
        source: true,
        statusType: true,
        createdBy: { select: { id: true, user_name: true } },
        updatedBy: true,
        assignedTo: { select: { id: true, user_name: true } },
        assignedBy: { select: { id: true, user_name: true } },
        productMappings: {
          select: {
            productType: { select: { id: true, type: true } },
          },
        },
        leadProductStructureMapping: {
          select: {
            productStructure: { select: { id: true, type: true } },
          },
        },
        payments: {
          where: {
            paymentType: {
              tag: "Type 2",            // ✅ Only Type 2 payments
              vendor_id: vendorId,      // ✅ Match current vendor
            },
          },
          select: {
            id: true,
            amount: true,
            payment_date: true,
            payment_text: true,
            payment_file_id: true,
            payment_type_id: true,
            paymentType: { select: { id: true, type: true, tag: true } },
          },
        },
        siteSupervisors: {
          where: { status: "active" },
          select: {
            supervisor: {
              select: { id: true, user_name: true },
            },
          },
        },        
        // ✅ Fetch only documents where DocumentTypeMaster.tag = "Type 8"
        documents: {
          where: {
            is_deleted: false,
            documentType: {
              tag: "Type 8",
              vendor_id: vendorId,
            },
          },
          include: {
            documentType: { select: { id: true, type: true, tag: true } },
            createdBy: { select: { id: true, user_name: true } },
          },
        },
      },
      orderBy: { created_at: "desc" },
    });
  
    // ✅ Generate signed URLs for all documents
    const data = await Promise.all(
      leads.map(async (lead) => {
        const docsWithUrls = await Promise.all(
          lead.documents.map(async (doc) => {
            const signed_url = await generateSignedUrl(doc.doc_sys_name);
            return {
              ...doc,
              signed_url,
              file_type: BookingStageService.getFileType(doc.doc_og_name),
              is_image: BookingStageService.isImageFile(doc.doc_og_name),
            };
          })
        );
  
        return {
          ...lead,
          documents: docsWithUrls,
          siteSupervisors: lead.siteSupervisors.map((s) => s.supervisor),
        };
      })
    );
  
    return data;
  }

  public static async getLeadsWithStatusOpen(vendorId: number) {
    const leads = await prisma.leadMaster.findMany({
      where: {
        status_id: 1,
        is_deleted: false,
        vendor_id: vendorId,
      },
      include: {
        siteType: true,
        source: true,
        statusType: true,
        createdBy: { select: { id: true, user_name: true } },
        updatedBy: true,
        assignedTo: { select: { id: true, user_name: true } },
        assignedBy: { select: { id: true, user_name: true } },
        productMappings: {
          select: {
            productType: { select: { id: true, type: true } },
          },
        },
        leadProductStructureMapping: {
          select: {
            productStructure: { select: { id: true, type: true } },
          },
        },
        // payments: {
        //   select: {
        //     id: true,
        //     amount: true,
        //     payment_date: true,
        //     payment_text: true,
        //     payment_file_id: true,
        //     payment_type_id: true,
        //     paymentType: { select: { id: true, type: true } },
        //   },
        // },
        // siteSupervisors: {
        //   select: {
        //     supervisor: { select: { id: true, user_name: true } },
        //   },
        // },
        // ✅ Fetch only documents where DocumentTypeMaster.tag = "Type 8"
        documents: {
          where: {
            is_deleted: false,
            documentType: {
              tag: "Type 1",
              vendor_id: vendorId,
            },
          },
          include: {
            documentType: { select: { id: true, type: true, tag: true } },
            createdBy: { select: { id: true, user_name: true } },
          },
        },
      },
      orderBy: { created_at: "desc" },
    });
  
    // ✅ Generate signed URLs for all documents
    const data = await Promise.all(
      leads.map(async (lead) => {
        const docsWithUrls = await Promise.all(
          lead.documents.map(async (doc) => {
            const signed_url = await generateSignedUrl(doc.doc_sys_name);
            return {
              ...doc,
              signed_url,
              file_type: BookingStageService.getFileType(doc.doc_og_name),
              is_image: BookingStageService.isImageFile(doc.doc_og_name),
            };
          })
        );
  
        return {
          ...lead,
          documents: docsWithUrls,
        };
      })
    );
  
    return data;
  }
  
  // ✅ Helpers (you already have these in your other service)
  private static getFileType(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (!ext) return "unknown";
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "image";
    if (["pdf"].includes(ext)) return "pdf";
    if (["doc", "docx"].includes(ext)) return "word";
    if (["xls", "xlsx"].includes(ext)) return "excel";
    return ext;
  }
  
  private static isImageFile(filename: string): boolean {
    const ext = filename.split(".").pop()?.toLowerCase();
    return ["jpg", "jpeg", "png", "gif", "webp"].includes(ext || "");
  }
  
  public async editBookingStage(data: Partial<CreateBookingStageDto>) {
    return await prisma.$transaction(async (tx) => {
      const response: any = {
        updatedFields: {},
        message: "Booking stage updated successfully",
      };
  
      // 1. Update LeadMaster fields if provided
      if (data.finalBookingAmount !== undefined) {
        const lead = await tx.leadMaster.update({
          where: { id: data.lead_id },
          data: { final_booking_amt: data.finalBookingAmount },
        });
        response.updatedFields.leadMaster = lead;
      }
  
      // 2. Update Booking Amount (paymentInfo + ledger)
      if (data.bookingAmount !== undefined) {
        const bookingPaymentType = await tx.paymentTypeMaster.findFirst({
          where: { vendor_id: data.vendor_id, tag: "Type 2" },
        });
        if (!bookingPaymentType) throw new Error("Payment type not found for vendor");
  
        // 🔹 Find latest paymentInfo
        const existingPayment = await tx.paymentInfo.findFirst({
          where: {
            lead_id: data.lead_id!,
            payment_type_id: bookingPaymentType.id,
          },
          orderBy: { created_at: "desc" },
        });
  
        let payment;
        if (existingPayment) {
          payment = await tx.paymentInfo.update({
            where: { id: existingPayment.id },
            data: {
              amount: data.bookingAmount,
              payment_text: data.bookingAmountPaymentDetailsText || existingPayment.payment_text, // ✅ added
            },
          });
        } else {
          payment = await tx.paymentInfo.create({
            data: {
              lead_id: data.lead_id!,
              account_id: data.account_id!,
              vendor_id: data.vendor_id!,
              created_by: data.created_by!,
              amount: data.bookingAmount,
              payment_date: new Date(),
              payment_type_id: bookingPaymentType.id,
              payment_text: data.bookingAmountPaymentDetailsText || null, // ✅ added
            },
          });
        }
  
        response.updatedFields.paymentInfo = payment;
  
        // Always add a new ledger entry
        await tx.ledger.create({
          data: {
            lead_id: data.lead_id!,
            account_id: data.account_id!,
            client_id: data.client_id!,
            vendor_id: data.vendor_id!,
            created_by: data.created_by!,
            amount: data.bookingAmount,
            payment_date: new Date(),
            type: "credit",
          },
        });
      }
  
      // 3. Update supervisor
      if (data.siteSupervisorId) {

        // Step 1: Mark all existing supervisors for this lead as inactive
        await tx.leadSiteSupervisorMapping.updateMany({
          where: {
            lead_id: data.lead_id!,
            vendor_id: data.vendor_id!,
            account_id: data.account_id!,
          },
          data: {
            status: "inactive",
          },
        });

        // Step 2: Check if this supervisor already exists for the lead
        const existingSupervisor = await tx.leadSiteSupervisorMapping.findFirst({
          where: {
            lead_id: data.lead_id!,
            user_id: data.siteSupervisorId,
            vendor_id: data.vendor_id!,
            account_id: data.account_id!,
          },
        });

        let supervisor;
        if (existingSupervisor) {
          // Update status to active
          supervisor = await tx.leadSiteSupervisorMapping.update({
            where: { id: existingSupervisor.id },
            data: { status: "active" },
          });
        } else {
          // Create new mapping with active status
          supervisor = await tx.leadSiteSupervisorMapping.create({
            data: {
              lead_id: data.lead_id!,
              user_id: data.siteSupervisorId,
              vendor_id: data.vendor_id!,
              account_id: data.account_id!,
              created_by: data.created_by!,
              status: "active",
            },
          });
        }
  
        response.updatedFields.supervisor = supervisor;
      }
  
      return response;
    });
  }
  
}