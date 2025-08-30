import { PrismaClient, LedgerType } from '@prisma/client';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import wasabi from '../../../utils/wasabiClient';
import { sanitizeFilename } from '../../../utils/fileUtils';
import { CreatePaymentUploadDto, PaymentUploadResponseDto } from '../../../types/leadModule.types';

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
            const s3Key = `site-photos/${data.vendor_id}/${data.lead_id}/${Date.now()}-${sanitizedFilename}`;
            
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
                doc_type_id: 2, // CUrrent Site photos document type ID
                account_id: data.account_id,
                lead_id: data.lead_id,
                vendor_id: data.vendor_id,
              }
            });

            response.documentsUploaded.push({
              id: document.id,
              type: 'site_photo',
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
        const pdfS3Key = `pdf-uploads/${data.vendor_id}/${data.lead_id}/${Date.now()}-${sanitizedPdfName}`;
        
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
            doc_type_id: 3, // PDF document type ID
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
          const paymentImageS3Key = `payment-images/${data.vendor_id}/${data.lead_id}/${Date.now()}-${sanitizedPaymentImageName}`;
          
          // Upload payment image to Wasabi
          await wasabi.send(new PutObjectCommand({
            Bucket: process.env.WASABI_BUCKET_NAME || 'your-bucket-name',
            Key: paymentImageS3Key,
            Body: data.paymentImageFile.buffer,
            ContentType: data.paymentImageFile.mimetype,
          }));

          // Create document type entry for payment image
          const paymentImageDoc = await tx.documentTypeMaster.create({
            data: {
              type: `payment_image_${Date.now()}`, // Unique identifier
              vendor_id: data.vendor_id,
            }
          });

          paymentFileId = paymentImageDoc.id;

          response.documentsUploaded.push({
            id: paymentImageDoc.id,
            type: 'payment_image',
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
              payment_file_id: paymentFileId,
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

        return response;
      });

      return result;

    } catch (error: any) {
      console.error('[PaymentUploadService] Error:', error);
      throw new Error(`Failed to create payment upload: ${error.message}`);
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