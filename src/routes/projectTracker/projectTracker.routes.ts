import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { verifyToken } from "../../middlewares/auth.middleware";
import logger from "../../utils/logger";
import { TrackerError } from "../../services/projectTracker/projectTracker.core";
import {
  decideRevision,
  getStaffTracker,
  pendingRevisions,
  publishUpdate,
  requestRevision,
  setExpectedDate,
  setRemark,
  setStageStatus,
  TRACKER_MAX_FILES,
  TRACKER_MAX_FILE_SIZE,
  TrackerActor,
} from "../../services/projectTracker/projectTracker.service";

// CRM endpoints for the Client Project Tracker (/api/project-tracker).

const router = Router();
router.use(verifyToken);

const id = (value: unknown) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new TrackerError("A positive integer ID is required.");
  return n;
};

function actor(req: Request): TrackerActor {
  const user = (req as any).user;
  const vendorId = id(req.params.vendorId);
  if (Number(user?.vendor_id) !== vendorId) throw new TrackerError("Vendor access denied.", 403);
  return { vendorId, userId: id(user?.id), role: String(user?.user_type ?? "").trim().toLowerCase() };
}

const body = (req: Request): Record<string, unknown> => {
  // Multipart requests carry their JSON fields in "data".
  if (typeof req.body?.data === "string") {
    try {
      return JSON.parse(req.body.data);
    } catch {
      throw new TrackerError("Invalid update details.");
    }
  }
  return req.body ?? {};
};

const handle = (fn: (req: Request) => Promise<unknown>) => async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await fn(req) });
  } catch (error) {
    if (error instanceof TrackerError)
      return res.status(error.statusCode).json({ success: false, message: error.message });
    logger.error("[project-tracker]", error);
    res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
  }
};

const files = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TRACKER_MAX_FILE_SIZE, files: TRACKER_MAX_FILES, fields: 1 },
}).fields([{ name: "files", maxCount: TRACKER_MAX_FILES }]);
const upload = (req: Request, res: Response, next: NextFunction) =>
  files(req, res, (error) => (error ? res.status(400).json({ success: false, message: error.message }) : next()));

const lead = "/vendor/:vendorId/leads/:leadId";
router.get(lead, handle((req) => getStaffTracker(actor(req), id(req.params.leadId))));
router.post(`${lead}/stages/:stage/status`, handle((req) => setStageStatus(actor(req), id(req.params.leadId), req.params.stage, body(req))));
router.post(`${lead}/stages/:stage/expected-date`, handle((req) => setExpectedDate(actor(req), id(req.params.leadId), req.params.stage, body(req))));
router.post(`${lead}/stages/:stage/revisions`, handle((req) => requestRevision(actor(req), id(req.params.leadId), req.params.stage, body(req))));
router.post(`${lead}/stages/:stage/remark`, handle((req) => setRemark(actor(req), id(req.params.leadId), req.params.stage, body(req))));
router.post(
  `${lead}/updates`,
  upload,
  handle((req) =>
    publishUpdate(actor(req), id(req.params.leadId), body(req), ((req.files as Record<string, Express.Multer.File[]>)?.files ?? [])),
  ),
);
router.get("/vendor/:vendorId/revisions", handle((req) => pendingRevisions(actor(req))));
router.post("/vendor/:vendorId/revisions/:revisionId/decision", handle((req) => decideRevision(actor(req), id(req.params.revisionId), body(req))));

export default router;
