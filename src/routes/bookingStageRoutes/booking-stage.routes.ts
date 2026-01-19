import { Router } from "express";
import {
  uploadBookingStageFiles,
  uploadCSPBookingFiles,
} from "../../middlewares/uploadWasabi";
import { BookingStageController } from "../../controllers/leadModuleControllers/bookingStage/bookingStage.controller";

const bookingStageController = new BookingStageController();
const bookingStageRouter = Router();

bookingStageRouter.post(
  "/onboard",
  uploadBookingStageFiles.fields([
    { name: "final_documents", maxCount: 10 },
    { name: "booking_payment_file", maxCount: 1 },
  ]),
  bookingStageController.createBookingStage
);

bookingStageRouter.post(
  "/add-more-files",
  uploadBookingStageFiles.fields([{ name: "final_documents", maxCount: 10 }]),
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
bookingStageRouter.post(
  "/universal-table-data-2/vendorId/:vendorId",
  bookingStageController.getUniversalTableData2
);

bookingStageRouter.put("/edit", bookingStageController.editBookingStage);

bookingStageRouter.put(
  "/reassign-site-supervisor/vendor/:vendorId/lead/:leadId",
  bookingStageController.reassignSiteSupervisor
);

bookingStageRouter.put(
  "/update-mrp/vendor/:vendorId/lead/:leadId",
  bookingStageController.updateMrpValue
);

bookingStageRouter.put(
  "/update-total-project-amount/vendor/:vendorId/lead/:leadId",
  bookingStageController.updateTotalProjectAmount
);

bookingStageRouter.put(
  "/update-booking-amount/vendor/:vendorId/lead/:leadId",
  bookingStageController.updateBookingAmount
);

bookingStageRouter.post(
  "/add-additional-payment",
  uploadBookingStageFiles.fields([{ name: "payment_file", maxCount: 1 }]),
  bookingStageController.addPayment
);

bookingStageRouter.get(
  "/payment-records/leadId/:leadId/payments",
  bookingStageController.getPayments
);

const uploadFinalMeasurement = uploadCSPBookingFiles.fields([
  { name: "current_site_photos", maxCount: 10 },
]);

bookingStageRouter.post(
  "/upload-CSP-booking",
  uploadFinalMeasurement,
  bookingStageController.uploadCSPBooking
);

bookingStageRouter.get(
  "/get-CSP-booking/:vendorId/:leadId",
  bookingStageController.getCSPBooking
);

export default bookingStageRouter;
