import { Router } from "express";
import multer from "multer";
import { BookingStageController } from "../../controllers/leadModuleControllers/bookingStage/bookingStage.controller";
import { handleMulterError } from "../../middlewares/initial-site-measurement.middleware"

const upload = multer();
const bookingStageController = new BookingStageController();
const bookingStageRouter = Router();

const storage = multer.memoryStorage();

bookingStageRouter.post(
  "/onboard",
  upload.fields([
    { name: "final_documents", maxCount: 10 },
    { name: "booking_payment_file", maxCount: 1 },
  ]),
  bookingStageController.createBookingStage
);

bookingStageRouter.post(
  "/add-more-files",
  upload.fields([{ name: "final_documents", maxCount: 10 }]),
  bookingStageController.addBookingStageFiles
);

bookingStageRouter.get(
  "/vendor/:vendorId/lead/:leadId",
  bookingStageController.getBookingStage
);

// GET /api/leads/status-4
bookingStageRouter.get(
  "/status4-leads/:vendorId",
  bookingStageController.getBookingLeads
);

bookingStageRouter.get(
  "/vendorId/:vendorId/all-leads",
  bookingStageController.getVendorLeadsByTag // can now accept ?tag=Type1&userId=123
);

// Example: GET /api/leads/status1-leads/:vendorId?userId=123
bookingStageRouter.get(
  "/status1-leads/vendorId/:vendorId",
  bookingStageController.getOpenLeads
);

bookingStageRouter.get(
  "/universal-table-data/vendorId/:vendorId",
  bookingStageController.getUniversalTableData
);

bookingStageRouter.put("/edit", bookingStageController.editBookingStage);

bookingStageRouter.post(
  "/add-additional-payment",
  upload.fields([{ name: "payment_file", maxCount: 1 }]),
  bookingStageController.addPayment
);

bookingStageRouter.get(
  "/payment-records/leadId/:leadId/payments",
  bookingStageController.getPayments
);

const uploadCSPBooking = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

const uploadFinalMeasurement = uploadCSPBooking.fields([
  { name: "current_site_photos", maxCount: 10 },
]);

bookingStageRouter.post(
  "/upload-CSP-booking",
  uploadFinalMeasurement,
  handleMulterError,
  bookingStageController.uploadCSPBooking
);

bookingStageRouter.get(
  "/get-CSP-booking/:vendorId/:leadId",
  bookingStageController.getCSPBooking
);

export default bookingStageRouter;
