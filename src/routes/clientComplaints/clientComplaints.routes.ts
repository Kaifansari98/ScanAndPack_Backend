import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { verifyToken } from "../../middlewares/auth.middleware";
import * as controller from "../../controllers/clientComplaints/clientComplaints.controller";
import {
  COMPLAINT_MAX_PHOTOS,
  COMPLAINT_MAX_PHOTO_SIZE,
  COMPLAINT_MAX_VIDEOS,
  COMPLAINT_MAX_VIDEO_SIZE,
} from "../../services/clientComplaints/clientComplaints.service";

const router = Router();
router.use(verifyToken);
router.use("/vendor/:vendorId", controller.checkComplaintAccess);
router.get("/vendor/:vendorId/meta", controller.getMeta);
router.put("/vendor/:vendorId/settings", controller.updateSettings);
router.get("/vendor/:vendorId/lead-lookup", controller.lookupLead);
router.get("/vendor/:vendorId/lead-options", controller.leadOptions);
router.get("/vendor/:vendorId/lead-franchises", controller.leadFranchises);
router.get("/vendor/:vendorId/duplicates", controller.getDuplicates);
router.get("/vendor/:vendorId/complaints", controller.list);
router.get("/vendor/:vendorId/complaints/:complaintId", controller.detail);
router.get("/vendor/:vendorId/complaints/:complaintId/activity", controller.activity);
router.get("/vendor/:vendorId/complaints/:complaintId/assignee-options", controller.assigneeOptions);
router.post("/vendor/:vendorId/complaints/:complaintId/verification/start", controller.startReview);
router.post("/vendor/:vendorId/complaints/:complaintId/verification/resume", controller.resumeReview);
router.post("/vendor/:vendorId/complaints/:complaintId/verification/decision", controller.decide);
router.post("/vendor/:vendorId/complaints/:complaintId/priority", controller.setPriority);
router.post("/vendor/:vendorId/complaints/:complaintId/reassign", controller.reassign);
router.post("/vendor/:vendorId/complaints/:complaintId/visits", controller.newVisit);
router.post("/vendor/:vendorId/complaints/:complaintId/visits/:visitId/action", controller.visitAction);
router.post("/vendor/:vendorId/complaints/:complaintId/payments/:paymentId/review", controller.paymentReview);
router.post("/vendor/:vendorId/complaints/:complaintId/warranty", controller.warranty);
router.post("/vendor/:vendorId/complaints/:complaintId/cancel", controller.cancel);
router.post("/vendor/:vendorId/complaints/:complaintId/inspection-decision", controller.inspectionDecision);
router.post("/vendor/:vendorId/complaints/:complaintId/quotations", controller.quotation);
router.post("/vendor/:vendorId/complaints/:complaintId/quotations/:quotationId/action", controller.quotationAction);
router.post("/vendor/:vendorId/complaints/:complaintId/charges/:chargeId/waive", controller.repairWaiver);
router.post("/vendor/:vendorId/complaints/:complaintId/executions/:executionId/action", controller.executionAction);
router.post("/vendor/:vendorId/complaints/:complaintId/closure/no-response", controller.noResponseClosure);
router.post("/vendor/:vendorId/complaints/:complaintId/closure/approve", controller.closure);

// Per-type size and format checks happen in the service; multer only caps the request.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: COMPLAINT_MAX_VIDEO_SIZE,
    files: COMPLAINT_MAX_PHOTOS + COMPLAINT_MAX_VIDEOS,
    fields: 1,
  },
}).fields([
  { name: "photos", maxCount: COMPLAINT_MAX_PHOTOS },
  { name: "videos", maxCount: COMPLAINT_MAX_VIDEOS },
]);
router.post(
  "/vendor/:vendorId/complaints",
  (req, res, next) => {
    upload(req, res, (error) => {
      if (error)
        return res.status(400).json({ success: false, message: error.message });
      next();
    });
  },
  controller.create,
);

const infoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: COMPLAINT_MAX_VIDEO_SIZE, files: 10, fields: 1 },
}).fields([{ name: "files", maxCount: 10 }]);
router.post(
  "/vendor/:vendorId/complaints/:complaintId/verification/information-received",
  (req, res, next) => {
    infoUpload(req, res, (error) => {
      if (error)
        return res.status(400).json({ success: false, message: error.message });
      next();
    });
  },
  controller.informationReceived,
);

const proofUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: COMPLAINT_MAX_PHOTO_SIZE, files: 1, fields: 1 },
}).fields([{ name: "proof", maxCount: 1 }]);
router.post(
  "/vendor/:vendorId/complaints/:complaintId/visits/:visitId/payments",
  (req, res, next) => {
    proofUpload(req, res, (error) => {
      if (error)
        return res.status(400).json({ success: false, message: error.message });
      next();
    });
  },
  controller.visitPayment,
);


// Multipart workflow steps: JSON fields in "data", files in the named parts.
const multipartRoute = (fields: { name: string; maxCount: number }[], fileSize = COMPLAINT_MAX_VIDEO_SIZE) => {
  const parse = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize, files: fields.reduce((n, f) => n + f.maxCount, 0), fields: 1 },
  }).fields(fields);
  return (req: Request, res: Response, next: NextFunction) =>
    parse(req, res, (error) => {
      if (error) return res.status(400).json({ success: false, message: error.message });
      next();
    });
};
router.post(
  "/vendor/:vendorId/complaints/:complaintId/inspections",
  multipartRoute([
    { name: "photos", maxCount: 15 },
    { name: "videos", maxCount: 5 },
    { name: "documents", maxCount: 5 },
  ]),
  controller.inspection,
);
router.post(
  "/vendor/:vendorId/complaints/:complaintId/charges/:chargeId/payments",
  multipartRoute([{ name: "proof", maxCount: 1 }], COMPLAINT_MAX_PHOTO_SIZE),
  controller.repairPayment,
);
router.post(
  "/vendor/:vendorId/complaints/:complaintId/executions/:executionId/complete",
  multipartRoute([
    { name: "before", maxCount: 10 },
    { name: "after", maxCount: 10 },
  ]),
  controller.executionComplete,
);
router.post(
  "/vendor/:vendorId/complaints/:complaintId/closure/client-confirmation",
  multipartRoute([{ name: "photos", maxCount: 10 }]),
  controller.clientConfirmation,
);

export default router;
