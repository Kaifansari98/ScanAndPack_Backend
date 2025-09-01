import { PrismaClient, LedgerType } from '@prisma/client';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import wasabi from '../../../utils/wasabiClient';
import { sanitizeFilename } from '../../../utils/fileUtils';
import { CreatePaymentUploadDto, PaymentUploadResponseDto, PaymentUploadDetailDto, PaymentAnalyticsDto, PaymentUploadListDto, DocumentDownloadDto } from '../../../types/leadModule.types';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { LeadDetailDto } from '../../../types/leadModule.types';

const prisma = new PrismaClient();

export class PaymentUploadService {
  
public async createPaymentUpload(data: CreatePaymentUploadDto): Promise<PaymentUploadResponseDto> {
  try {
    // Start a transaction to ensure data consistency
    const result = await prisma.$transaction(async (tx) => {
      const response: PaymentUploadResponseDto = {
        paymentInfo: null,
        ledgerEntry: null,
        documentsUploaded: [],
        message: 'Upload completed successfully'
      };

      // 1. Upload site photos to Wasabi and save to LeadDocuments (doc_type = 1)
      if (data.sitePhotos && data.sitePhotos.length > 0) {
        // Validate that document type with id = 1 exists for this vendor
        const sitePhotoDocType = await tx.documentTypeMaster.findFirst({
          where: { id: 1, vendor_id: data.vendor_id }
        });

        if (!sitePhotoDocType) {
          throw new Error('Document type with id 1 (site photos) not found for this vendor');
        }

        for (const photo of data.sitePhotos) {
          const sanitizedFilename = sanitizeFilename(photo.originalname);
          const s3Key = `current_site_photos/${data.vendor_id}/${data.lead_id}/${Date.now()}-${sanitizedFilename}`;
          
          // Upload to Wasabi
          await wasabi.send(new PutObjectCommand({
            Bucket: process.env.WASABI_BUCKET_NAME || 'your-bucket-name',
            Key: s3Key,
            Body: photo.buffer,
            ContentType: photo.mimetype,
          }));

          // Save document info to database
          const document = await tx.leadDocuments.create({
            data: {
              doc_og_name: photo.originalname,
              doc_sys_name: s3Key,
              created_by: data.created_by,
              doc_type_id: 2, // Current Site photos document type ID
              account_id: data.account_id,
              lead_id: data.lead_id,
              vendor_id: data.vendor_id,
            }
          });

          response.documentsUploaded.push({
            id: document.id,
            type: 'current_site_photo',
            originalName: photo.originalname,
            s3Key: s3Key
          });
        }
      }

      // 2. Upload PDF file (doc_type = 3) - Mandatory field
      if (!data.pdfFile) {
        throw new Error('PDF file is mandatory');
      }

      // Validate that document type with id = 3 exists for this vendor
      const pdfDocType = await tx.documentTypeMaster.findFirst({
        where: { id: 3, vendor_id: data.vendor_id }
      });

      if (!pdfDocType) {
        throw new Error('Document type with id 3 (PDF uploads) not found for this vendor');
      }

      const sanitizedPdfName = sanitizeFilename(data.pdfFile.originalname);
      const pdfS3Key = `initial_site_measurement_documents/${data.vendor_id}/${data.lead_id}/${Date.now()}-${sanitizedPdfName}`;
      
      // Upload PDF to Wasabi
      await wasabi.send(new PutObjectCommand({
        Bucket: process.env.WASABI_BUCKET_NAME || 'your-bucket-name',
        Key: pdfS3Key,
        Body: data.pdfFile.buffer,
        ContentType: data.pdfFile.mimetype,
      }));

      // Create document entry using the document type id
      const pdfDocument = await tx.leadDocuments.create({
        data: {
          doc_og_name: data.pdfFile.originalname,
          doc_sys_name: pdfS3Key,
          created_by: data.created_by,
          doc_type_id: 4, // PDF document type ID
          account_id: data.account_id,
          lead_id: data.lead_id,
          vendor_id: data.vendor_id,
        }
      });

      response.documentsUploaded.push({
        id: pdfDocument.id,
        type: 'pdf_upload',
        originalName: data.pdfFile.originalname,
        s3Key: pdfS3Key
      });

      // 3. Handle payment image file (optional)
      let paymentFileId: number | null = null;
      if (data.paymentImageFile) {
      const sanitizedPaymentImageName = sanitizeFilename(data.paymentImageFile.originalname);
      const paymentImageS3Key = `initial-site-measurement-payment-images/${data.vendor_id}/${data.lead_id}/${Date.now()}-${sanitizedPaymentImageName}`;
      
      // Upload payment image to Wasabi
      await wasabi.send(new PutObjectCommand({
          Bucket: process.env.WASABI_BUCKET_NAME || 'your-bucket-name',
          Key: paymentImageS3Key,
          Body: data.paymentImageFile.buffer,
          ContentType: data.paymentImageFile.mimetype,
      }));

      // Save document info to database with doc_type_id = 3 (hardcoded for payments)
      const paymentDocument = await tx.leadDocuments.create({
          data: {
          doc_og_name: data.paymentImageFile.originalname,
          doc_sys_name: paymentImageS3Key,
          created_by: data.created_by,
          doc_type_id: 3, // Payment document type ID (hardcoded)
          account_id: data.account_id,
          lead_id: data.lead_id,
          vendor_id: data.vendor_id,
          }
      });

      paymentFileId = paymentDocument.id;

      response.documentsUploaded.push({
          id: paymentDocument.id,
          type: 'initial_site_measurement_payment_details',
          originalName: data.paymentImageFile.originalname,
          s3Key: paymentImageS3Key
      });
      }

      // 4. Create PaymentInfo entry (if amount is provided)
      if (data.amount && data.payment_date) {
        const paymentInfo = await tx.paymentInfo.create({
          data: {
            lead_id: data.lead_id,
            account_id: data.account_id,
            vendor_id: data.vendor_id,
            created_by: data.created_by,
            amount: data.amount,
            payment_date: data.payment_date,
            payment_text: data.payment_text || null,
            payment_file_id: null,
          }
        });

        response.paymentInfo = {
          id: paymentInfo.id,
          amount: paymentInfo.amount,
          payment_date: paymentInfo.payment_date,
          payment_text: paymentInfo.payment_text
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
            type: LedgerType.credit, // Assuming payment received is a credit
            created_by: data.created_by,
          }
        });

        response.ledgerEntry = {
          id: ledgerEntry.id,
          amount: ledgerEntry.amount,
          type: ledgerEntry.type,
          payment_date: ledgerEntry.payment_date
        };
      }

      // ✅ 6. Update LeadMaster status from 1 → 2
      await tx.leadMaster.updateMany({
          where: {
          id: data.lead_id,
          vendor_id: data.vendor_id,
          status_id: 1 
          },
          data: {
          status_id: 2
          }
      });

      return response;
  }, {
      timeout: 20000 // 20 seconds
    });

    return result;

  } catch (error: any) {
    console.error('[PaymentUploadService] Error:', error);
    throw new Error(`Failed to create payment upload: ${error.message}`);
  }
}

// Get leads by status with pagination
public async getLeadsByStatus(
  vendorId: number, 
  statusId: number,
  page: number = 1, 
  limit: number = 10
): Promise<{ data: LeadDetailDto[], total: number }> {
  try {
    const skip = (page - 1) * limit;

    const whereClause = {
      vendor_id: vendorId,
      status_id: statusId,
      is_deleted: false
    };

    const [leads, total] = await Promise.all([
      prisma.leadMaster.findMany({
        where: whereClause,
        include: {
          vendor: {
            select: {
              id: true,
              vendor_name: true,
              vendor_code: true
            }
          },
          siteType: {
            select: {
              id: true,
              type: true
            }
          },
          source: {
            select: {
              id: true,
              type: true
            }
          },
          account: {
            select: {
              id: true,
              name: true,
              contact_no: true,
              email: true
            }
          },
          statusType: {
            select: {
              id: true,
              type: true
            }
          },
          createdBy: {
            select: {
              id: true,
              user_name: true,
              user_email: true
            }
          },
          updatedBy: {
            select: {
              id: true,
              user_name: true,
              user_email: true
            }
          },
          assignedTo: {
            select: {
              id: true,
              user_name: true,
              user_email: true
            }
          },
          assignedBy: {
            select: {
              id: true,
              user_name: true,
              user_email: true
            }
          },
          // Include counts for related data
          _count: {
            select: {
              payments: true,
              documents: {
                where: {
                  deleted_at: null
                }
              },
              ledgers: true,
              productMappings: true
            }
          }
        },
        orderBy: {
          created_at: 'desc'
        },
        skip,
        take: limit
      }),
      prisma.leadMaster.count({
        where: whereClause
      })
    ]);

    const data: LeadDetailDto[] = leads.map(lead => ({
      id: lead.id,
      firstname: lead.firstname,
      lastname: lead.lastname,
      country_code: lead.country_code,
      contact_no: lead.contact_no,
      alt_contact_no: lead.alt_contact_no,
      email: lead.email,
      site_address: lead.site_address,
      priority: lead.priority,
      billing_name: lead.billing_name,
      archetech_name: lead.archetech_name,
      designer_remark: lead.designer_remark,
      vendor: lead.vendor,
      siteType: lead.siteType,
      source: lead.source,
      account: lead.account,
      statusType: lead.statusType,
      createdBy: lead.createdBy,
      updatedBy: lead.updatedBy,
      assignedTo: lead.assignedTo,
      assignedBy: lead.assignedBy,
      created_at: lead.created_at,
      updated_at: lead.updated_at,
      // Summary counts
      summary: {
        totalPayments: lead._count.payments,
        totalDocuments: lead._count.documents,
        totalLedgerEntries: lead._count.ledgers,
        totalProductMappings: lead._count.productMappings
      }
    }));

    return { data, total };

  } catch (error: any) {
    console.error('[PaymentUploadService] Error getting leads by status:', error);
    throw new Error(`Failed to get leads by status: ${error.message}`);
  }
}

// Get payment uploads by lead ID (only for leads with status_id == 2)
public async getPaymentUploadsByLead(
  leadId: number,
  vendorId: number
): Promise<PaymentUploadDetailDto[]> {
  try {
    // Ensure the lead exists and has status_id = 2
    const lead = await prisma.leadMaster.findFirst({
      where: {
        id: leadId,
        vendor_id: vendorId,
        status_id: 2
      }
    });

    if (!lead) return [];

    // Fetch payment infos
    const paymentInfos = await prisma.paymentInfo.findMany({
      where: {
        lead_id: leadId,
        vendor_id: vendorId,
        lead: { status_id: 2 }
      },
      include: {
        lead: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            contact_no: true,
            email: true,
            status_id: true
          }
        },
        account: { select: { id: true, name: true, contact_no: true, email: true } },
        createdBy: { select: { id: true, user_name: true, user_email: true } },
        document: { select: { id: true, type: true } }
      },
      orderBy: { created_at: 'desc' }
    });

    // Fetch documents
    const documents = await prisma.leadDocuments.findMany({
      where: {
        lead_id: leadId,
        vendor_id: vendorId,
        deleted_at: null,
        lead: { status_id: 2 }
      },
      include: {
        createdBy: { select: { id: true, user_name: true, user_email: true } },
        documentType: { select: { id: true, type: true } }
      },
      orderBy: { created_at: 'desc' }
    });

    // Fetch ledger entries
    const ledgerEntries = await prisma.ledger.findMany({
      where: {
        lead_id: leadId,
        vendor_id: vendorId,
        lead: { status_id: 2 }
      },
      orderBy: { created_at: 'desc' }
    });

    const result: PaymentUploadDetailDto[] = [];

    // Combine payment info + ledger + documents
    for (const payment of paymentInfos) {
      const relatedLedger = ledgerEntries.find(
        l =>
          l.payment_date.getTime() === payment.payment_date?.getTime() &&
          l.amount === payment.amount
      );

      result.push({
        id: payment.id,
        type: 'payment_upload',
        lead: payment.lead,
        account: payment.account,
        paymentInfo: {
          id: payment.id,
          amount: payment.amount,
          payment_date: payment.payment_date,
          payment_text: payment.payment_text,
          payment_file_id: payment.payment_file_id
        },
        ledgerEntry: relatedLedger
          ? {
              id: relatedLedger.id,
              amount: relatedLedger.amount,
              type: relatedLedger.type,
              payment_date: relatedLedger.payment_date
            }
          : null,
        documents: documents
          .filter(doc => {
            const timeDiff = Math.abs(doc.created_at.getTime() - payment.created_at.getTime());
            return timeDiff < 60000;
          })
          .map(doc => ({
            id: doc.id,
            doc_og_name: doc.doc_og_name,
            doc_sys_name: doc.doc_sys_name,
            doc_type: doc.documentType.type,
            created_at: doc.created_at,
            createdBy: doc.createdBy
          })),
        createdBy: payment.createdBy,
        created_at: payment.created_at
      });
    }

    // Handle standalone documents (not tied to payment)
    const paymentTimes = paymentInfos.map(p => p.created_at.getTime());
    const documentOnlyUploads = documents.filter(doc => {
      return !paymentTimes.some(time => Math.abs(doc.created_at.getTime() - time) < 60000);
    });

    const groupedDocs: { [key: string]: typeof documents } = {};
    documentOnlyUploads.forEach(doc => {
      const timeKey = Math.floor(doc.created_at.getTime() / (5 * 60 * 1000));
      if (!groupedDocs[timeKey]) groupedDocs[timeKey] = [];
      groupedDocs[timeKey].push(doc);
    });

    Object.values(groupedDocs).forEach(docGroup => {
      const firstDoc = docGroup[0];
      result.push({
        id: firstDoc.id,
        type: 'document_upload',
        lead: paymentInfos[0]?.lead || lead,
        account: paymentInfos[0]?.account || null,
        paymentInfo: null,
        ledgerEntry: null,
        documents: docGroup.map(doc => ({
          id: doc.id,
          doc_og_name: doc.doc_og_name,
          doc_sys_name: doc.doc_sys_name,
          doc_type: doc.documentType.type,
          created_at: doc.created_at,
          createdBy: doc.createdBy
        })),
        createdBy: firstDoc.createdBy,
        created_at: firstDoc.created_at
      });
    });

    // Sort by newest first
    return result.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  } catch (error: any) {
    console.error('[PaymentUploadGetService] Error getting uploads by lead:', error);
    throw new Error(`Failed to get payment uploads: ${error.message}`);
  }
}


  // Get payment uploads by account ID
  public async getPaymentUploadsByAccount(accountId: number, vendorId: number): Promise<PaymentUploadListDto[]> {
    try {
      const paymentInfos = await prisma.paymentInfo.findMany({
        where: {
          account_id: accountId,
          vendor_id: vendorId
        },
        include: {
          lead: {
            select: {
              id: true,
              firstname: true,
              lastname: true,
              contact_no: true
            }
          },
          account: {
            select: {
              id: true,
              name: true
            }
          },
          createdBy: {
            select: {
              user_name: true
            }
          }
        },
        orderBy: {
          created_at: 'desc'
        }
      });

      return paymentInfos.map(payment => ({
        id: payment.id,
        lead: payment.lead,
        account: payment.account,
        amount: payment.amount,
        payment_date: payment.payment_date,
        payment_text: payment.payment_text,
        createdBy: payment.createdBy.user_name,
        created_at: payment.created_at
      }));

    } catch (error: any) {
      console.error('[PaymentUploadGetService] Error getting uploads by account:', error);
      throw new Error(`Failed to get payment uploads: ${error.message}`);
    }
  }

  // Get payment upload by ID
  public async getPaymentUploadById(id: number, vendorId: number): Promise<PaymentUploadDetailDto | null> {
    try {
      const paymentInfo = await prisma.paymentInfo.findFirst({
        where: {
          id: id,
          vendor_id: vendorId
        },
        include: {
          lead: true,
          account: true,
          createdBy: {
            select: {
              id: true,
              user_name: true,
              user_email: true
            }
          },
          document: true
        }
      });

      if (!paymentInfo) {
        return null;
      }

             // Get related documents and ledger entries
       const documents = await prisma.leadDocuments.findMany({
         where: {
           lead_id: paymentInfo.lead_id,
           vendor_id: vendorId,
           deleted_at: null,
           created_at: {
             gte: new Date(paymentInfo.created_at.getTime() - 60000),
             lte: new Date(paymentInfo.created_at.getTime() + 60000)
           }
         },
         include: {
           createdBy: {
             select: {
               id: true,
               user_name: true
             }
           },
           documentType: {
             select: {
               id: true,
               type: true
             }
           }
         }
       });

      const ledgerEntry = await prisma.ledger.findFirst({
        where: {
          lead_id: paymentInfo.lead_id,
          vendor_id: vendorId,
          amount: paymentInfo.amount || 0,
          payment_date: paymentInfo.payment_date || undefined
        }
      });

      return {
        id: paymentInfo.id,
        type: 'payment_upload',
        lead: paymentInfo.lead,
        account: paymentInfo.account,
        paymentInfo: {
          id: paymentInfo.id,
          amount: paymentInfo.amount,
          payment_date: paymentInfo.payment_date,
          payment_text: paymentInfo.payment_text,
          payment_file_id: paymentInfo.payment_file_id
        },
        ledgerEntry: ledgerEntry ? {
          id: ledgerEntry.id,
          amount: ledgerEntry.amount,
          type: ledgerEntry.type,
          payment_date: ledgerEntry.payment_date
        } : null,
                 documents: documents.map(doc => ({
           id: doc.id,
           doc_og_name: doc.doc_og_name,
           doc_sys_name: doc.doc_sys_name,
           doc_type: doc.documentType.type,
           created_at: doc.created_at,
           createdBy: doc.createdBy
         })),
        createdBy: paymentInfo.createdBy,
        created_at: paymentInfo.created_at
      };

    } catch (error: any) {
      console.error('[PaymentUploadGetService] Error getting upload by id:', error);
      throw new Error(`Failed to get payment upload: ${error.message}`);
    }
  }

  // Get payment uploads by vendor with pagination
  public async getPaymentUploadsByVendor(
    vendorId: number, 
    page: number = 1, 
    limit: number = 10,
    startDate?: Date,
    endDate?: Date
  ): Promise<{ data: PaymentUploadListDto[], total: number }> {
    try {
      const whereClause: any = {
        vendor_id: vendorId
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
                contact_no: true
              }
            },
            account: {
              select: {
                id: true,
                name: true
              }
            },
            createdBy: {
              select: {
                user_name: true
              }
            }
          },
          orderBy: {
            created_at: 'desc'
          },
          skip: (page - 1) * limit,
          take: limit
        }),
        prisma.paymentInfo.count({
          where: whereClause
        })
      ]);

      const data = paymentInfos.map(payment => ({
        id: payment.id,
        lead: payment.lead,
        account: payment.account,
        amount: payment.amount,
        payment_date: payment.payment_date,
        payment_text: payment.payment_text,
        createdBy: payment.createdBy.user_name,
        created_at: payment.created_at
      }));

      return { data, total };

    } catch (error: any) {
      console.error('[PaymentUploadGetService] Error getting uploads by vendor:', error);
      throw new Error(`Failed to get payment uploads: ${error.message}`);
    }
  }

  // Generate download URL for document
  public async getDocumentDownloadUrl(documentId: number, vendorId: number): Promise<DocumentDownloadDto | null> {
    try {
      const document = await prisma.leadDocuments.findFirst({
        where: {
          id: documentId,
          vendor_id: vendorId,
          deleted_at: null
        }
      });

      if (!document) {
        return null;
      }

      // Generate signed URL for Wasabi
      const command = new GetObjectCommand({
        Bucket: process.env.WASABI_BUCKET_NAME || 'your-bucket-name',
        Key: document.doc_sys_name
      });

      const signedUrl = await getSignedUrl(wasabi, command, { expiresIn: 3600 }); // 1 hour

      return {
        id: document.id,
        originalName: document.doc_og_name,
        downloadUrl: signedUrl,
        expiresAt: new Date(Date.now() + 3600000) // 1 hour from now
      };

    } catch (error: any) {
      console.error('[PaymentUploadGetService] Error generating download URL:', error);
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
        vendor_id: vendorId
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
            amount: true
          },
          _count: {
            id: true
          },
          _avg: {
            amount: true
          }
        }),
        prisma.leadDocuments.count({
          where: {
            vendor_id: vendorId,
            deleted_at: null,
            ...(startDate || endDate ? {
              created_at: {
                ...(startDate && { gte: startDate }),
                ...(endDate && { lte: endDate })
              }
            } : {})
          }
        })
      ]);

      // Get monthly payment breakdown
      const monthlyPayments = await prisma.$queryRaw<Array<{
        month: string;
        total_amount: number;
        payment_count: number;
      }>>`
        SELECT 
          TO_CHAR(payment_date, 'YYYY-MM') as month,
          SUM(amount::numeric)::float as total_amount,
          COUNT(*)::int as payment_count
        FROM "PaymentInfo"
        WHERE vendor_id = ${vendorId}
        ${startDate ? `AND payment_date >= ${startDate}` : ''}
        ${endDate ? `AND payment_date <= ${endDate}` : ''}
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
          endDate: endDate || null
        }
      };

    } catch (error: any) {
      console.error('[PaymentUploadGetService] Error getting analytics:', error);
      throw new Error(`Failed to get payment analytics: ${error.message}`);
    }
  }

  // Helper method to validate that required document types exist
  private async validateDocumentTypes(vendorId: number) {
    const sitePhotoType = await prisma.documentTypeMaster.findFirst({
      where: { id: 1, vendor_id: vendorId }
    });

    const pdfType = await prisma.documentTypeMaster.findFirst({
      where: { id: 3, vendor_id: vendorId }
    });

    if (!sitePhotoType) {
      throw new Error('Site photo document type (id: 1) not found for vendor');
    }

    if (!pdfType) {
      throw new Error('PDF document type (id: 3) not found for vendor');
    }
  }
}