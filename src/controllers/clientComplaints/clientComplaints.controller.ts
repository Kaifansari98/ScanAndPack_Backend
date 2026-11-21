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
import { resolveClientBaseUrl } from "../../utils/fileUtils";
import { refreshComplaintTasks } from "../../services/clientComplaints/complaintTasks.service";
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
  recordResolutionPayment,
  verifyPayment,
  waiveRepairCharge,
  waiveResolutionPayment,
} from "../../services/clientComplaints/complaintPayment.service";
import { afterInspection, setWarranty, submitInspection } from "../../services/clientComplaints/complaintInspection.service";
import { runQuotationAction, uploadQuotation } from "../../services/clientComplaints/complaintQuotation.service";
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

// A workflow step: once it has saved, the complaint's tasks are brought in line
// with its new state (and new assignees notified).
const step = (fn: (req: Request) => Promise<unknown>, idOf: (req: Request, result: any) => number = (req) => complaintId(req)) =>
  handle(async (req) => {
    const result = await fn(req);
    await refreshComplaintTasks(idOf(req, result), actor(req).actorId, resolveClientBaseUrl(req));
    return result;
  });

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

export const startReview = step((req) => startVerification(actor(req), complaintId(req), jsonBody(req)));
export const resumeReview = step((req) => resumeVerification(actor(req), complaintId(req), jsonBody(req)));
export const decide = step((req) => decideVerification(actor(req), complaintId(req), jsonBody(req)));
export const setPriority = handle((req) => setComplaintPriority(actor(req), complaintId(req), jsonBody(req)));
export const assigneeOptions = handle((req) => getAssigneeOptions(actor(req), complaintId(req)));
export const reassign = step((req) => reassignComplaint(actor(req), complaintId(req), jsonBody(req)));

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

export const informationReceived = step((req) =>
  markInformationReceived(actor(req), complaintId(req), multipartBody(req, "Information details"), uploads(req, "files")),
);

export const newVisit = step((req) => createVisit(actor(req), complaintId(req), jsonBody(req)));
export const visitAction = step((req) =>
  runVisitAction(actor(req), complaintId(req), positiveId(req.params.visitId), jsonBody(req)),
);
export const visitPayment = step((req) =>
  recordVisitPayment(
    actor(req),
    complaintId(req),
    positiveId(req.params.visitId),
    multipartBody(req, "Payment details"),
    uploads(req, "proof"),
  ),
);
export const paymentReview = step((req) =>
  verifyPayment(actor(req), complaintId(req), positiveId(req.params.paymentId), jsonBody(req)),
);

export const create = step(async (req) => {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(String(req.body?.data ?? ""));
  } catch {
    throw new ComplaintError("Complaint details are missing or malformed.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new ComplaintError("Complaint details are missing or malformed.");
  const files = (req.files ?? {}) as Record<string, ComplaintUpload[]>;
  // Several categories: issue i's photos come in "photos_<i>".
  const photosByIssue = Array.isArray(body.issues)
    ? body.issues.map((_, i) => files[`photos_${i}`] ?? [])
    : [files.photos ?? []];
  const result = await registerComplaint(actor(req), body, photosByIssue, files.videos ?? []);
  // Every complaint registered gets its tasks.
  for (const c of result.complaints.slice(1))
    await refreshComplaintTasks(c.id, actor(req).actorId, resolveClientBaseUrl(req));
  return result;
}, (_req, result) => result.id);

const param = (req: Request, name: string) => positiveId(req.params[name]);

export const warranty = step((req) => setWarranty(actor(req), complaintId(req), jsonBody(req)));
export const cancel = step((req) => cancelComplaint(actor(req), complaintId(req), jsonBody(req)));
export const inspection = step((req) =>
  submitInspection(actor(req), complaintId(req), multipartBody(req, "Inspection details"), {
    photos: uploads(req, "photos"),
    videos: uploads(req, "videos"),
    documents: uploads(req, "documents"),
    paymentProof: uploads(req, "payment_proof"),
  }),
);
export const inspectionDecision = step((req) =>
  afterInspection(actor(req), complaintId(req), multipartBody(req, "Decision details"), uploads(req, "files")),
);
export const quotation = step((req) =>
  uploadQuotation(actor(req), complaintId(req), multipartBody(req, "Quotation details"), uploads(req, "files")),
);
export const quotationAction = step((req) =>
  runQuotationAction(
    actor(req),
    complaintId(req),
    param(req, "quotationId"),
    multipartBody(req, "Client response"),
    uploads(req, "proof"),
  ),
);
export const resolutionPayment = step((req) =>
  recordResolutionPayment(
    actor(req),
    complaintId(req),
    param(req, "quotationId"),
    multipartBody(req, "Payment details"),
    uploads(req, "proof"),
  ),
);
export const resolutionWaiver = step((req) =>
  waiveResolutionPayment(actor(req), complaintId(req), param(req, "quotationId"), jsonBody(req)),
);
export const repairPayment = step((req) =>
  recordRepairPayment(actor(req), complaintId(req), param(req, "chargeId"), multipartBody(req, "Payment details"), uploads(req, "proof")),
);
export const repairWaiver = step((req) =>
  waiveRepairCharge(actor(req), complaintId(req), param(req, "chargeId"), jsonBody(req)),
);
export const executionAction = step((req) =>
  runExecutionAction(actor(req), complaintId(req), param(req, "executionId"), jsonBody(req)),
);
export const executionComplete = step((req) =>
  completeExecution(actor(req), complaintId(req), param(req, "executionId"), multipartBody(req, "Completion report"), {
    before: uploads(req, "before"),
    after: uploads(req, "after"),
    paymentProof: uploads(req, "payment_proof"),
  }),
);
export const clientConfirmation = step((req) =>
  recordClientConfirmation(actor(req), complaintId(req), multipartBody(req, "Confirmation details"), uploads(req, "photos")),
);
export const noResponseClosure = step((req) => closeWithoutResponse(actor(req), complaintId(req), jsonBody(req)));
export const closure = step((req) => approveClosure(actor(req), complaintId(req), jsonBody(req)));
