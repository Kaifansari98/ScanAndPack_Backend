import { Router } from "express";
import multer from "multer";
import { verifyToken } from "../../middlewares/auth.middleware";
import { checkWalkinVendorAccess, deleteQuestions, getAnswers, getQuestions, patchAnswer, putAnswers, putQuestions, requireWalkinFeature, uploadReference } from "../../controllers/leadModuleControllers/walkinLeadQuestions.controller";
import { allowedMimeTypes, maxFileSize } from "../../services/leadModuleServices/walkinLeadQuestions/validation";

const router = Router();
router.use(verifyToken);
router.use("/vendor/:vendorId", checkWalkinVendorAccess, requireWalkinFeature);
router.get("/vendor/:vendorId/questions", getQuestions);
router.put("/vendor/:vendorId/product-type/:productTypeId/questions", putQuestions);
router.delete("/vendor/:vendorId/product-type/:productTypeId/questions", deleteQuestions);
router.get("/vendor/:vendorId/lead/:leadId/answers", getAnswers);
router.put("/vendor/:vendorId/lead/:leadId/answers", putAnswers);
router.patch("/vendor/:vendorId/lead/:leadId/product-type/:productTypeId/answers/:questionKey", patchAnswer);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxFileSize, files: 1, fields: 0 },
  fileFilter: (_req, file, cb) => {
    if (!allowedMimeTypes.includes(file.mimetype)) return cb(new Error("Only JPEG, PNG, WebP, GIF and PDF files are allowed"));
    cb(null, true);
  },
}).single("file");
router.post("/vendor/:vendorId/uploads", (req, res, next) => {
  upload(req, res, error => {
    if (error) return res.status(400).json({ success: false, message: error.message });
    next();
  });
}, uploadReference);
export default router;
