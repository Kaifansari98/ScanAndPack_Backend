import { Router } from "express";
import multer from "multer";
import { verifyToken } from "../../middlewares/auth.middleware";
import {
  createComplaintController,
  listComplaintsController,
  updateComplaintStatusController,
  getComplaintAttachmentController,
} from "../../controllers/complaints/complaint.controller";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
}).single("attachment");

router.use(verifyToken);

router.post("/", (req, res, next) => {
  upload(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.code === "LIMIT_FILE_SIZE" ? "File must be 5 MB or smaller." : "File upload error.",
      });
    }
    next();
  });
}, createComplaintController);

router.get("/", listComplaintsController);
router.patch("/:id/status", updateComplaintStatusController);
router.get("/:id/attachment", getComplaintAttachmentController);

export default router;

