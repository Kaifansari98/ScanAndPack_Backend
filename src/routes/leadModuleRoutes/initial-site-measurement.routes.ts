import { Router } from 'express';
import multer from 'multer';
import { PaymentUploadController } from '../../controllers/leadModuleControllers/leadsGeneration/initial-site_measurement.controller';
import { validatePaymentUpload, handleMulterError, validateFiles } from '../../middlewares/initial-site-measurement.middleware';

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

export { router as paymentUploadRoutes };