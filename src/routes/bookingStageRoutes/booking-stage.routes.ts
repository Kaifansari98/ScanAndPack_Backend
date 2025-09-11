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
    { name: "booking_payment_file", maxCount: 1 }
  ]),
  bookingStageController.createBookingStage
);

bookingStageRouter.get(
  "/lead/:leadId",
  bookingStageController.getBookingStage
);

// GET /api/leads/status-4
bookingStageRouter.get(
  "/status4-leads/:vendorId",
  bookingStageController.getStatus4Leads
);

export default bookingStageRouter;