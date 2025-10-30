import { PutObjectCommand } from "@aws-sdk/client-s3";
import wasabi from "../../../utils/wasabiClient";
import { sanitizeFilename } from "../../../utils/fileUtils";
import {
  CreatePaymentUploadDto,
  PaymentUploadResponseDto,
  PaymentUploadDetailDto,
  PaymentAnalyticsDto,
  PaymentUploadListDto,
  DocumentDownloadDto,
  AssignTaskISMInput,
} from "../../../types/leadModule.types";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { LeadDetailDto } from "../../../types/leadModule.types";
import {
  PaymentUploadDetailDtoo,
  UpdatePaymentUploadDto,
} from "../../../types/leadModule.types";
import { prisma } from "../../../prisma/client";
import Joi from "joi";
import logger from "../../../utils/logger";
import { Prisma } from "@prisma/client";
import { generateSignedUrl } from "../../../utils/wasabiClient";

// ----------------------
// AssignTaskISM (standalone)
// ----------------------

const assignTaskISMSchema = Joi.object({
  lead_id: Joi.number().integer().positive().required(),
  task_type: Joi.string().trim().required(),
  due_date: Joi.alternatives()
    .try(Joi.string().isoDate(), Joi.date())
    .required(),
  remark: Joi.string().allow("", null),
  assignee_user_id: Joi.number().integer().positive().required(),
  created_by: Joi.number().integer().positive().required(),
});

export const assignTaskISMService = async (payload: AssignTaskISMInput) => {
  const { error, value } = assignTaskISMSchema.validate(payload);
  if (error) {
    throw new Error(
      `Validation failed: ${error.details.map((d) => d.message).join(", ")}`
    );
  }

  const { lead_id, task_type, due_date, remark, assignee_user_id, created_by } =
    value;

  return prisma.$transaction(async (tx) => {
    // 1) Lead (for vendor/account)
    const lead = await tx.leadMaster.findUnique({
      where: { id: lead_id },
      select: { id: true, vendor_id: true, account_id: true },
    });
    if (!lead) throw new Error(`Lead ${lead_id} not found`);

    // 2) Assignee guard (same vendor)
    const assignee = await tx.userMaster.findUnique({
      where: { id: assignee_user_id },
      select: { id: true, user_name: true, vendor_id: true },
    });
    if (!assignee)
      throw new Error(`Assignee user ${assignee_user_id} not found`);
    if (assignee.vendor_id !== lead.vendor_id) {
      throw new Error(
        `Assignee user ${assignee_user_id} does not belong to vendor ${lead.vendor_id}`
      );
    }

    // 3) Create task (status=open by default)
    const task = await tx.userLeadTask.create({
      data: {
        lead_id: lead.id,
        account_id: lead.account_id!,
        vendor_id: lead.vendor_id,
        user_id: assignee_user_id,
        task_type,
        due_date: new Date(due_date),
        remark: remark || null,
        status: "open",
        created_by,
      },
    });

    // 4) Flip status only if NOT "Follow Up"
    let updatedLead: {
      id: number;
      account_id: number | null; // ✅ nullable
      vendor_id: number;
      status_id: number | null; // ✅ explicit, matches Prisma
    } = { ...lead, status_id: null };

    if (task_type.toLowerCase() !== "follow up") {
      const toStatus = await tx.statusTypeMaster.findFirst({
        where: { vendor_id: lead.vendor_id, tag: "Type 2" },
        select: { id: true },
      });
      if (!toStatus) {
        throw new Error(
          `Status 'Type 2' not found for vendor ${lead.vendor_id}`
        );
      }

      updatedLead = await tx.leadMaster.update({
        where: { id: lead.id },
        data: { status_id: toStatus.id },
        select: {
          id: true,
          account_id: true,
          vendor_id: true,
          status_id: true,
        },
      });
    }

    // 5️⃣ Build action message for LeadDetailedLogs
    let actionMessage = "";
    const formattedDate = new Date(due_date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    if (task_type === "Initial Site Measurement") {
      actionMessage = `Lead has been assigned to ${assignee.user_name} for Initial Site Measurement on ${formattedDate}.`;
    } else if (task_type === "Follow Up") {
      actionMessage = `Lead has been assigned to ${assignee.user_name} for Follow Up on ${formattedDate}.`;
    }

    // Append remark if present
    if (remark && remark.trim() !== "") {
      actionMessage += ` — Remark: ${remark.trim()}`;
    }

    // Append remark if present
    if (remark && remark.trim() !== "") {
      actionMessage += ` — Remark: ${remark.trim()}`;
    }

    // 6️⃣ Insert into LeadDetailedLogs
    if (actionMessage) {
      await tx.leadDetailedLogs.create({
        data: {
          vendor_id: lead.vendor_id,
          lead_id: lead.id,
          account_id: lead.account_id!,
          action: actionMessage,
          action_type: "CREATE",
          created_by,
          created_at: new Date(),
        },
      });

      logger.info("✅ LeadDetailedLogs entry created for ISM task assignment", {
        lead_id: lead.id,
        task_id: task.id,
        task_type,
        assignee_user_id,
        actionMessage,
      });
    }

    logger.info("[SERVICE] assignTaskISM completed", {
      lead_id: lead.id,
      task_id: task.id,
      new_status_id: updatedLead.status_id,
    });

    return { task, lead: updatedLead };
  });
};

export class PaymentUploadService {
  public async getISMDetailsByLeadId(leadId: number): Promise<any> {
    try {
      // Step 1: Get vendor_id from leadMaster
      const lead = await prisma.leadMaster.findUnique({
        where: { id: leadId },
        select: { vendor_id: true },
      });

      if (!lead) {
        throw new Error("Lead not found");
      }

      const vendorId = lead.vendor_id;

      // Step 2: Get document type IDs
      const [sitePhotoDocType, pdfDocType, paymentDocType] = await Promise.all([
        prisma.documentTypeMaster.findFirst({
          where: { vendor_id: vendorId, tag: "Type 2" },
        }),
        prisma.documentTypeMaster.findFirst({
          where: { vendor_id: vendorId, tag: "Type 3" },
        }),
        prisma.documentTypeMaster.findFirst({
          where: { vendor_id: vendorId, tag: "Type 4" },
        }),
      ]);

      // Step 3: Fetch documents
      const [sitePhotos, pdfDocs, paymentDocs] = await Promise.all([
        sitePhotoDocType
          ? prisma.leadDocuments.findMany({
              where: {
                lead_id: leadId,
                vendor_id: vendorId,
                doc_type_id: sitePhotoDocType.id,
              },
            })
          : [],
        pdfDocType
          ? prisma.leadDocuments.findMany({
              where: {
                lead_id: leadId,
                vendor_id: vendorId,
                doc_type_id: pdfDocType.id,
              },
            })
          : [],
        paymentDocType
          ? prisma.leadDocuments.findMany({
              where: {
                lead_id: leadId,
                vendor_id: vendorId,
                doc_type_id: paymentDocType.id,
              },
            })
          : [],
      ]);

      // Step 4: Generate signed URLs with util
      const withSignedUrls = async (docs: any[], type: string) => {
        return Promise.all(
          docs.map(async (doc) => ({
            id: doc.id,
            type,
            originalName: doc.doc_og_name,
            uploadedAt: doc.created_at,
            s3Key: doc.doc_sys_name,
            signedUrl: await generateSignedUrl(doc.doc_sys_name),
          }))
        );
      };

      const current_site_photos = await withSignedUrls(
        sitePhotos,
        "current_site_photo"
      );
      const initial_site_measurement_documents = await withSignedUrls(
        pdfDocs,
        "pdf_upload"
      );
      const initial_site_measurement_payment_details = await withSignedUrls(
        paymentDocs,
        "initial_site_measurement_payment_details"
      );

      // Step 5: Fetch payment info
      const paymentInfo = await prisma.paymentInfo.findFirst({
        where: { lead_id: leadId, vendor_id: vendorId },
        select: {
          id: true,
          amount: true,
          payment_date: true,
          payment_text: true,
          payment_file_id: true,
        },
      });

      // Step 6: If payment_file_id exists, link it with signedUrl
      if (paymentInfo?.payment_file_id) {
        const paymentDoc = await prisma.leadDocuments.findUnique({
          where: { id: paymentInfo.payment_file_id },
        });

        if (paymentDoc) {
          (paymentInfo as any).payment_file = {
            id: paymentDoc.id,
            originalName: paymentDoc.doc_og_name,
            uploadedAt: paymentDoc.created_at,
            signedUrl: await generateSignedUrl(paymentDoc.doc_sys_name),
          };
        }
      }

      return {
        current_site_photos,
        initial_site_measurement_documents,
        initial_site_measurement_payment_details,
        payment_info: paymentInfo,
      };
    } catch (error: any) {
      console.error("[PaymentUploadService] Error:", error);
      throw new Error(`Failed to fetch ISM details: ${error.message}`);
    }
  }

  public async getISMPaymentInfoByLeadId(leadId: number): Promise<any> {
    try {
      // 1. Get vendor_id from leadMaster
      const lead = await prisma.leadMaster.findUnique({
        where: { id: leadId },
        select: { vendor_id: true },
      });

      if (!lead) {
        throw new Error("Lead not found");
      }

      const vendorId = lead.vendor_id;

      // 2. Fetch paymentInfo
      const paymentInfo = await prisma.paymentInfo.findFirst({
        where: { lead_id: leadId, vendor_id: vendorId },
        select: {
          id: true,
          amount: true,
          payment_date: true,
          payment_text: true,
          payment_file_id: true,
        },
      });

      if (!paymentInfo) {
        return null; // no payment info
      }

      // 3. Attach signedUrl if payment_file_id exists
      if (paymentInfo.payment_file_id) {
        const paymentDoc = await prisma.leadDocuments.findUnique({
          where: { id: paymentInfo.payment_file_id },
        });

        if (paymentDoc) {
          (paymentInfo as any).payment_file = {
            id: paymentDoc.id,
            originalName: paymentDoc.doc_og_name,
            signedUrl: await generateSignedUrl(paymentDoc.doc_sys_name),
          };
        }
      }

      return paymentInfo;
    } catch (error: any) {
      console.error("[PaymentUploadService] Error:", error);
      throw new Error(`Failed to fetch ISM payment info: ${error.message}`);
    }
  }

  public async createPaymentUpload(
    data: CreatePaymentUploadDto
  ): Promise<PaymentUploadResponseDto> {
    try {
      // Start a transaction to ensure data consistency
      const result = await prisma.$transaction(
        async (tx: any) => {
          const response: PaymentUploadResponseDto = {
            paymentInfo: null,
            ledgerEntry: null,
            documentsUploaded: [],
            message: "Upload completed successfully",
          };

          // 1. Upload site photos to Wasabi and save to LeadDocuments (doc_type = 1)
          if (data.sitePhotos && data.sitePhotos.length > 0) {
            // Validate that document type with id = 1 exists for this vendor
            const sitePhotoDocType = await tx.documentTypeMaster.findFirst({
              where: { vendor_id: data.vendor_id, tag: "Type 2" },
            });

            if (!sitePhotoDocType) {
              throw new Error(
                "Document type (site photos) not found for this vendor"
              );
            }

            for (const photo of data.sitePhotos) {
              const sanitizedFilename = sanitizeFilename(photo.originalname);
              const s3Key = `current_site_photos/${data.vendor_id}/${
                data.lead_id
              }/${Date.now()}-${sanitizedFilename}`;

              // Upload to Wasabi
              await wasabi.send(
                new PutObjectCommand({
                  Bucket: process.env.WASABI_BUCKET_NAME || "your-bucket-name",
                  Key: s3Key,
                  Body: photo.buffer,
                  ContentType: photo.mimetype,
                })
              );

              // Save document info to database
              const document = await tx.leadDocuments.create({
                data: {
                  doc_og_name: photo.originalname,
                  doc_sys_name: s3Key,
                  created_by: data.created_by,
                  doc_type_id: sitePhotoDocType.id,
                  account_id: data.account_id,
                  lead_id: data.lead_id,
                  vendor_id: data.vendor_id,
                },
              });

              response.documentsUploaded.push({
                id: document.id,
                type: "current_site_photo",
                originalName: photo.originalname,
                s3Key: s3Key,
              });
            }
          }

          // 2. Upload PDF file (doc_type = 3) - Mandatory field
          if (!data.pdfFile) {
            throw new Error("PDF file is mandatory");
          }

          // Validate that document type with id = 3 exists for this vendor
          const pdfDocType = await tx.documentTypeMaster.findFirst({
            where: { vendor_id: data.vendor_id, tag: "Type 3" },
          });

          if (!pdfDocType) {
            throw new Error(
              "Document type (PDF uploads) not found for this vendor"
            );
          }

          const sanitizedPdfName = sanitizeFilename(data.pdfFile.originalname);
          const pdfS3Key = `initial_site_measurement_documents/${
            data.vendor_id
          }/${data.lead_id}/${Date.now()}-${sanitizedPdfName}`;

          // Upload PDF to Wasabi
          await wasabi.send(
            new PutObjectCommand({
              Bucket: process.env.WASABI_BUCKET_NAME || "your-bucket-name",
              Key: pdfS3Key,
              Body: data.pdfFile.buffer,
              ContentType: data.pdfFile.mimetype,
            })
          );

          // Create document entry using the document type id
          const pdfDocument = await tx.leadDocuments.create({
            data: {
              doc_og_name: data.pdfFile.originalname,
              doc_sys_name: pdfS3Key,
              created_by: data.created_by,
              doc_type_id: pdfDocType.id, // PDF document type ID
              account_id: data.account_id,
              lead_id: data.lead_id,
              vendor_id: data.vendor_id,
            },
          });

          response.documentsUploaded.push({
            id: pdfDocument.id,
            type: "pdf_upload",
            originalName: data.pdfFile.originalname,
            s3Key: pdfS3Key,
          });

          // 3. Handle payment image file (optional)
          let paymentFileId: number | null = null;
          if (data.paymentImageFile) {
            const sanitizedPaymentImageName = sanitizeFilename(
              data.paymentImageFile.originalname
            );
            const paymentImageS3Key = `initial-site-measurement-payment-images/${
              data.vendor_id
            }/${data.lead_id}/${Date.now()}-${sanitizedPaymentImageName}`;

            const paymentDocType = await tx.documentTypeMaster.findFirst({
              where: { vendor_id: data.vendor_id, tag: "Type 4" },
            });

            if (!paymentDocType) {
              throw new Error(
                "Document type for payment images not found for this vendor"
              );
            }

            // Upload payment image to Wasabi
            await wasabi.send(
              new PutObjectCommand({
                Bucket: process.env.WASABI_BUCKET_NAME || "your-bucket-name",
                Key: paymentImageS3Key,
                Body: data.paymentImageFile.buffer,
                ContentType: data.paymentImageFile.mimetype,
              })
            );

            // Save document info to database with doc_type_id = 3 (hardcoded for payments)
            const paymentDocument = await tx.leadDocuments.create({
              data: {
                doc_og_name: data.paymentImageFile.originalname,
                doc_sys_name: paymentImageS3Key,
                created_by: data.created_by,
                doc_type_id: paymentDocType.id,
                account_id: data.account_id,
                lead_id: data.lead_id,
                vendor_id: data.vendor_id,
              },
            });

            paymentFileId = paymentDocument.id;

            response.documentsUploaded.push({
              id: paymentDocument.id,
              type: "initial_site_measurement_payment_details",
              originalName: data.paymentImageFile.originalname,
              s3Key: paymentImageS3Key,
            });
          }

          // 4. Create PaymentInfo entry (if amount is provided)
          if (data.amount && data.payment_date) {
            const paymentType = await tx.paymentTypeMaster.findFirst({
              where: { vendor_id: data.vendor_id, tag: "Type 1" },
            });

            if (!paymentType) {
              throw new Error(
                "Payment type (Initial Site Measurement Payment) not found for this vendor"
              );
            }

            const paymentInfo = await tx.paymentInfo.create({
              data: {
                lead_id: data.lead_id,
                account_id: data.account_id,
                vendor_id: data.vendor_id,
                created_by: data.created_by,
                amount: data.amount,
                payment_date: data.payment_date,
                payment_text: data.payment_text || null,
                payment_file_id: paymentFileId,
                payment_type_id: paymentType.id,
              },
            });

            response.paymentInfo = {
              id: paymentInfo.id,
              amount: paymentInfo.amount,
              payment_date: paymentInfo.payment_date,
              payment_text: paymentInfo.payment_text,
            };

            // 5. Create Ledger entry (credit entry for received payment)
            const ledgerEntry = await tx.ledger.create({
              data: {
                lead_id: data.lead_id,
                account_id: data.account_id,
                client_id: data.client_id,
                vendor_id: data.vendor_id,
                amount: data.amount,
                payment_date: data.payment_date,
                type: "credit", // Assuming payment received is a credit
                created_by: data.created_by,
              },
            });

            response.ledgerEntry = {
              id: ledgerEntry.id,
              amount: ledgerEntry.amount,
              type: ledgerEntry.type,
              payment_date: ledgerEntry.payment_date,
            };
          }

          // 6. Update LeadMaster status (status "Type 2" → "Type 3")
          const statusFrom = await tx.statusTypeMaster.findFirst({
            where: { vendor_id: data.vendor_id, tag: "Type 2" },
          });
          const statusTo = await tx.statusTypeMaster.findFirst({
            where: { vendor_id: data.vendor_id, tag: "Type 3" },
          });

          if (statusFrom && statusTo) {
            await tx.leadMaster.updateMany({
              where: {
                id: data.lead_id,
                vendor_id: data.vendor_id,
                status_id: statusFrom.id,
              },
              data: {
                status_id: statusTo.id,
              },
            });
          }

          // 7. Mark related userLeadTask as completed
          await tx.userLeadTask.updateMany({
            where: {
              vendor_id: data.vendor_id,
              lead_id: data.lead_id,
              task_type: "Initial Site Measurement",
              status: "open", // or "pending" depending on your flow
            },
            data: {
              status: "completed",
              closed_by: data.user_id,
              closed_at: new Date(),
              updated_by: data.user_id,
              updated_at: new Date(),
            },
          });

          // 8️⃣ Create LeadDetailedLogs + LeadDocumentLogs (Audit Trail)
          let actionMessage = "";

          // If payment details exist, include them in sentence format
          if (data.amount && data.payment_date) {
            const formattedDate = new Date(
              data.payment_date
            ).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            });

            actionMessage = `Initial Site Measurement amount ₹${data.amount.toLocaleString(
              "en-IN"
            )} received on ${formattedDate}. `;
          }

          // Always append upload success message
          actionMessage +=
            "Initial Site Measurements have been uploaded successfully.";

          // Create parent log entry
          const detailedLog = await tx.leadDetailedLogs.create({
            data: {
              vendor_id: data.vendor_id,
              lead_id: data.lead_id,
              account_id: data.account_id,
              action: actionMessage,
              action_type: "CREATE",
              created_by: data.created_by,
              created_at: new Date(),
            },
          });

          // Log each document (if any)
          if (response.documentsUploaded.length > 0) {
            const docLogsData = response.documentsUploaded.map((doc) => ({
              vendor_id: data.vendor_id,
              lead_id: data.lead_id,
              account_id: data.account_id,
              doc_id: doc.id,
              lead_logs_id: detailedLog.id,
              created_by: data.created_by,
              created_at: new Date(),
            }));

            await tx.leadDocumentLogs.createMany({ data: docLogsData });

            logger.info("✅ LeadDocumentLogs created for uploaded documents", {
              lead_id: data.lead_id,
              count: docLogsData.length,
            });
          }

          logger.info("✅ LeadDetailedLogs entry created for ISM upload", {
            lead_id: data.lead_id,
            action: actionMessage,
          });

          return response;
        },
        {
          timeout: 20000, // 20 seconds
        }
      );

      return result;
    } catch (error: any) {
      console.error("[PaymentUploadService] Error:", error);
      throw new Error(`Failed to create payment upload: ${error.message}`);
    }
  }

  // Generate signed URL for file access
  public async generateSignedUrl(
    s3Key: string,
    vendorId: number,
    expiresIn: number = 3600
  ): Promise<string> {
    try {
      // Validate that the file belongs to the vendor (security check)
      const document = await prisma.leadDocuments.findFirst({
        where: {
          doc_sys_name: s3Key,
          vendor_id: vendorId,
          deleted_at: null,
        },
      });

      if (!document) {
        throw new Error("Document not found or access denied");
      }

      // Generate signed URL
      const command = new GetObjectCommand({
        Bucket: process.env.WASABI_BUCKET_NAME || "your-bucket-name",
        Key: s3Key,
      });

      const signedUrl = await getSignedUrl(wasabi, command, {
        expiresIn: expiresIn, // URL expires in 1 hour by default
      });

      return signedUrl;
    } catch (error: any) {
      console.error(
        "[PaymentUploadService] Error generating signed URL:",
        error
      );
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

  // Batch generate signed URLs for multiple documents
  public async generateBatchSignedUrls(
    documents: Array<{ s3Key: string; vendorId: number }>
  ): Promise<Record<string, string>> {
    try {
      const signedUrls: Record<string, string> = {};

      // Process all URLs in parallel
      await Promise.all(
        documents.map(async (doc) => {
          try {
            const signedUrl = await this.generateSignedUrl(
              doc.s3Key,
              doc.vendorId
            );
            signedUrls[doc.s3Key] = signedUrl;
          } catch (error) {
            console.error(`Failed to generate URL for ${doc.s3Key}:`, error);
            // Don't throw, just skip this document
            signedUrls[doc.s3Key] = "";
          }
        })
      );

      return signedUrls;
    } catch (error: any) {
      console.error(
        "[PaymentUploadService] Error generating batch signed URLs:",
        error
      );
      throw new Error(`Failed to generate batch signed URLs: ${error.message}`);
    }
  }

  // Get leads by status with pagination
  public async getLeadsByStatus(
    vendorId: number,
    userId: number,
    statusId: number,
    page: number = 1,
    limit: number = 10
  ): Promise<{ data: LeadDetailDto[]; total: number }> {
    try {
      const skip = (page - 1) * limit;

      // 1️⃣ Get statusType for vendor (Type 2)
      const statusType = await prisma.statusTypeMaster.findFirst({
        where: { vendor_id: vendorId, tag: "Type 2" },
      });

      if (!statusType) {
        throw new Error(`Status 'Type 2' not found for vendor ${vendorId}`);
      }

      // 2️⃣ Check if user is admin
      const creator = await prisma.userMaster.findUnique({
        where: { id: userId },
        include: { user_type: true },
      });

      const isAdmin = creator?.user_type?.user_type?.toLowerCase() === "admin";

      let leadIds: number[] = [];

      if (!isAdmin) {
        // 🔹 Leads mapped via LeadUserMapping
        const mappedLeads = await prisma.leadUserMapping.findMany({
          where: { vendor_id: vendorId, user_id: userId, status: "active" },
          select: { lead_id: true },
        });

        // 🔹 Leads assigned/created via UserLeadTask
        const taskLeads = await prisma.userLeadTask.findMany({
          where: {
            vendor_id: vendorId,
            OR: [{ created_by: userId }, { user_id: userId }],
          },
          select: { lead_id: true },
        });

        // 🔹 OR logic (union of both sets)
        leadIds = [
          ...new Set([
            ...mappedLeads.map((m) => m.lead_id),
            ...taskLeads.map((t) => t.lead_id),
          ]),
        ];

        if (!leadIds.length) {
          return { data: [], total: 0 };
        }
      }

      // 3️⃣ Fetch leads (admin = all, non-admin = filtered by leadIds)
      const [leads, total] = await Promise.all([
        prisma.leadMaster.findMany({
          where: {
            ...(isAdmin ? {} : { id: { in: leadIds } }),
            vendor_id: vendorId,
            is_deleted: false,
            statusType: { tag: "Type 2", vendor_id: vendorId },
            activity_status: { in: ["onGoing", "lostApproval"] }, // ✅ allow both
          },
          include: {
            vendor: {
              select: { id: true, vendor_name: true, vendor_code: true },
            },
            siteType: { select: { id: true, type: true } },
            source: { select: { id: true, type: true } },
            account: {
              select: { id: true, name: true, contact_no: true, email: true },
            },
            statusType: { select: { id: true, type: true, tag: true } },
            createdBy: {
              select: { id: true, user_name: true, user_email: true },
            },
            updatedBy: {
              select: { id: true, user_name: true, user_email: true },
            },
            assignedTo: {
              select: { id: true, user_name: true, user_email: true },
            },
            assignedBy: {
              select: { id: true, user_name: true, user_email: true },
            },
            documents: {
              where: { deleted_at: null },
              select: {
                id: true,
                doc_og_name: true,
                doc_sys_name: true,
                doc_type_id: true,
                created_at: true,
              },
            },
            tasks: {
              where: { task_type: "Follow Up" },
              select: {
                id: true,
                task_type: true,
                due_date: true,
                remark: true,
                status: true,
                created_at: true,
              },
              orderBy: { created_at: Prisma.SortOrder.desc },
            },

            // ✅ Add these two includes ↓
            productMappings: {
              include: {
                productType: { select: { id: true, type: true } },
              },
            },
            leadProductStructureMapping: {
              include: {
                productStructure: { select: { id: true, type: true } },
              },
            },

            _count: {
              select: {
                payments: true,
                documents: { where: { deleted_at: null } },
                ledgers: true,
                productMappings: true,
              },
            },
          },
          orderBy: { created_at: Prisma.SortOrder.desc },
          skip,
          take: limit,
        }),
        prisma.leadMaster.count({
          where: {
            ...(isAdmin ? {} : { id: { in: leadIds } }),
            vendor_id: vendorId,
            is_deleted: false,
            statusType: { tag: "Type 2", vendor_id: vendorId },
            activity_status: { in: ["onGoing", "lostApproval"] }, // ✅ allow both
          },
        }),
      ]);

      // 4️⃣ Signed URLs for docs
      const allDocuments = leads.flatMap((lead: any) =>
        lead.documents.map((doc: any) => ({
          s3Key: doc.doc_sys_name,
          vendorId,
        }))
      );
      const signedUrls = await this.generateBatchSignedUrls(allDocuments);

      // 5️⃣ Format response
      const data: LeadDetailDto[] = leads.map((lead: any) => ({
        ...lead,
        documents: lead.documents.map((doc: any) => ({
          ...doc,
          signed_url: signedUrls[doc.doc_sys_name] || "",
          file_type: this.getFileType(doc.doc_og_name),
          is_image: this.isImageFile(doc.doc_og_name),
        })),
        tasks: lead.tasks.map((task: any) => ({
          id: task.id,
          task_type: task.task_type,
          due_date: task.due_date,
          remark: task.remark,
          status: task.status,
          created_at: task.created_at,
        })),
        summary: {
          totalPayments: lead._count.payments,
          totalDocuments: lead._count.documents,
          totalLedgerEntries: lead._count.ledgers,
          totalProductMappings: lead._count.productMappings,
        },
      }));

      return { data, total };
    } catch (error: any) {
      console.error(
        "[PaymentUploadService] Error getting leads by status:",
        error
      );
      throw new Error(`Failed to get leads by status: ${error.message}`);
    }
  }

  // Get payment uploads by lead ID (only for leads with status_id == 2)
  public async getPaymentUploadsByLead(
    leadId: number,
    vendorId: number
  ): Promise<PaymentUploadDetailDto[]> {
    try {
      // ✅ Find the correct status type for this vendor
      const statusType = await prisma.statusTypeMaster.findFirst({
        where: { vendor_id: vendorId, tag: "Type 2" },
      });

      if (!statusType) {
        // Instead of using res (not available here), throw an error
        throw new Error(`Status 'Type 2' not found for vendor ${vendorId}`);
      }

      // Ensure the lead exists and has status_id = statusType.id
      const lead = await prisma.leadMaster.findFirst({
        where: {
          id: leadId,
          vendor_id: vendorId,
          status_id: statusType.id,
        },
      });

      if (!lead) return [];

      // Fetch payment infos
      const paymentInfos = await prisma.paymentInfo.findMany({
        where: {
          lead_id: leadId,
          vendor_id: vendorId,
          lead: { status_id: statusType.id },
        },
        include: {
          lead: {
            select: {
              id: true,
              firstname: true,
              lastname: true,
              contact_no: true,
              email: true,
              status_id: true,
            },
          },
          account: {
            select: { id: true, name: true, contact_no: true, email: true },
          },
          createdBy: {
            select: { id: true, user_name: true, user_email: true },
          },
          document: {
            select: {
              id: true,
              documentType: { select: { id: true, type: true } },
            },
          },
        },
        orderBy: { created_at: "desc" },
      });

      // Fetch documents
      const documents = await prisma.leadDocuments.findMany({
        where: {
          lead_id: leadId,
          vendor_id: vendorId,
          lead: { status_id: statusType.id },
          is_deleted: false
        },
        include: {
          createdBy: {
            select: { id: true, user_name: true, user_email: true },
          },
          documentType: { select: { id: true, type: true } },
        },
        orderBy: { created_at: "desc" },
      });

      // Fetch ledger entries
      const ledgerEntries = await prisma.ledger.findMany({
        where: {
          lead_id: leadId,
          vendor_id: vendorId,
          lead: { status_id: statusType.id },
        },
        orderBy: { created_at: "desc" },
      });

      const result: PaymentUploadDetailDto[] = [];

      // Combine payment info + ledger + documents
      for (const payment of paymentInfos) {
        const relatedLedger = ledgerEntries.find(
          (l: any) =>
            l.payment_date.getTime() === payment.payment_date?.getTime() &&
            l.amount === payment.amount
        );

        result.push({
          id: payment.id,
          type: "payment_upload",
          lead: payment.lead,
          account: payment.account,
          paymentInfo: {
            id: payment.id,
            amount: payment.amount,
            payment_date: payment.payment_date,
            payment_text: payment.payment_text,
            payment_file_id: payment.payment_file_id,
          },
          ledgerEntry: relatedLedger
            ? {
                id: relatedLedger.id,
                amount: relatedLedger.amount,
                type: relatedLedger.type,
                payment_date: relatedLedger.payment_date,
              }
            : null,
          documents: documents
            .filter((doc: any) => {
              const timeDiff = Math.abs(
                doc.created_at.getTime() - payment.created_at.getTime()
              );
              return timeDiff < 60000;
            })
            .map((doc: any) => ({
              id: doc.id,
              doc_og_name: doc.doc_og_name,
              doc_sys_name: doc.doc_sys_name,
              doc_type: doc.documentType.type,
              created_at: doc.created_at,
              createdBy: doc.createdBy,
            })),
          createdBy: payment.createdBy,
          created_at: payment.created_at,
        });
      }

      // Handle standalone documents (not tied to payment)
      const paymentTimes = paymentInfos.map((p: any) => p.created_at.getTime());
      const documentOnlyUploads = documents.filter((doc: any) => {
        return !paymentTimes.some(
          (time: any) => Math.abs(doc.created_at.getTime() - time) < 60000
        );
      });

      const groupedDocs: { [key: string]: typeof documents } = {};
      documentOnlyUploads.forEach((doc: any) => {
        const timeKey = Math.floor(doc.created_at.getTime() / (5 * 60 * 1000));
        if (!groupedDocs[timeKey]) groupedDocs[timeKey] = [];
        groupedDocs[timeKey].push(doc);
      });

      Object.values(groupedDocs).forEach((docGroup) => {
        const firstDoc = docGroup[0];
        result.push({
          id: firstDoc.id,
          type: "document_upload",
          lead: paymentInfos[0]?.lead || lead,
          account: paymentInfos[0]?.account || null,
          paymentInfo: null,
          ledgerEntry: null,
          documents: docGroup.map((doc: any) => ({
            id: doc.id,
            doc_og_name: doc.doc_og_name,
            doc_sys_name: doc.doc_sys_name,
            doc_type: doc.documentType.type,
            created_at: doc.created_at,
            createdBy: doc.createdBy,
          })),
          createdBy: firstDoc.createdBy,
          created_at: firstDoc.created_at,
        });
      });

      // Sort by newest first
      return result.sort(
        (a, b) => b.created_at.getTime() - a.created_at.getTime()
      );
    } catch (error: any) {
      console.error(
        "[PaymentUploadGetService] Error getting uploads by lead:",
        error
      );
      throw new Error(`Failed to get payment uploads: ${error.message}`);
    }
  }

  public async updatePaymentUpload(
    paymentId: number,
    data: UpdatePaymentUploadDto
  ): Promise<PaymentUploadResponseDto> {
    try {
      // Start a transaction to ensure data consistency
      const result = await prisma.$transaction(
        async (tx: any) => {
          const response: PaymentUploadResponseDto = {
            paymentInfo: null,
            ledgerEntry: null,
            documentsUploaded: [],
            message: "Payment updated successfully",
          };

          // 1. Verify payment exists and belongs to the vendor
          const existingPayment = await tx.paymentInfo.findFirst({
            where: {
              id: paymentId,
              vendor_id: data.vendor_id,
              lead_id: data.lead_id,
            },
          });

          if (!existingPayment) {
            throw new Error("Payment not found or access denied");
          }

          // 2. Upload new current site photos if provided
          if (data.currentSitePhotos && data.currentSitePhotos.length > 0) {
            // Validate document type exists
            const sitePhotoDocType = await tx.documentTypeMaster.findFirst({
              where: { tag: "Type 2", vendor_id: data.vendor_id },
            });

            if (!sitePhotoDocType) {
              throw new Error(
                "Document type for site photos not found for this vendor"
              );
            }

            for (const photo of data.currentSitePhotos) {
              const sanitizedFilename = sanitizeFilename(photo.originalname);
              const s3Key = `current_site_photos/${data.vendor_id}/${
                data.lead_id
              }/${Date.now()}-${sanitizedFilename}`;

              // Upload to Wasabi
              await wasabi.send(
                new PutObjectCommand({
                  Bucket: process.env.WASABI_BUCKET_NAME || "your-bucket-name",
                  Key: s3Key,
                  Body: photo.buffer,
                  ContentType: photo.mimetype,
                })
              );

              // Save document info to database
              const document = await tx.leadDocuments.create({
                data: {
                  doc_og_name: photo.originalname,
                  doc_sys_name: s3Key,
                  created_by: data.updated_by,
                  doc_type_id: sitePhotoDocType.id, // Current Site photos document type ID
                  account_id: data.account_id,
                  lead_id: data.lead_id,
                  vendor_id: data.vendor_id,
                },
              });

              response.documentsUploaded.push({
                id: document.id,
                type: "current_site_photo",
                originalName: photo.originalname,
                s3Key: s3Key,
              });
            }
          }

          // 3. Upload new payment detail photos if provided
          if (data.paymentDetailPhotos && data.paymentDetailPhotos.length > 0) {
            // Validate document type exists
            const paymentDocType = await tx.documentTypeMaster.findFirst({
              where: { tag: "Type 4", vendor_id: data.vendor_id },
            });

            if (!paymentDocType) {
              throw new Error(
                "Document type for payment details not found for this vendor"
              );
            }

            for (const photo of data.paymentDetailPhotos) {
              const sanitizedFilename = sanitizeFilename(photo.originalname);
              const s3Key = `initial-site-measurement-payment-images/${
                data.vendor_id
              }/${data.lead_id}/${Date.now()}-${sanitizedFilename}`;

              // Upload to Wasabi
              await wasabi.send(
                new PutObjectCommand({
                  Bucket: process.env.WASABI_BUCKET_NAME || "your-bucket-name",
                  Key: s3Key,
                  Body: photo.buffer,
                  ContentType: photo.mimetype,
                })
              );

              // Save document info to database
              const document = await tx.leadDocuments.create({
                data: {
                  doc_og_name: photo.originalname,
                  doc_sys_name: s3Key,
                  created_by: data.updated_by,
                  doc_type_id: paymentDocType.id, // Payment document type ID
                  account_id: data.account_id,
                  lead_id: data.lead_id,
                  vendor_id: data.vendor_id,
                },
              });

              response.documentsUploaded.push({
                id: document.id,
                type: "payment_detail_photo",
                originalName: photo.originalname,
                s3Key: s3Key,
              });
            }
          }

          // 4. Update PaymentInfo if any payment-related fields are provided
          const paymentUpdateData: any = {};
          let shouldUpdatePayment = false;

          if (data.amount !== undefined) {
            paymentUpdateData.amount = data.amount;
            shouldUpdatePayment = true;
          }

          if (data.payment_date !== undefined) {
            paymentUpdateData.payment_date = data.payment_date;
            shouldUpdatePayment = true;
          }

          if (data.payment_text !== undefined) {
            paymentUpdateData.payment_text = data.payment_text;
            shouldUpdatePayment = true;
          }

          if (shouldUpdatePayment) {
            const updatedPayment = await tx.paymentInfo.update({
              where: { id: paymentId },
              data: paymentUpdateData,
            });

            response.paymentInfo = {
              id: updatedPayment.id,
              amount: updatedPayment.amount,
              payment_date: updatedPayment.payment_date,
              payment_text: updatedPayment.payment_text,
            };

            // 5. Update corresponding Ledger entry if amount or payment_date changed
            if (data.amount !== undefined || data.payment_date !== undefined) {
              const ledgerUpdateData: any = {};

              if (data.amount !== undefined) {
                ledgerUpdateData.amount = data.amount;
              }

              if (data.payment_date !== undefined) {
                ledgerUpdateData.payment_date = data.payment_date;
              }

              // Find and update the corresponding ledger entry
              const updatedLedger = await tx.ledger.updateMany({
                where: {
                  lead_id: data.lead_id,
                  account_id: data.account_id,
                  vendor_id: data.vendor_id,
                  type: "credit",
                  // Match by payment date and amount to identify the correct ledger entry
                  payment_date: existingPayment.payment_date ?? undefined,
                  amount: existingPayment.amount ?? undefined,
                },
                data: ledgerUpdateData,
              });

              if (updatedLedger.count > 0) {
                // Get the updated ledger entry for response
                const ledgerEntry = await tx.ledger.findFirst({
                  where: {
                    lead_id: data.lead_id,
                    account_id: data.account_id,
                    vendor_id: data.vendor_id,
                    type: "credit",
                    payment_date:
                      data.payment_date ??
                      existingPayment.payment_date ??
                      undefined,
                    amount: data.amount ?? existingPayment.amount ?? undefined,
                  },
                });

                if (ledgerEntry) {
                  response.ledgerEntry = {
                    id: ledgerEntry.id,
                    amount: ledgerEntry.amount,
                    type: ledgerEntry.type,
                    payment_date: ledgerEntry.payment_date,
                  };
                }
              }
            }
          }

          // 6️⃣ Create audit trail logs (LeadDetailedLogs + LeadDocumentLogs)
          let actionParts: string[] = [];

          // If payment details changed
          if (
            data.amount !== undefined ||
            data.payment_date !== undefined ||
            data.payment_text !== undefined
          ) {
            const amountPart =
              data.amount !== undefined
                ? `Amount updated to ₹${data.amount}`
                : "";
            const datePart = data.payment_date
              ? `Payment Date set to ${new Date(
                  data.payment_date
                ).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}`
              : "";
            const textPart = data.payment_text
              ? `Remark updated: ${data.payment_text}`
              : "";

            const details = [amountPart, datePart, textPart]
              .filter(Boolean)
              .join(", ");
            if (details) actionParts.push(details);
          }

          // If documents were uploaded
          if (response.documentsUploaded.length > 0) {
            const sitePhotoCount = response.documentsUploaded.filter(
              (d) => d.type === "current_site_photo"
            ).length;
            const paymentPhotoCount = response.documentsUploaded.filter(
              (d) => d.type === "payment_detail_photo"
            ).length;

            if (sitePhotoCount > 0)
              actionParts.push(
                `${sitePhotoCount} Current Site Photo${
                  sitePhotoCount > 1 ? "s" : ""
                } uploaded`
              );
            if (paymentPhotoCount > 0)
              actionParts.push(
                `${paymentPhotoCount} Payment Detail Photo${
                  paymentPhotoCount > 1 ? "s" : ""
                } uploaded`
              );
          }

          // Construct the full action message
          const actionMessage =
            actionParts.length > 0
              ? `Payment details updated successfully — ${actionParts.join(
                  ", "
                )}.`
              : "Payment details updated successfully.";

          // Create LeadDetailedLogs entry
          const detailedLog = await tx.leadDetailedLogs.create({
            data: {
              vendor_id: data.vendor_id,
              lead_id: data.lead_id,
              account_id: data.account_id,
              action: actionMessage,
              action_type: "UPDATE",
              created_by: data.updated_by,
              created_at: new Date(),
            },
          });

          // If new documents were uploaded → create mapping logs
          if (response.documentsUploaded.length > 0) {
            const docLogsData = response.documentsUploaded.map((doc) => ({
              vendor_id: data.vendor_id,
              lead_id: data.lead_id,
              account_id: data.account_id,
              doc_id: doc.id,
              lead_logs_id: detailedLog.id,
              created_by: data.updated_by,
              created_at: new Date(),
            }));

            await tx.leadDocumentLogs.createMany({ data: docLogsData });
          }

          logger.info("✅ LeadDetailedLogs entry created for payment update", {
            leadId: data.lead_id,
            vendorId: data.vendor_id,
            actionMessage,
          });

          return response;
        },
        {
          timeout: 20000, // 20 seconds
        }
      );

      return result;
    } catch (error: any) {
      console.error("[PaymentUploadService] Error updating payment:", error);
      throw new Error(`Failed to update payment upload: ${error.message}`);
    }
  }

  public async softDeleteDocument(
    documentId: number,
    userId: number,
    vendorId: number
  ): Promise<{ success: boolean; message: string; document?: any }> {
    try {
      const result = await prisma.$transaction(async (tx: any) => {
        // 1. Verify the user belongs to the vendor
        const user = await tx.userMaster.findFirst({
          where: {
            id: userId,
            vendor_id: vendorId,
            status: "active", // Assuming only active users can delete
          },
        });

        if (!user) {
          throw new Error("User not found or not authorized for this vendor");
        }

        // 2. Verify the document exists and belongs to the vendor
        const document = await tx.leadDocuments.findFirst({
          where: {
            id: documentId,
            vendor_id: vendorId,
            is_deleted: false, // Only allow deletion of non-deleted documents
          },
          include: {
            lead: {
              select: {
                id: true,
                firstname: true,
                lastname: true,
              },
            },
            account: {
              select: {
                id: true,
                name: true,
              },
            },
            documentType: {
              select: {
                id: true,
                type: true,
              },
            },
          },
        });

        if (!document) {
          throw new Error(
            "Document not found, already deleted, or access denied"
          );
        }

        // 3. Update the document with soft delete fields
        const deletedDocument = await tx.leadDocuments.update({
          where: {
            id: documentId,
          },
          data: {
            is_deleted: true,
            deleted_by: userId,
            deleted_at: new Date(),
          },
          include: {
            lead: {
              select: {
                id: true,
                firstname: true,
                lastname: true,
              },
            },
            account: {
              select: {
                id: true,
                name: true,
              },
            },
            documentType: {
              select: {
                id: true,
                type: true,
              },
            },
            deletedBy: {
              select: {
                id: true,
                user_name: true,
                user_email: true,
              },
            },
          },
        });

        return {
          success: true,
          message: "Document deleted successfully",
          document: {
            id: deletedDocument.id,
            doc_og_name: deletedDocument.doc_og_name,
            doc_sys_name: deletedDocument.doc_sys_name,
            doc_type: deletedDocument.documentType,
            lead: deletedDocument.lead,
            account: deletedDocument.account,
            deleted_by: deletedDocument.deletedBy,
            deleted_at: deletedDocument.deleted_at,
          },
        };
      });

      return result;
    } catch (error: any) {
      console.error(
        "[PaymentUploadService] Error soft deleting document:",
        error
      );

      if (
        error.message.includes("not found") ||
        error.message.includes("not authorized") ||
        error.message.includes("access denied") ||
        error.message.includes("already deleted")
      ) {
        return {
          success: false,
          message: error.message,
        };
      }

      throw new Error(`Failed to delete document: ${error.message}`);
    }
  }

  // Restore a soft deleted document (bonus method)
  public async restoreDocument(
    documentId: number,
    userId: number,
    vendorId: number
  ): Promise<{ success: boolean; message: string; document?: any }> {
    try {
      const result = await prisma.$transaction(async (tx: any) => {
        // 1. Verify the user belongs to the vendor
        const user = await tx.userMaster.findFirst({
          where: {
            id: userId,
            vendor_id: vendorId,
            status: "active",
          },
        });

        if (!user) {
          throw new Error("User not found or not authorized for this vendor");
        }

        // 2. Verify the document exists and is deleted
        const document = await tx.leadDocuments.findFirst({
          where: {
            id: documentId,
            vendor_id: vendorId,
            is_deleted: true, // Only allow restoration of deleted documents
          },
        });

        if (!document) {
          throw new Error("Document not found, not deleted, or access denied");
        }

        // 3. Restore the document
        const restoredDocument = await tx.leadDocuments.update({
          where: {
            id: documentId,
          },
          data: {
            is_deleted: false,
            deleted_by: null,
            deleted_at: null,
          },
          include: {
            lead: {
              select: {
                id: true,
                firstname: true,
                lastname: true,
              },
            },
            account: {
              select: {
                id: true,
                name: true,
              },
            },
            documentType: {
              select: {
                id: true,
                type: true,
              },
            },
          },
        });

        return {
          success: true,
          message: "Document restored successfully",
          document: {
            id: restoredDocument.id,
            doc_og_name: restoredDocument.doc_og_name,
            doc_sys_name: restoredDocument.doc_sys_name,
            doc_type: restoredDocument.documentType,
            lead: restoredDocument.lead,
            account: restoredDocument.account,
          },
        };
      });

      return result;
    } catch (error: any) {
      console.error("[PaymentUploadService] Error restoring document:", error);

      if (
        error.message.includes("not found") ||
        error.message.includes("not authorized") ||
        error.message.includes("access denied") ||
        error.message.includes("not deleted")
      ) {
        return {
          success: false,
          message: error.message,
        };
      }

      throw new Error(`Failed to restore document: ${error.message}`);
    }
  }

  // Get deleted documents for a vendor (bonus method for admin purposes)
  public async getDeletedDocuments(
    vendorId: number,
    userId: number,
    page: number = 1,
    limit: number = 10
  ): Promise<{ data: any[]; total: number; success: boolean }> {
    try {
      // Verify user belongs to vendor
      const user = await prisma.userMaster.findFirst({
        where: {
          id: userId,
          vendor_id: vendorId,
          status: "active",
        },
      });

      if (!user) {
        throw new Error("User not found or not authorized for this vendor");
      }

      const skip = (page - 1) * limit;

      const [documents, total] = await Promise.all([
        prisma.leadDocuments.findMany({
          where: {
            vendor_id: vendorId,
            is_deleted: true,
          },
          include: {
            lead: {
              select: {
                id: true,
                firstname: true,
                lastname: true,
              },
            },
            account: {
              select: {
                id: true,
                name: true,
              },
            },
            documentType: {
              select: {
                id: true,
                type: true,
              },
            },
            deletedBy: {
              select: {
                id: true,
                user_name: true,
                user_email: true,
              },
            },
          },
          orderBy: {
            deleted_at: "desc",
          },
          skip,
          take: limit,
        }),
        prisma.leadDocuments.count({
          where: {
            vendor_id: vendorId,
            is_deleted: true,
          },
        }),
      ]);

      return {
        success: true,
        data: documents,
        total,
      };
    } catch (error: any) {
      console.error(
        "[PaymentUploadService] Error getting deleted documents:",
        error
      );
      throw new Error(`Failed to get deleted documents: ${error.message}`);
    }
  }

  // Get payment upload details by ID
  public async getPaymentUploadById(
    paymentId: number,
    vendorId: number
  ): Promise<any> {
    try {
      const payment = await prisma.paymentInfo.findFirst({
        where: {
          id: paymentId,
          vendor_id: vendorId,
        },
        include: {
          lead: {
            select: {
              id: true,
              firstname: true,
              lastname: true,
              contact_no: true,
              email: true,
              site_address: true,
            },
          },
          account: {
            select: {
              id: true,
              name: true,
              contact_no: true,
              email: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              user_name: true,
              user_email: true,
            },
          },
        },
      });

      if (!payment) {
        throw new Error("Payment not found or access denied");
      }

      // Get associated documents
      const documents = await prisma.leadDocuments.findMany({
        where: {
          lead_id: payment.lead_id,
          vendor_id: vendorId,
          deleted_at: null,
          doc_type_id: {
            in: [2, 3], // Site photos and payment details
          },
        },
        select: {
          id: true,
          doc_og_name: true,
          doc_sys_name: true,
          doc_type_id: true,
          created_at: true,
        },
        orderBy: {
          created_at: "desc",
        },
      });

      // Generate signed URLs for documents
      const documentsWithUrls = await Promise.all(
        documents.map(async (doc: any) => {
          const signedUrl = await this.generateSignedUrl(
            doc.doc_sys_name,
            vendorId
          );
          return {
            ...doc,
            signed_url: signedUrl,
            file_type: this.getFileType(doc.doc_og_name),
            is_image: this.isImageFile(doc.doc_og_name),
            document_type:
              doc.doc_type_id === 2
                ? "current_site_photo"
                : "payment_detail_photo",
          };
        })
      );

      return {
        ...payment,
        documents: documentsWithUrls,
      };
    } catch (error: any) {
      console.error(
        "[PaymentUploadService] Error getting payment by ID:",
        error
      );
      throw new Error(`Failed to get payment upload: ${error.message}`);
    }
  }

  // Get payment uploads by account ID
  public async getPaymentUploadsByAccount(
    accountId: number,
    vendorId: number
  ): Promise<PaymentUploadListDto[]> {
    try {
      const paymentInfos = await prisma.paymentInfo.findMany({
        where: {
          account_id: accountId,
          vendor_id: vendorId,
        },
        include: {
          lead: {
            select: {
              id: true,
              firstname: true,
              lastname: true,
              contact_no: true,
            },
          },
          account: {
            select: {
              id: true,
              name: true,
            },
          },
          createdBy: {
            select: {
              user_name: true,
            },
          },
        },
        orderBy: {
          created_at: "desc",
        },
      });

      return paymentInfos.map((payment: any) => ({
        id: payment.id,
        lead: payment.lead,
        account: payment.account,
        amount: payment.amount,
        payment_date: payment.payment_date,
        payment_text: payment.payment_text,
        createdBy: payment.createdBy.user_name,
        created_at: payment.created_at,
      }));
    } catch (error: any) {
      console.error(
        "[PaymentUploadGetService] Error getting uploads by account:",
        error
      );
      throw new Error(`Failed to get payment uploads: ${error.message}`);
    }
  }

  // Get payment uploads by vendor with pagination
  public async getPaymentUploadsByVendor(
    vendorId: number,
    page: number = 1,
    limit: number = 10,
    startDate?: Date,
    endDate?: Date
  ): Promise<{ data: PaymentUploadListDto[]; total: number }> {
    try {
      const whereClause: any = {
        vendor_id: vendorId,
      };

      if (startDate || endDate) {
        whereClause.created_at = {};
        if (startDate) whereClause.created_at.gte = startDate;
        if (endDate) whereClause.created_at.lte = endDate;
      }

      const [paymentInfos, total] = await Promise.all([
        prisma.paymentInfo.findMany({
          where: whereClause,
          include: {
            lead: {
              select: {
                id: true,
                firstname: true,
                lastname: true,
                contact_no: true,
              },
            },
            account: {
              select: {
                id: true,
                name: true,
              },
            },
            createdBy: {
              select: {
                user_name: true,
              },
            },
          },
          orderBy: {
            created_at: "desc",
          },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.paymentInfo.count({
          where: whereClause,
        }),
      ]);

      const data = paymentInfos.map((payment: any) => ({
        id: payment.id,
        lead: payment.lead,
        account: payment.account,
        amount: payment.amount,
        payment_date: payment.payment_date,
        payment_text: payment.payment_text,
        createdBy: payment.createdBy.user_name,
        created_at: payment.created_at,
      }));

      return { data, total };
    } catch (error: any) {
      console.error(
        "[PaymentUploadGetService] Error getting uploads by vendor:",
        error
      );
      throw new Error(`Failed to get payment uploads: ${error.message}`);
    }
  }

  // Generate download URL for document
  public async getDocumentDownloadUrl(
    documentId: number,
    vendorId: number
  ): Promise<DocumentDownloadDto | null> {
    try {
      const document = await prisma.leadDocuments.findFirst({
        where: {
          id: documentId,
          vendor_id: vendorId,
          deleted_at: null,
        },
      });

      if (!document) {
        return null;
      }

      // Generate signed URL for Wasabi
      const command = new GetObjectCommand({
        Bucket: process.env.WASABI_BUCKET_NAME || "your-bucket-name",
        Key: document.doc_sys_name,
      });

      const signedUrl = await getSignedUrl(wasabi, command, {
        expiresIn: 3600,
      }); // 1 hour

      return {
        id: document.id,
        originalName: document.doc_og_name,
        downloadUrl: signedUrl,
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
      };
    } catch (error: any) {
      console.error(
        "[PaymentUploadGetService] Error generating download URL:",
        error
      );
      throw new Error(`Failed to generate download URL: ${error.message}`);
    }
  }

  // Get payment analytics
  public async getPaymentAnalytics(
    vendorId: number,
    startDate?: Date,
    endDate?: Date
  ): Promise<PaymentAnalyticsDto> {
    try {
      const whereClause: any = {
        vendor_id: vendorId,
      };

      if (startDate || endDate) {
        whereClause.payment_date = {};
        if (startDate) whereClause.payment_date.gte = startDate;
        if (endDate) whereClause.payment_date.lte = endDate;
      }

      // Get payment statistics
      const [paymentStats, documentStats] = await Promise.all([
        prisma.paymentInfo.aggregate({
          where: whereClause,
          _sum: {
            amount: true,
          },
          _count: {
            id: true,
          },
          _avg: {
            amount: true,
          },
        }),
        prisma.leadDocuments.count({
          where: {
            vendor_id: vendorId,
            deleted_at: null,
            ...(startDate || endDate
              ? {
                  created_at: {
                    ...(startDate && { gte: startDate }),
                    ...(endDate && { lte: endDate }),
                  },
                }
              : {}),
          },
        }),
      ]);

      // Get monthly payment breakdown
      const monthlyPayments = await prisma.$queryRaw<
        Array<{
          month: string;
          total_amount: number;
          payment_count: number;
        }>
      >`
      SELECT 
        TO_CHAR(payment_date, 'YYYY-MM') as month,
        SUM(amount::numeric)::float as total_amount,
        COUNT(*)::int as payment_count
      FROM "PaymentInfo"
      WHERE vendor_id = ${vendorId}
      ${startDate ? `AND payment_date >= ${startDate}` : ""}
      ${endDate ? `AND payment_date <= ${endDate}` : ""}
      AND payment_date IS NOT NULL
      GROUP BY TO_CHAR(payment_date, 'YYYY-MM')
      ORDER BY month DESC
      LIMIT 12
    `;

      return {
        totalAmount: paymentStats._sum.amount || 0,
        totalPayments: paymentStats._count.id || 0,
        averagePayment: paymentStats._avg.amount || 0,
        totalDocuments: documentStats,
        monthlyBreakdown: monthlyPayments,
        dateRange: {
          startDate: startDate || null,
          endDate: endDate || null,
        },
      };
    } catch (error: any) {
      console.error(
        "[PaymentUploadGetService] Error getting analytics:",
        error
      );
      throw new Error(`Failed to get payment analytics: ${error.message}`);
    }
  }

  private getFileType(filename: string): string {
    const ext = filename.toLowerCase().split(".").pop() || "";
    const imageTypes = ["jpg", "jpeg", "png", "gif", "webp"];
    const documentTypes = ["pdf", "doc", "docx"];

    if (imageTypes.includes(ext)) return "image";
    if (documentTypes.includes(ext)) return "document";
    return "other";
  }

  private isImageFile(filename: string): boolean {
    const ext = filename.toLowerCase().split(".").pop() || "";
    const imageTypes = ["jpg", "jpeg", "png", "gif", "webp"];
    return imageTypes.includes(ext);
  }
}
