import { Request, Response } from 'express';
import { PaymentUploadService } from '../../../services/leadModuleServices/leadsGeneration/initial-site_measurement.service';
import { CreatePaymentUploadDto } from '../../../types/leadModule.types';

export class PaymentUploadController {
  private paymentUploadService: PaymentUploadService;

  constructor() {
    this.paymentUploadService = new PaymentUploadService();
  }

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
        paymentImageFile
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

  // GET /api/payment-upload/:id
  public getPaymentUploadById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { vendor_id } = req.query;

      if (!id || !vendor_id) {
        res.status(400).json({
          success: false,
          message: 'id and vendor_id are required'
        });
        return;
      }

      const result = await this.paymentUploadService.getPaymentUploadById(
        parseInt(id),
        parseInt(vendor_id as string)
      );

      if (!result) {
        res.status(404).json({
          success: false,
          message: 'Payment upload not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Payment upload retrieved successfully',
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
}