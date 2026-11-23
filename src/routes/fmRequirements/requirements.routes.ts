import { Router } from "express";
import multer from "multer";
import { verifyToken } from "../../middlewares/auth.middleware";
import * as controller from "../../controllers/fmRequirements/requirements.controller";
import {
  DOCUMENT_TYPES,
  FM_MAX_FILE_SIZE,
} from "../../services/fmRequirements/schema";
const router = Router();
router.use(verifyToken);
router.use("/vendor/:vendorId", controller.checkFMAccess);
router.get("/vendor/:vendorId/questions", controller.getQuestions);
router.put(
  "/vendor/:vendorId/product-type/:productTypeId/questions",
  controller.putQuestions,
);
router.delete(
  "/vendor/:vendorId/product-type/:productTypeId/questions",
  controller.clearQuestions,
);
router.get("/vendor/:vendorId/lead/:leadId", controller.getLead);
router.patch(
  "/vendor/:vendorId/lead/:leadId/product-type/:productTypeId/answers",
  controller.updateAnswers,
);
router.put("/vendor/:vendorId/lead/:leadId/draft", controller.saveDraft);
router.post("/vendor/:vendorId/lead/:leadId/submit", controller.submit);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: FM_MAX_FILE_SIZE, files: 1, fields: 0 },
  fileFilter: (_req, file, cb) => {
    if (!DOCUMENT_TYPES.includes(file.mimetype))
      return cb(new Error("Unsupported file format."));
    cb(null, true);
  },
}).single("file");
router.post(
  "/vendor/:vendorId/lead/:leadId/uploads",
  (req, res, next) => {
    upload(req, res, (error) => {
      if (error)
        return res.status(400).json({ success: false, message: error.message });
      next();
    });
  },
  controller.upload,
);
export default router;
