import { NextFunction, Request, Response } from "express";
import {
  ComplaintActor,
  ComplaintError,
  ComplaintUpload,
  canViewComplaints,
  findPossibleDuplicates,
  getComplaintMeta,
  listComplaints,
  lookupLeadForComplaint,
  registerComplaint,
  requireComplaintsVendor,
  updateComplaintSettings,
} from "../../services/clientComplaints/clientComplaints.service";
import logger from "../../utils/logger";
import { getComplaintDetail, getComplaintActivity } from "../../services/clientComplaints/complaintDetails.service";
import { getComplaintLeadOptions, getComplaintLeadFranchises } from "../../services/clientComplaints/complaintLeadPicker.service";
import {
  decideVerification,
  getAssigneeOptions,
  markInformationReceived,
  reassignComplaint,
  resumeVerification,
  setComplaintPriority,
  startVerification,
} from "../../services/clientComplaints/complaintVerification.service";
import {
  createVisit,
  recordVisitPayment,
  runVisitAction,
} from "../../services/clientComplaints/complaintVisit.service";
import {
  recordRepairPayment,
  verifyPayment,
  waiveRepairCharge,
} from "../../services/clientComplaints/complaintPayment.service";
import { afterInspection, setWarranty, submitInspection } from "../../services/clientComplaints/complaintInspection.service";
import { runQuotationAction, saveQuotation } from "../../services/clientComplaints/complaintQuotation.service";
import { completeExecution, runExecutionAction } from "../../services/clientComplaints/complaintExecution.service";
import {
  approveClosure,
  cancelComplaint,
  closeWithoutResponse,
  recordClientConfirmation,
} from "../../services/clientComplaints/complaintClosure.service";

const positiveId = (value: unknown) => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new ComplaintError("A positive integer ID is required.");
  return id;
};

function actor(req: Request): ComplaintActor {
  const user = (req as any).user;
  const vendorId = positiveId(req.params.vendorId);
  if (Number(user?.vendor_id) !== vendorId)
    throw new ComplaintError("Vendor access denied.", 403);
  const role = String(user?.user_type ?? "").trim().toLowerCase();
  return { vendorId, actorId: positiveId(user?.id), role };
}

const handle =
  (fn: (req: Request) => Promise<unknown>) =>
  async (req: Request, res: Response) => {
    try {
      res.json({ success: true, data: await fn(req) });
    } catch (error) {
      const known = error as { statusCode?: number; message?: string; code?: string };
      if (known.statusCode)
        return res.status(known.statusCode).json({ success: false, message: known.message });
      // Two registrations racing for the same Complaint ID.
      if (known.code === "P2002" || known.code === "P2034")
        return res.status(409).json({
          success: false,
          message: "Another complaint was registered at the same time. Please submit again.",
        });
      // Error objects serialise to {} in the JSON log, so log their fields explicitly.
      const err = error as Error & { code?: string; meta?: unknown };
      logger.error("Client complaint request failed", {
        path: req.originalUrl,
        message: err?.message,
        code: err?.code,
        meta: err?.meta,
        stack: err?.stack,
      });
      res.status(500).json({ success: false, message: "Unable to process the complaint request." });
    }
  };

export const checkComplaintAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = actor(req);
    if (!canViewComplaints(user.role))
      throw new ComplaintError("You do not have access to client complaints.", 403);
    await requireComplaintsVendor(user.vendorId);
    next();
  } catch (error) {
    res
      .status((error as ComplaintError).statusCode ?? 500)
      .json({ success: false, message: (error as Error).message });
  }
};

export const getMeta = handle((req) => getComplaintMeta(actor(req)));
export const updateSettings = handle((req) =>
  updateComplaintSettings(actor(req), (req.body ?? {}) as Record<string, unknown>),
);
export const leadOptions = handle((req) => getComplaintLeadOptions(actor(req), req.query as Record<string, unknown>));
export const leadFranchises = handle((req) => getComplaintLeadFranchises(actor(req)));

export const lookupLead = handle((req) => lookupLeadForComplaint(actor(req), req.query.lead_code));

export const getDuplicates = handle(async (req) => {
  const { vendorId } = actor(req);
  const q = req.query;
  return findPossibleDuplicates(vendorId, {
    mobile: typeof q.mobile === "string" ? q.mobile : null,
    name: typeof q.name === "string" ? q.name : null,
    address: typeof q.address === "string" ? q.address : null,
  });
});

export const list = handle((req) => listComplaints(actor(req), req.query as Record<string, unknown>));
export const detail = handle((req) => getComplaintDetail(actor(req), positiveId(req.params.complaintId)));
export const activity = handle((req) => getComplaintActivity(actor(req), positiveId(req.params.complaintId), req.query as Record<string, unknown>));

const complaintId = (req: Request) => positiveId(req.params.complaintId);
const jsonBody = (req: Request) => (req.body ?? {}) as Record<string, unknown>;

export const startReview = handle((req) => startVerification(actor(req), complaintId(req), jsonBody(req)));
export const resumeReview = handle((req) => resumeVerification(actor(req), complaintId(req), jsonBody(req)));
export const decide = handle((req) => decideVerification(actor(req), complaintId(req), jsonBody(req)));
export const setPriority = handle((req) => setComplaintPriority(actor(req), complaintId(req), jsonBody(req)));
export const assigneeOptions = handle((req) => getAssigneeOptions(actor(req), complaintId(req)));
export const reassign = handle((req) => reassignComplaint(actor(req), complaintId(req), jsonBody(req)));

// Multipart routes carry their JSON fields in a single "data" part.
function multipartBody(req: Request, what: string) {
  let body: unknown;
  try {
    body = JSON.parse(String(req.body?.data ?? ""));
  } catch {
    throw new ComplaintError(`${what} are missing or malformed.`);
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new ComplaintError(`${what} are missing or malformed.`);
  return body as Record<string, unknown>;
}

const uploads = (req: Request, field: string) =>
  ((req.files ?? {}) as Record<string, ComplaintUpload[]>)[field] ?? [];

export const informationReceived = handle((req) =>
  markInformationReceived(actor(req), complaintId(req), multipartBody(req, "Information details"), uploads(req, "files")),
);

export const newVisit = handle((req) => createVisit(actor(req), complaintId(req), jsonBody(req)));
export const visitAction = handle((req) =>
  runVisitAction(actor(req), complaintId(req), positiveId(req.params.visitId), jsonBody(req)),
);
export const visitPayment = handle((req) =>
  recordVisitPayment(
    actor(req),
    complaintId(req),
    positiveId(req.params.visitId),
    multipartBody(req, "Payment details"),
    uploads(req, "proof"),
  ),
);
export const paymentReview = handle((req) =>
  verifyPayment(actor(req), complaintId(req), positiveId(req.params.paymentId), jsonBody(req)),
);

export const create = handle(async (req) => {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(String(req.body?.data ?? ""));
  } catch {
    throw new ComplaintError("Complaint details are missing or malformed.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new ComplaintError("Complaint details are missing or malformed.");
  const files = (req.files ?? {}) as Record<string, ComplaintUpload[]>;
  return registerComplaint(actor(req), body, files.photos ?? [], files.videos ?? []);
});

const param = (req: Request, name: string) => positiveId(req.params[name]);

export const warranty = handle((req) => setWarranty(actor(req), complaintId(req), jsonBody(req)));
export const cancel = handle((req) => cancelComplaint(actor(req), complaintId(req), jsonBody(req)));
export const inspection = handle((req) =>
  submitInspection(actor(req), complaintId(req), multipartBody(req, "Inspection details"), {
    photos: uploads(req, "photos"),
    videos: uploads(req, "videos"),
    documents: uploads(req, "documents"),
  }),
);
export const inspectionDecision = handle((req) => afterInspection(actor(req), complaintId(req), jsonBody(req)));
export const quotation = handle((req) => saveQuotation(actor(req), complaintId(req), jsonBody(req)));
export const quotationAction = handle((req) =>
  runQuotationAction(actor(req), complaintId(req), param(req, "quotationId"), jsonBody(req)),
);
export const repairPayment = handle((req) =>
  recordRepairPayment(actor(req), complaintId(req), param(req, "chargeId"), multipartBody(req, "Payment details"), uploads(req, "proof")),
);
export const repairWaiver = handle((req) =>
  waiveRepairCharge(actor(req), complaintId(req), param(req, "chargeId"), jsonBody(req)),
);
export const executionAction = handle((req) =>
  runExecutionAction(actor(req), complaintId(req), param(req, "executionId"), jsonBody(req)),
);
export const executionComplete = handle((req) =>
  completeExecution(actor(req), complaintId(req), param(req, "executionId"), multipartBody(req, "Completion report"), {
    before: uploads(req, "before"),
    after: uploads(req, "after"),
  }),
);
export const clientConfirmation = handle((req) =>
  recordClientConfirmation(actor(req), complaintId(req), multipartBody(req, "Confirmation details"), uploads(req, "photos")),
);
export const noResponseClosure = handle((req) => closeWithoutResponse(actor(req), complaintId(req), jsonBody(req)));
export const closure = handle((req) => approveClosure(actor(req), complaintId(req), jsonBody(req)));
