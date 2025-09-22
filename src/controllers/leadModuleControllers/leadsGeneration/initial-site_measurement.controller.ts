import { Request, Response } from 'express';
import { PaymentUploadService } from '../../../services/leadModuleServices/leadsGeneration/initial-site_measurement.service';
import { CreatePaymentUploadDto, UpdatePaymentUploadDto } from '../../../types/leadModule.types';
import { prisma } from '../../../prisma/client';
import logger from '../../../utils/logger';
import { assignTaskISMService } from '../../../services/leadModuleServices/leadsGeneration/initial-site_measurement.service';

export class PaymentUploadController {
  private paymentUploadService: PaymentUploadService;

  constructor() {
    this.paymentUploadService = new PaymentUploadService();
  }

  public async assignTaskISM(req: Request, res: Response): Promise<Response> {
    logger.info("[CONTROLLER] assignTaskISM called");
    try {
      const leadId = Number(req.params.leadId);
      const {
        task_type,
        due_date,
        remark,
        user_id,       // assignee
        created_by,    // optional: if you carry user id from FE; otherwise derive from auth
      } = req.body;

      // Minimal validation here (service re-validates too)
      if (!leadId || !task_type || !due_date || !user_id) {
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          details: [
            !leadId && { field: "leadId", message: "leadId (param) is required" },
            !task_type && { field: "task_type", message: "task_type is required" },
            !due_date && { field: "due_date", message: "due_date is required" },
            !user_id && { field: "user_id", message: "user_id is required" },
          ].filter(Boolean),
        });
      }

      const actorId = created_by ?? (req as any).user?.id; // if you attach auth user to req
      const result = await assignTaskISMService({
        lead_id: leadId,
        task_type,
        due_date,
        remark,
        assignee_user_id: Number(user_id),
        created_by: Number(actorId),
      });

      return res.status(201).json({
        success: true,
        message: "ISM task assigned and lead status updated",
        data: result,
      });
    } catch (error: any) {
      logger.error("[ERROR] assignTaskISM:", { err: error });
      return res.status(500).json({
        success: false,
        error: "Internal server error",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  public createPaymentUpload = async (req: Request, res: Response): Promise<void> => {
    try {
      const { lead_id, account_id, vendor_id, created_by, client_id } = req.body;

      // Validate required fields
      if (!lead_id || !account_id || !vendor_id || !created_by || !client_id) {
        res.status(400).json({
          success: false,
          message: 'lead_id, account_id, vendor_id, created_by, and client_id are required'
        });
        return;
      }

      // Extract files from multer
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      
      const sitePhotos = files?.current_site_photos || [];
      const pdfFile = files?.upload_pdf?.[0];
      const paymentImageFile = files?.payment_image?.[0];

      // Validate PDF file if provided
      if (pdfFile && pdfFile.mimetype !== 'application/pdf') {
        res.status(400).json({
          success: false,
          message: 'Upload file must be a PDF'
        });
        return;
      }

      // Validate image files for site photos
      const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
      for (const photo of sitePhotos) {
        if (!validImageTypes.includes(photo.mimetype)) {
          res.status(400).json({
            success: false,
            message: 'Site photos must be valid image files (JPEG, JPG, PNG, GIF)'
          });
          return;
        }
      }

      // Validate payment image if provided
      if (paymentImageFile && !validImageTypes.includes(paymentImageFile.mimetype)) {
        res.status(400).json({
          success: false,
          message: 'Payment image must be a valid image file (JPEG, JPG, PNG, GIF)'
        });
        return;
      }

      // Create DTO
      const createDto: CreatePaymentUploadDto = {
        lead_id: parseInt(lead_id),
        account_id: parseInt(account_id),
        vendor_id: parseInt(vendor_id),
        created_by: parseInt(created_by),
        client_id: parseInt(client_id),
        amount: req.body.amount ? parseFloat(req.body.amount) : undefined,
        payment_date: req.body.payment_date ? new Date(req.body.payment_date) : undefined,
        payment_text: req.body.payment_text || undefined,
        sitePhotos,
        pdfFile,
        paymentImageFile,
      };

      // Business logic validations
      if (createDto.amount && !createDto.payment_date) {
        res.status(400).json({
          success: false,
          message: 'Payment date is required when amount is provided'
        });
        return;
      }

      if (createDto.paymentImageFile && !createDto.payment_text) {
        res.status(400).json({
          success: false,
          message: 'Payment text is mandatory when payment image is uploaded'
        });
        return;
      }

      // Call service
      const result = await this.paymentUploadService.createPaymentUpload(createDto);

      res.status(201).json({
        success: true,
        message: 'Payment upload created successfully',
        data: result
      });

    } catch (error: any) {
      console.error('[PaymentUploadController] Error:', error);
      
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  };

  // GET /api/payment-upload/documents/signed-url/:s3Key
  public generateSignedUrl = async (req: Request, res: Response): Promise<void> => {
    try {
      const { s3Key } = req.params;
      const { vendor_id, expires_in } = req.query;

      if (!s3Key || !vendor_id) {
        res.status(400).json({
          success: false,
          message: 's3Key and vendor_id are required'
        });
        return;
      }

      // Decode the s3Key if it was URL encoded
      const decodedS3Key = decodeURIComponent(s3Key);
      
      const signedUrl = await this.paymentUploadService.generateSignedUrl(
        decodedS3Key,
        parseInt(vendor_id as string),
        expires_in ? parseInt(expires_in as string) : 3600
      );

      res.status(200).json({
        success: true,
        message: 'Signed URL generated successfully',
        data: {
          signed_url: signedUrl,
          expires_in: expires_in ? parseInt(expires_in as string) : 3600
        }
      });

    } catch (error: any) {
      console.error('[PaymentUploadController] Error generating signed URL:', error);
      
      res.status(error.message.includes('not found') ? 404 : 500).json({
        success: false,
        message: error.message.includes('not found') ? 'Document not found' : 'Internal server error',
        error: error.message
      });
    }
  };

  // POST /api/payment-upload/documents/batch-signed-urls
  public generateBatchSignedUrls = async (req: Request, res: Response): Promise<void> => {
    try {
      const { documents, vendor_id, expires_in } = req.body;

      if (!documents || !Array.isArray(documents) || !vendor_id) {
        res.status(400).json({
          success: false,
          message: 'documents (array) and vendor_id are required'
        });
        return;
      }

      // Validate documents array structure
      const isValidDocuments = documents.every(doc => 
        typeof doc === 'string' || (typeof doc === 'object' && doc.s3Key)
      );

      if (!isValidDocuments) {
        res.status(400).json({
          success: false,
          message: 'documents must be an array of s3Keys (strings) or objects with s3Key property'
        });
        return;
      }

      // Transform to consistent format
      const documentList = documents.map(doc => ({
        s3Key: typeof doc === 'string' ? doc : doc.s3Key,
        vendorId: parseInt(vendor_id as string)
      }));

      const signedUrls = await this.paymentUploadService.generateBatchSignedUrls(documentList);

      res.status(200).json({
        success: true,
        message: 'Batch signed URLs generated successfully',
        data: {
          signed_urls: signedUrls,
          expires_in: expires_in ? parseInt(expires_in as string) : 3600,
          total_processed: documents.length
        }
      });

    } catch (error: any) {
      console.error('[PaymentUploadController] Error generating batch signed URLs:', error);
      
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  };

  // GET /api/leads/vendor/:vendorId/status/2
  public getLeadsByStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const { vendorId } = req.params;
      const { page = '1', limit = '10' } = req.query;
  
      if (!vendorId) {
        res.status(400).json({
          success: false,
          message: 'vendorId is required'
        });
        return;
      }

      const vendor_id = parseInt(vendorId);

      // ✅ Find the correct status type for this vendor
      const statusType = await prisma.statusTypeMaster.findFirst({
        where: { vendor_id, tag: "Type 2" },
      });

      if (!statusType) {
        res.status(404).json({
          success: false,
          message: `Status 'Type 2' not found for vendor ${vendorId}`,
        });
        return;
      }
  
      const result = await this.paymentUploadService.getLeadsByStatus(
        vendor_id,
        statusType.id,
        parseInt(page as string),
        parseInt(limit as string)
      );
  
      // Fetch detailed uploads for each lead
      const leadsWithUploads = await Promise.all(
        result.data.map(async (lead: any) => {
          const uploads = await this.paymentUploadService.getPaymentUploadsByLead(
            lead.id,
            parseInt(vendorId),
          );
          return {
            ...lead,
            uploads
          };
        })
      );
  
      res.status(200).json({
        success: true,
        message: 'Leads retrieved successfully',
        data: leadsWithUploads,
        pagination: {
          currentPage: parseInt(page as string),
          totalPages: Math.ceil(result.total / parseInt(limit as string)),
          totalRecords: result.total,
          hasNext: parseInt(page as string) < Math.ceil(result.total / parseInt(limit as string)),
          hasPrev: parseInt(page as string) > 1
        }
      });
  
    } catch (error: any) {
      console.error('[PaymentUploadController] Error getting leads by status:', error);
      
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  };

  // GET /api/payment-upload/lead/:leadId
  public getPaymentUploadsByLead = async (req: Request, res: Response): Promise<void> => {
    try {
      const { leadId } = req.params;
      const { vendor_id } = req.query;

      if (!leadId || !vendor_id) {
        res.status(400).json({
          success: false,
          message: 'leadId and vendor_id are required'
        });
        return;
      }

      const result = await this.paymentUploadService.getPaymentUploadsByLead(
        parseInt(leadId),
        parseInt(vendor_id as string)
      );

      res.status(200).json({
        success: true,
        message: 'Payment uploads retrieved successfully',
        data: result
      });

    } catch (error: any) {
      console.error('[PaymentUploadGetController] Error:', error);
      
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  };

  // GET /api/payment-upload/account/:accountId
  public getPaymentUploadsByAccount = async (req: Request, res: Response): Promise<void> => {
    try {
      const { accountId } = req.params;
      const { vendor_id } = req.query;

      if (!accountId || !vendor_id) {
        res.status(400).json({
          success: false,
          message: 'accountId and vendor_id are required'
        });
        return;
      }

      const result = await this.paymentUploadService.getPaymentUploadsByAccount(
        parseInt(accountId),
        parseInt(vendor_id as string)
      );

      res.status(200).json({
        success: true,
        message: 'Payment uploads retrieved successfully',
        data: result
      });

    } catch (error: any) {
      console.error('[PaymentUploadGetController] Error:', error);
      
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  };

  // GET /api/payment-upload/vendor/:vendorId
  public getPaymentUploadsByVendor = async (req: Request, res: Response): Promise<void> => {
    try {
      const { vendorId } = req.params;
      const { page = '1', limit = '10', startDate, endDate } = req.query;

      const result = await this.paymentUploadService.getPaymentUploadsByVendor(
        parseInt(vendorId),
        parseInt(page as string),
        parseInt(limit as string),
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );

      res.status(200).json({
        success: true,
        message: 'Payment uploads retrieved successfully',
        data: result.data,
        pagination: {
          currentPage: parseInt(page as string),
          totalPages: Math.ceil(result.total / parseInt(limit as string)),
          totalRecords: result.total,
          hasNext: parseInt(page as string) < Math.ceil(result.total / parseInt(limit as string)),
          hasPrev: parseInt(page as string) > 1
        }
      });

    } catch (error: any) {
      console.error('[PaymentUploadGetController] Error:', error);
      
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  };

  // GET /api/payment-upload/documents/:documentId/download
  public downloadDocument = async (req: Request, res: Response): Promise<void> => {
    try {
      const { documentId } = req.params;
      const { vendor_id } = req.query;

      if (!documentId || !vendor_id) {
        res.status(400).json({
          success: false,
          message: 'documentId and vendor_id are required'
        });
        return;
      }

      const result = await this.paymentUploadService.getDocumentDownloadUrl(
        parseInt(documentId),
        parseInt(vendor_id as string)
      );

      if (!result) {
        res.status(404).json({
          success: false,
          message: 'Document not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Document download URL generated successfully',
        data: result
      });

    } catch (error: any) {
      console.error('[PaymentUploadGetController] Error:', error);
      
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  };

  // GET /api/payment-upload/analytics/:vendorId
  public getPaymentAnalytics = async (req: Request, res: Response): Promise<void> => {
    try {
      const { vendorId } = req.params;
      const { startDate, endDate } = req.query;

      const result = await this.paymentUploadService.getPaymentAnalytics(
        parseInt(vendorId),
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );

      res.status(200).json({
        success: true,
        message: 'Payment analytics retrieved successfully',
        data: result
      });

    } catch (error: any) {
      console.error('[PaymentUploadGetController] Error:', error);
      
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  };

  public updatePaymentUpload = async (req: Request, res: Response): Promise<void> => {
    try {
      const { paymentId } = req.params;
      const { 
        lead_id, 
        account_id, 
        vendor_id, 
        updated_by,
        amount,
        payment_date,
        payment_text 
      } = req.body;

      // Validate required fields
      if (!paymentId || !lead_id || !account_id || !vendor_id || !updated_by) {
        res.status(400).json({
          success: false,
          message: 'paymentId, lead_id, account_id, vendor_id, and updated_by are required'
        });
        return;
      }

      // Validate paymentId is a valid number
      const paymentIdNum = parseInt(paymentId);
      if (isNaN(paymentIdNum)) {
        res.status(400).json({
          success: false,
          message: 'Invalid payment ID'
        });
        return;
      }

      // Extract files from multer
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      
      const currentSitePhotos = files?.current_site_photos || [];
      const paymentDetailPhotos = files?.payment_detail_photos || [];

      // Validate image files for current site photos
      const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
      
      for (const photo of currentSitePhotos) {
        if (!validImageTypes.includes(photo.mimetype)) {
          res.status(400).json({
            success: false,
            message: 'Current site photos must be valid image files (JPEG, JPG, PNG, GIF)'
          });
          return;
        }
      }

      // Validate payment detail photos
      for (const photo of paymentDetailPhotos) {
        if (!validImageTypes.includes(photo.mimetype)) {
          res.status(400).json({
            success: false,
            message: 'Payment detail photos must be valid image files (JPEG, JPG, PNG, GIF)'
          });
          return;
        }
      }

      // Validate amount if provided
      if (amount !== undefined) {
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount < 0) {
          res.status(400).json({
            success: false,
            message: 'Amount must be a valid positive number'
          });
          return;
        }
      }

      // Validate payment_date if provided
      if (payment_date !== undefined && payment_date !== '') {
        const parsedDate = new Date(payment_date);
        if (isNaN(parsedDate.getTime())) {
          res.status(400).json({
            success: false,
            message: 'Payment date must be a valid date'
          });
          return;
        }
      }

      // Create DTO
      const updateDto: UpdatePaymentUploadDto = {
        lead_id: parseInt(lead_id),
        account_id: parseInt(account_id),
        vendor_id: parseInt(vendor_id),
        updated_by: parseInt(updated_by),
        amount: amount ? parseFloat(amount) : undefined,
        payment_date: payment_date ? new Date(payment_date) : undefined,
        payment_text: payment_text || undefined,
        currentSitePhotos: currentSitePhotos.length > 0 ? currentSitePhotos : undefined,
        paymentDetailPhotos: paymentDetailPhotos.length > 0 ? paymentDetailPhotos : undefined
      };

      // Business logic validation
      if (updateDto.amount !== undefined && updateDto.payment_date === undefined) {
        // Check if existing payment has payment_date
        const existingPayment = await this.paymentUploadService.getPaymentUploadById(
          paymentIdNum, 
          updateDto.vendor_id
        );
        
        if (!existingPayment.payment_date) {
          res.status(400).json({
            success: false,
            message: 'Payment date is required when updating amount'
          });
          return;
        }
      }

      // Ensure at least one field is being updated
      const hasUpdates = updateDto.amount !== undefined || 
                        updateDto.payment_date !== undefined || 
                        updateDto.payment_text !== undefined ||
                        (updateDto.currentSitePhotos && updateDto.currentSitePhotos.length > 0) ||
                        (updateDto.paymentDetailPhotos && updateDto.paymentDetailPhotos.length > 0);

      if (!hasUpdates) {
        res.status(400).json({
          success: false,
          message: 'At least one field must be provided for update'
        });
        return;
      }

      // Call service
      const result = await this.paymentUploadService.updatePaymentUpload(paymentIdNum, updateDto);

      res.status(200).json({
        success: true,
        message: 'Payment upload updated successfully',
        data: result
      });

    } catch (error: any) {
      console.error('[PaymentUploadController] Error updating payment:', error);
      
      let statusCode = 500;
      let message = 'Internal server error';

      if (error.message.includes('not found') || error.message.includes('access denied')) {
        statusCode = 404;
        message = 'Payment not found or access denied';
      } else if (error.message.includes('Document type') && error.message.includes('not found')) {
        statusCode = 400;
        message = 'Invalid document type configuration for vendor';
      }

      res.status(statusCode).json({
        success: false,
        message: message,
        error: error.message
      });
    }
  };

  // PUT /api/payment-upload/documents/:documentId/delete
  public softDeleteDocument = async (req: Request, res: Response): Promise<void> => {
    try {
      const { documentId } = req.params;
      const { user_id, vendor_id } = req.body;

      // Validate required parameters
      if (!documentId) {
        res.status(400).json({
          success: false,
          message: 'Document ID is required in URL parameters'
        });
        return;
      }

      if (!user_id || !vendor_id) {
        res.status(400).json({
          success: false,
          message: 'user_id and vendor_id are required in request body'
        });
        return;
      }

      // Validate documentId is a valid number
      const documentIdNum = parseInt(documentId);
      if (isNaN(documentIdNum) || documentIdNum <= 0) {
        res.status(400).json({
          success: false,
          message: 'Invalid document ID. Must be a positive number'
        });
        return;
      }

      // Validate user_id and vendor_id are valid numbers
      const userIdNum = parseInt(user_id);
      const vendorIdNum = parseInt(vendor_id);
      
      if (isNaN(userIdNum) || userIdNum <= 0) {
        res.status(400).json({
          success: false,
          message: 'Invalid user_id. Must be a positive number'
        });
        return;
      }

      if (isNaN(vendorIdNum) || vendorIdNum <= 0) {
        res.status(400).json({
          success: false,
          message: 'Invalid vendor_id. Must be a positive number'
        });
        return;
      }

      // Call service
      const result = await this.paymentUploadService.softDeleteDocument(
        documentIdNum,
        userIdNum,
        vendorIdNum
      );

      if (!result.success) {
        // Determine appropriate status code based on error message
        let statusCode = 400;
        
        if (result.message.includes('not found') || 
            result.message.includes('already deleted') ||
            result.message.includes('access denied')) {
          statusCode = 404;
        } else if (result.message.includes('not authorized')) {
          statusCode = 403;
        }

        res.status(statusCode).json({
          success: false,
          message: result.message
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: result.message,
        data: result.document
      });

    } catch (error: any) {
      console.error('[PaymentUploadController] Error soft deleting document:', error);
      
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  };

  // PUT /api/payment-upload/documents/:documentId/restore
  public restoreDocument = async (req: Request, res: Response): Promise<void> => {
    try {
      const { documentId } = req.params;
      const { user_id, vendor_id } = req.body;

      // Validate required parameters
      if (!documentId) {
        res.status(400).json({
          success: false,
          message: 'Document ID is required in URL parameters'
        });
        return;
      }

      if (!user_id || !vendor_id) {
        res.status(400).json({
          success: false,
          message: 'user_id and vendor_id are required in request body'
        });
        return;
      }

      // Validate documentId is a valid number
      const documentIdNum = parseInt(documentId);
      if (isNaN(documentIdNum) || documentIdNum <= 0) {
        res.status(400).json({
          success: false,
          message: 'Invalid document ID. Must be a positive number'
        });
        return;
      }

      // Validate user_id and vendor_id are valid numbers
      const userIdNum = parseInt(user_id);
      const vendorIdNum = parseInt(vendor_id);
      
      if (isNaN(userIdNum) || userIdNum <= 0) {
        res.status(400).json({
          success: false,
          message: 'Invalid user_id. Must be a positive number'
        });
        return;
      }

      if (isNaN(vendorIdNum) || vendorIdNum <= 0) {
        res.status(400).json({
          success: false,
          message: 'Invalid vendor_id. Must be a positive number'
        });
        return;
      }

      // Call service
      const result = await this.paymentUploadService.restoreDocument(
        documentIdNum,
        userIdNum,
        vendorIdNum
      );

      if (!result.success) {
        // Determine appropriate status code based on error message
        let statusCode = 400;
        
        if (result.message.includes('not found') || 
            result.message.includes('not deleted') ||
            result.message.includes('access denied')) {
          statusCode = 404;
        } else if (result.message.includes('not authorized')) {
          statusCode = 403;
        }

        res.status(statusCode).json({
          success: false,
          message: result.message
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: result.message,
        data: result.document
      });

    } catch (error: any) {
      console.error('[PaymentUploadController] Error restoring document:', error);
      
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  };

  // GET /api/payment-upload/documents/deleted
  public getDeletedDocuments = async (req: Request, res: Response): Promise<void> => {
    try {
      const { user_id, vendor_id, page = '1', limit = '10' } = req.query;

      if (!user_id || !vendor_id) {
        res.status(400).json({
          success: false,
          message: 'user_id and vendor_id are required as query parameters'
        });
        return;
      }

      // Validate user_id and vendor_id are valid numbers
      const userIdNum = parseInt(user_id as string);
      const vendorIdNum = parseInt(vendor_id as string);
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      
      if (isNaN(userIdNum) || userIdNum <= 0) {
        res.status(400).json({
          success: false,
          message: 'Invalid user_id. Must be a positive number'
        });
        return;
      }

      if (isNaN(vendorIdNum) || vendorIdNum <= 0) {
        res.status(400).json({
          success: false,
          message: 'Invalid vendor_id. Must be a positive number'
        });
        return;
      }

      if (isNaN(pageNum) || pageNum <= 0) {
        res.status(400).json({
          success: false,
          message: 'Invalid page number. Must be a positive number'
        });
        return;
      }

      if (isNaN(limitNum) || limitNum <= 0 || limitNum > 100) {
        res.status(400).json({
          success: false,
          message: 'Invalid limit. Must be between 1 and 100'
        });
        return;
      }

      // Call service
      const result = await this.paymentUploadService.getDeletedDocuments(
        vendorIdNum,
        userIdNum,
        pageNum,
        limitNum
      );

      res.status(200).json({
        success: true,
        message: 'Deleted documents retrieved successfully',
        data: result.data,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(result.total / limitNum),
          totalRecords: result.total,
          hasNext: pageNum < Math.ceil(result.total / limitNum),
          hasPrev: pageNum > 1
        }
      });

    } catch (error: any) {
      console.error('[PaymentUploadController] Error getting deleted documents:', error);
      
      let statusCode = 500;
      let message = 'Internal server error';

      if (error.message.includes('not authorized') || error.message.includes('not found')) {
        statusCode = 403;
        message = 'Access denied or user not found';
      }

      res.status(statusCode).json({
        success: false,
        message: message,
        error: error.message
      });
    }
  };

  // GET /api/payment-upload/:paymentId
  public getPaymentUploadById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { paymentId } = req.params;
      const { vendor_id } = req.query;

      if (!paymentId || !vendor_id) {
        res.status(400).json({
          success: false,
          message: 'paymentId and vendor_id are required'
        });
        return;
      }

      // Validate paymentId is a valid number
      const paymentIdNum = parseInt(paymentId);
      if (isNaN(paymentIdNum)) {
        res.status(400).json({
          success: false,
          message: 'Invalid payment ID'
        });
        return;
      }

      const result = await this.paymentUploadService.getPaymentUploadById(
        paymentIdNum,
        parseInt(vendor_id as string)
      );

      res.status(200).json({
        success: true,
        message: 'Payment upload retrieved successfully',
        data: result
      });

    } catch (error: any) {
      console.error('[PaymentUploadController] Error getting payment by ID:', error);
      
      let statusCode = 500;
      let message = 'Internal server error';

      if (error.message.includes('not found') || error.message.includes('access denied')) {
        statusCode = 404;
        message = 'Payment not found or access denied';
      }

      res.status(statusCode).json({
        success: false,
        message: message,
        error: error.message
      });
    }
  };
}