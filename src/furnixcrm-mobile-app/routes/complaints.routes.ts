import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import logger from "../../utils/logger";
import { clientFrom, requireClient } from "../middleware/client-auth.middleware";
import { ComplaintError, COMPLAINT_MAX_VIDEO_SIZE } from "../../services/clientComplaints/clientComplaints.service";
import {
  acceptQuotation,
  approveVisitCharges,
  cancelComplaint,
  complaintMeta,
  createComplaint,
  getComplaint,
  giveFeedback,
  listComplaints,
  rejectQuotation,
  replyWithInformation,
  submitPayment,
} from "../services/complaints.service";

// Client app complaints: /furnixcrm-mobile-app/client/complaints

const router = Router();
router.use(requireClient);

const files = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: COMPLAINT_MAX_VIDEO_SIZE, files: 5, fields: 4 },
}).array("files", 5);

const withFiles = (req: Request, res: Response, next: NextFunction) =>
  files(req, res, (error) =>
    error
      ? res.status(400).json({
          success: false,
          message: error.code === "LIMIT_FILE_SIZE" ? "A file is too large (max 50 MB)." : error.message,
        })
      : next(),
  );

/** Multipart requests carry their fields as JSON in "data"; plain JSON otherwise. */
const bodyOf = (req: Request): Record<string, unknown> => {
  if (typeof req.body?.data === "string") {
    try {
      return JSON.parse(req.body.data);
    } catch {
      throw new ComplaintError("Invalid complaint details.");
    }
  }
  return req.body ?? {};
};

const uploads = (req: Request) =>
  ((req.files as Express.Multer.File[] | undefined) ?? []).map((f) => ({
    buffer: f.buffer,
    mimetype: f.mimetype,
    size: f.size,
    originalname: f.originalname,
  }));

const idOf = (req: Request) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ComplaintError("Invalid complaint.");
  return id;
};

const handle =
  (label: string, fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
    try {
      res.json({ success: true, data: await fn(req, res) });
    } catch (error) {
      if (error instanceof ComplaintError)
        return res.status(error.statusCode).json({ success: false, message: error.message });
      logger.error(`[client-complaints] ${label}`, error);
      res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
    }
  };

router.get("/meta", handle("meta", (_req, res) => complaintMeta(clientFrom(res))));
router.get("/", handle("list", (_req, res) => listComplaints(clientFrom(res))));
router.post("/", withFiles, handle("create", (req, res) => createComplaint(clientFrom(res), bodyOf(req), uploads(req))));
router.get("/:id", handle("detail", (req, res) => getComplaint(clientFrom(res), idOf(req))));
router.post("/:id/reply", withFiles, handle("reply", (req, res) => replyWithInformation(clientFrom(res), idOf(req), bodyOf(req), uploads(req))));
router.post("/:id/charges/approve", handle("approve charges", (req, res) => approveVisitCharges(clientFrom(res), idOf(req), bodyOf(req))));
router.post("/:id/payments", withFiles, handle("payment", (req, res) => submitPayment(clientFrom(res), idOf(req), bodyOf(req), uploads(req))));
router.post("/:id/quotation/accept", handle("accept quotation", (req, res) => acceptQuotation(clientFrom(res), idOf(req), bodyOf(req))));
router.post("/:id/quotation/reject", handle("reject quotation", (req, res) => rejectQuotation(clientFrom(res), idOf(req), bodyOf(req))));
router.post("/:id/feedback", handle("feedback", (req, res) => giveFeedback(clientFrom(res), idOf(req), bodyOf(req))));
router.post("/:id/cancel", handle("cancel", (req, res) => cancelComplaint(clientFrom(res), idOf(req), bodyOf(req))));

export default router;
