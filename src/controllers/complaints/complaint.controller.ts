import { Request, Response } from "express";
import { createComplaint, listComplaints, updateComplaintStatus, getComplaintAttachmentUrl } from "../../services/complaints/complaint.service";

export async function createComplaintController(req: Request, res: Response) {
  try {
    const result = await createComplaint((req as any).user, req.body, req.file);
    res.status(201).json({ success: true, data: result, message: "Complaint submitted successfully." });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || "Failed to submit complaint." });
  }
}

export async function listComplaintsController(req: Request, res: Response) {
  try {
    const result = await listComplaints((req as any).user, req.query);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || "Failed to fetch complaints." });
  }
}

export async function updateComplaintStatusController(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const result = await updateComplaintStatus((req as any).user, id, req.body);
    res.json({ success: true, data: result, message: "Complaint status updated." });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || "Failed to update complaint status." });
  }
}

export async function getComplaintAttachmentController(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const result = await getComplaintAttachmentUrl((req as any).user, id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || "Failed to get attachment." });
  }
}

