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
}