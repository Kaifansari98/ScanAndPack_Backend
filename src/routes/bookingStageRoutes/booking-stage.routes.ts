import { Router } from "express";
import {
  uploadBookingStageFiles,
  uploadCSPBookingFiles,
} from "../../middlewares/uploadWasabi";
import { BookingStageController } from "../../controllers/leadModuleControllers/bookingStage/bookingStage.controller";
import { handleMulterUpload } from "../../middlewares/handleMulterUpload";

const bookingStageController = new BookingStageController();
const bookingStageRouter = Router();

bookingStageRouter.post(
  "/onboard",
  handleMulterUpload(
    uploadBookingStageFiles.fields([
      { name: "final_documents" },
      { name: "booking_payment_file" },
    ])
  ),
  bookingStageController.createBookingStage,
);

bookingStageRouter.post(
  "/add-more-files",
  handleMulterUpload(
    uploadBookingStageFiles.fields([{ name: "final_documents" }])
  ),
  bookingStageController.addBookingStageFiles,
);

bookingStageRouter.get(
  "/vendor/:vendorId/lead/:leadId",
  bookingStageController.getBookingStage,
);

// GET /api/leads/status-4
bookingStageRouter.get(
  "/status4-leads/:vendorId",
  bookingStageController.getBookingLeads,
);

bookingStageRouter.get(
  "/vendorId/:vendorId/all-leads",
  bookingStageController.getVendorLeadsByTag, // can now accept ?tag=Type1&userId=123
);

// Example: GET /api/leads/status1-leads/:vendorId?userId=123
bookingStageRouter.get(
  "/status1-leads/vendorId/:vendorId",
  bookingStageController.getOpenLeads,
);

bookingStageRouter.get(
  "/universal-table-data/vendorId/:vendorId",
  bookingStageController.getUniversalTableData,
);

// post filter route route

bookingStageRouter.post(
  "/universal-table-data-2/vendorId/:vendorId",
  bookingStageController.getUniversalTableData2,
);

bookingStageRouter.post(
  "/draft-lead-table-data/vendorId/:vendorId",
  bookingStageController.getDraftLeadTableData,
);

bookingStageRouter.post(
  "/vendorId/:vendorId/vendor-leads-by-tag/all-leads",
  bookingStageController.getVendorLeadsByTag2,
);

bookingStageRouter.put("/edit", bookingStageController.editBookingStage);

bookingStageRouter.put(
  "/reassign-site-supervisor/vendor/:vendorId/lead/:leadId",
  bookingStageController.reassignSiteSupervisor,
);

bookingStageRouter.put(
  "/update-mrp/vendor/:vendorId/lead/:leadId",
  bookingStageController.updateMrpValue,
);

bookingStageRouter.put(
  "/update-total-project-amount/vendor/:vendorId/lead/:leadId",
  bookingStageController.updateTotalProjectAmount,
);

bookingStageRouter.put(
  "/update-booking-amount/vendor/:vendorId/lead/:leadId",
  bookingStageController.updateBookingAmount,
);

bookingStageRouter.put(
  "/update-basic-amount/vendor/:vendorId/lead/:leadId",
  bookingStageController.updateBasicAmount,
);

bookingStageRouter.post(
  "/add-additional-payment",
  handleMulterUpload(
    uploadBookingStageFiles.fields([{ name: "payment_file" }])
  ),
  bookingStageController.addPayment,
);

bookingStageRouter.get(
  "/payment-records/leadId/:leadId/payments",
  bookingStageController.getPayments,
);

bookingStageRouter.get(
  "/billing-information/vendor/:vendorId/lead/:leadId",
  bookingStageController.getLeadBillingAddresses,
);

bookingStageRouter.put(
  "/billing-information/vendor/:vendorId/lead/:leadId",
  bookingStageController.upsertLeadBillingAddresses,
);

const uploadFinalMeasurement = uploadCSPBookingFiles.fields([
  { name: "current_site_photos" },
]);

bookingStageRouter.post(
  "/upload-CSP-booking",
  handleMulterUpload(uploadFinalMeasurement),
  bookingStageController.uploadCSPBooking,
);

bookingStageRouter.get(
  "/get-CSP-booking/:vendorId/:leadId",
  bookingStageController.getCSPBooking,
);

bookingStageRouter.post(
  "/leadId/:leadId/tasks/assign-booking",
  bookingStageController.assignTaskBooking,
);

export default bookingStageRouter;
