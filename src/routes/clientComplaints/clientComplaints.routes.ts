import { Router } from "express";
import multer from "multer";
import { verifyToken } from "../../middlewares/auth.middleware";
import * as controller from "../../controllers/clientComplaints/clientComplaints.controller";
import {
  COMPLAINT_MAX_PHOTOS,
  COMPLAINT_MAX_VIDEOS,
  COMPLAINT_MAX_VIDEO_SIZE,
} from "../../services/clientComplaints/clientComplaints.service";

const router = Router();
router.use(verifyToken);
router.use("/vendor/:vendorId", controller.checkComplaintAccess);
router.get("/vendor/:vendorId/meta", controller.getMeta);
router.get("/vendor/:vendorId/lead-lookup", controller.lookupLead);
router.get("/vendor/:vendorId/duplicates", controller.getDuplicates);
router.get("/vendor/:vendorId/complaints", controller.list);

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

export default router;
