import { Router } from "express";
import multer from "multer";
import { verifyToken } from "../../middlewares/auth.middleware";
import { leaveContext } from "../../services/leaves/leaves.service";
import { leaveWorkspaceController, leaveHolidayImportController, leaveHolidayDeleteController, leaveWeeklyOffController, leaveRequestsController, leaveCreateController, leaveDecisionController, leaveAttachmentController } from "../../controllers/leaves/leaves.controller";
const routes = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 6, fieldSize: 4000, parts: 8 } }).single("attachment");
routes.use(verifyToken);
// Authorize the account and feature before accepting a multipart body into memory.
routes.use(async (req, res, next) => {
  try { await leaveContext((req as any).user); next(); }
  catch (error: any) { res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : "Could not load leave workspace." }); }
});
routes.get("/workspace", leaveWorkspaceController);
routes.post("/holidays/import", leaveHolidayImportController);
routes.delete("/holidays/:id", leaveHolidayDeleteController);
routes.put("/weekly-offs", leaveWeeklyOffController);
routes.get("/requests", leaveRequestsController);
routes.post("/requests", (req, res, next) => upload(req, res, error => {
  if (error) { res.status(400).json({ success: false, message: error.code === "LIMIT_FILE_SIZE" ? "The attachment must be 5 MB or smaller." : "Upload one attachment with field name attachment and valid request fields." }); return; }
  next();
}), leaveCreateController);
routes.patch("/requests/:id/decision", leaveDecisionController);
routes.get("/requests/:id/attachment", leaveAttachmentController);
export default routes;
