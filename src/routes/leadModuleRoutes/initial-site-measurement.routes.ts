import { Router } from "express";
import multer from "multer";
import path from "path";
import { PaymentUploadController } from "../../controllers/leadModuleControllers/leadsGeneration/initial-site_measurement.controller";
import {
  validatePaymentUpload,
  validateFiles,
  validateGetRequest,
  validatePaginationRequest,
  handleGetErrors,
} from "../../middlewares/initial-site-measurement.middleware";
import { uploadInitialSiteMeasurement } from "../../utils/wasabiClient";
import { handleMulterUpload } from "../../middlewares/handleMulterUpload";

const router = Router();
const paymentUploadController = new PaymentUploadController();

// Configure memory storage for legacy endpoints
const memoryStorage = multer.memoryStorage();
const memoryUpload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per file
  },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === "upload_pdf") {
      cb(null, true);
      return;
    }

    const isImage = file.mimetype.startsWith("image/");
    const ext = path.extname(file.originalname || "").toLowerCase();
    const imageExtensions = [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
      ".bmp",
      ".tif",
      ".tiff",
      ".heic",
      ".heif",
      ".avif",
      ".svg",
      ".jfif",
    ];

    if (isImage || imageExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only image files are allowed for this field."));
    }
  },
});

const diskUploadFields = uploadInitialSiteMeasurement.fields([
  { name: "current_site_photos", maxCount: 10 },
  { name: "upload_pdf", maxCount: 10 },
  { name: "payment_image", maxCount: 1 },
]);

const memoryUploadFields = memoryUpload.fields([
  { name: "current_site_photos", maxCount: 10 }, // Allow up to 10 site photos
  { name: "upload_pdf", maxCount: 10 }, // Allow multiple measurement documents
  { name: "payment_image", maxCount: 1 }, // Only 1 payment image
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
 * - upload_pdf (required): one or more files of any type - doc_type_id = 3
 * - payment_image (optional): single image file - if uploaded, payment_text becomes required
 */
router.post(
  "/payment-upload",
  handleMulterUpload(diskUploadFields),
  validatePaymentUpload,
  validateFiles,
  paymentUploadController.createPaymentUpload
);

router.post(
  "/booking-done-ism/upload",
  handleMulterUpload(diskUploadFields),
  validatePaymentUpload,
  validateFiles,
  paymentUploadController.createBookingDoneIsmUpload
);

// routes/booking-done-ism.routes.ts
router.get(
  "/booking-done-ism/:leadId",
  paymentUploadController.getBookingDoneIsmDetails
);


/**
 * GET /api/payment-upload/lead/:leadId
 * Get all payment uploads for a specific lead
 * Query params: vendor_id (required)
 */
router.get(
  "/initial-site-measurement/:leadId",
  validateGetRequest,
  paymentUploadController.getPaymentUploadsByLead
);

/**
 * GET /api/payment-upload/account/:accountId
 * Get all payment uploads for a specific account
 * Query params: vendor_id (required)
 */
router.get(
  "/account/:accountId",
  validateGetRequest,
  paymentUploadController.getPaymentUploadsByAccount
);

/**
 * GET /api/payment-upload/:id
 * Get a specific payment upload by ID
 * Query params: vendor_id (required)
 */
router.get(
  "/:id",
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
router.get(
  "/vendor/:vendorId",
  validatePaginationRequest,
  paymentUploadController.getPaymentUploadsByVendor
);

/**
 * GET /api/payment-upload/documents/:documentId/download
 * Get download URL for a specific document
 * Query params: vendor_id (required)
 */
router.get(
  "/documents/:documentId/download",
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
router.get(
  "/analytics/:vendorId",
  validatePaginationRequest,
  paymentUploadController.getPaymentAnalytics
);

// Error handling middleware
router.use(handleGetErrors);

// Get first 10 leads with status_id == 2 for vendor 123
// GET /api/leads/vendor/123/status/2
// Get page 2 with 20 records per page
// GET /api/leads/vendor/123/status/2?page=2&limit=20
router.get(
  "/vendor/:vendorId/initial-site-measurement",
  paymentUploadController.getLeadsByStatus
);

/**
 * GET /api/payment-upload/documents/signed-url/:s3Key
 * Generate signed URL for a specific document
 * Query params:
 * - vendor_id (required)
 * - expires_in (optional, default: 3600 seconds)
 *
 * Example: GET /api/payment-upload/documents/signed-url/initial_site_measurement_documents%2F1%2F14%2F1756788920552-Dummy_PDF__1_.pdf?vendor_id=1
 */
router.get(
  "/documents/signed-url/:s3Key",
  validateGetRequest,
  paymentUploadController.generateSignedUrl
);

/**
 * POST /api/payment-upload/documents/batch-signed-urls
 * Generate signed URLs for multiple documents
 * Body:
 * {
 *   "documents": ["s3key1", "s3key2"] or [{"s3Key": "s3key1"}, {"s3Key": "s3key2"}],
 *   "vendor_id": 1,
 *   "expires_in": 3600 (optional)
 * }
 */
router.post(
  "/documents/batch-signed-urls",
  validateGetRequest, // Reuse this middleware for vendor_id validation
  paymentUploadController.generateBatchSignedUrls
);

router.put(
  "/:paymentId",
  handleMulterUpload(
    memoryUpload.fields([
      { name: "current_site_photos" },
      { name: "payment_detail_photos" },
    ])
  ),
  paymentUploadController.updatePaymentUpload
);

router.put(
  "/documents/:documentId/replace-pdf",
  handleMulterUpload(
    memoryUpload.fields([{ name: "upload_pdf" }])
  ),
  paymentUploadController.replacePdfDocument
);

// Soft delete document
router.put(
  "/documents/:documentId/delete",
  paymentUploadController.softDeleteDocument
);

// Restore document (bonus functionality)
router.put(
  "/documents/:documentId/restore",
  paymentUploadController.restoreDocument
);

// Get deleted documents (admin/audit functionality)
router.get("/documents/deleted", paymentUploadController.getDeletedDocuments);

router.post(
  "/leadId/:leadId/tasks/assign-ism",
  paymentUploadController.assignTaskISM
);

router.get(
  "/leadId/:leadId/task-conflicts",
  paymentUploadController.getTaskConflicts
);

// GET ISM details by leadId
router.get("/leadId/:leadId", paymentUploadController.getISMDetailsByLeadId);

// GET only payment info by leadId
router.get(
  "/leadId/:leadId/payment-info",
  paymentUploadController.getISMPaymentInfoByLeadId
);


export { router as paymentUploadRoutes };
