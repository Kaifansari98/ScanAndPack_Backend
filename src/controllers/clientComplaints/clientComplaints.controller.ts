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
} from "../../services/clientComplaints/clientComplaints.service";
import logger from "../../utils/logger";
import { getComplaintDetail, getComplaintActivity } from "../../services/clientComplaints/complaintDetails.service";

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
      logger.error("Client complaint request failed", { error });
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
