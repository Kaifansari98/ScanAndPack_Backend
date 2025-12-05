import { Router } from "express";
import multer from "multer";
import { BookingStageController } from "../../controllers/leadModuleControllers/bookingStage/bookingStage.controller";

const upload = multer();
const bookingStageController = new BookingStageController();
const bookingStageRouter = Router();

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

export default bookingStageRouter;
