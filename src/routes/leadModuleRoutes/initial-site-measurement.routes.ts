import { Router } from 'express';
import multer from 'multer';
import { PaymentUploadController } from '../../controllers/leadModuleControllers/leadsGeneration/initial-site_measurement.controller';
import { validatePaymentUpload, handleMulterError, validateFiles, validateGetRequest, validatePaginationRequest, handleGetErrors } from '../../middlewares/initial-site-measurement.middleware';

const router = Router();
const paymentUploadController = new PaymentUploadController();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per file
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF and image files are allowed.'));
    }
  }
});

// Define the fields for multer
const uploadFields = upload.fields([
  { name: 'current_site_photos', maxCount: 10 }, // Allow up to 10 site photos
  { name: 'upload_pdf', maxCount: 1 },           // Only 1 PDF file
  { name: 'payment_image', maxCount: 1 }         // Only 1 payment image
]);

/**
 * POST /api/payment-upload
 * 
 * Form fields expected:
 * - lead_id (required): number
 * - account_id (required): number  
 * - vendor_id (required): number
 * - created_by (required): number
 * - client_id (required): number
 * - amount (optional): number - if provided, payment_date becomes required
 * - payment_date (optional/conditional): string (ISO date) - required if amount is provided
 * - payment_text (optional/conditional): string - required if payment_image is uploaded
 * 
 * File fields expected:
 * - current_site_photos (optional): multiple image files (JPEG, JPG, PNG, GIF) - doc_type_id = 1
 * - upload_pdf (required): single PDF file - doc_type_id = 3
 * - payment_image (optional): single image file - if uploaded, payment_text becomes required
 */
router.post('/payment-upload', 
  uploadFields,
  handleMulterError,
  validatePaymentUpload,
  validateFiles,
  paymentUploadController.createPaymentUpload
);

/**
 * GET /api/payment-upload/lead/:leadId
 * Get all payment uploads for a specific lead
 * Query params: vendor_id (required)
 */
router.get('/initial-site-measurement/:leadId', 
    validateGetRequest,
    paymentUploadController.getPaymentUploadsByLead
);
  
/**
 * GET /api/payment-upload/account/:accountId  
 * Get all payment uploads for a specific account
 * Query params: vendor_id (required)
 */
router.get('/account/:accountId',
    validateGetRequest, 
    paymentUploadController.getPaymentUploadsByAccount
);
  
  /**
   * GET /api/payment-upload/:id
   * Get a specific payment upload by ID
   * Query params: vendor_id (required)
   */
  router.get('/:id',
    validateGetRequest,
    paymentUploadController.getPaymentUploadById
  );
  
    /**
     * GET /api/payment-upload/vendor/:vendorId
     * Get all payment uploads for a vendor with pagination
     * Query params: 
     * - page (optional, default: 1)
     * - limit (optional, default: 10) 
     * - startDate (optional, ISO date string)
     * - endDate (optional, ISO date string)
     */
    router.get('/vendor/:vendorId',
    validatePaginationRequest,
    paymentUploadController.getPaymentUploadsByVendor
    );
  
  /**
   * GET /api/payment-upload/documents/:documentId/download
   * Get download URL for a specific document
   * Query params: vendor_id (required)
   */
  router.get('/documents/:documentId/download',
    validateGetRequest,
    paymentUploadController.downloadDocument
  );
  
  /**
   * GET /api/payment-upload/analytics/:vendorId
   * Get payment analytics for a vendor
   * Query params:
   * - startDate (optional, ISO date string)
   * - endDate (optional, ISO date string)  
   */
  router.get('/analytics/:vendorId',
    validatePaginationRequest,
    paymentUploadController.getPaymentAnalytics
  );
  
  // Error handling middleware
  router.use(handleGetErrors);

  // Get first 10 leads with status_id == 2 for vendor 123
  // GET /api/leads/vendor/123/status/2
  // Get page 2 with 20 records per page
  // GET /api/leads/vendor/123/status/2?page=2&limit=20
  router.get('/vendor/:vendorId/status/2', paymentUploadController.getLeadsByStatus);

export { router as paymentUploadRoutes };