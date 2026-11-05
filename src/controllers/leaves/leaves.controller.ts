import { Request, Response } from "express";
import { createLeaveRequest, decideLeaveRequest, deleteLeaveHoliday, getLeaveAttachment, getLeaveWorkspace, importLeaveHolidays, listLeaveRequests, saveLeaveWeeklyOffs } from "../../services/leaves/leaves.service";
import { positiveId } from "../../services/leaves/leave.utils";
const endpoint = (handler: (req: Request) => Promise<unknown>, status = 200) => async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  try { return res.status(status).json({ success: true, data: await handler(req) }); }
  catch (error: any) {
    const code = error.statusCode || (["P2002", "P2034"].includes(error.code) ? 409 : 500);
    if (code === 500) console.error("Leave request failed", error);
    return res.status(code).json({ success: false, message: code === 500 ? "Could not complete this leave operation. Please try again." : ["P2002", "P2034"].includes(error.code) ? "A conflicting record was saved. Refresh and retry." : error.message });
  }
};
export const leaveWorkspaceController = endpoint(req => getLeaveWorkspace((req as any).user, req.query));
export const leaveHolidayImportController = endpoint(req => importLeaveHolidays((req as any).user, req.body ?? {}));
export const leaveHolidayDeleteController = endpoint(req => deleteLeaveHoliday((req as any).user, positiveId(req.params.id, "holiday id")));
export const leaveWeeklyOffController = endpoint(req => saveLeaveWeeklyOffs((req as any).user, req.body ?? {}));
export const leaveRequestsController = endpoint(req => listLeaveRequests((req as any).user, req.query));
export const leaveCreateController = endpoint(req => createLeaveRequest((req as any).user, req.body ?? {}, req.file), 201);
export const leaveDecisionController = endpoint(req => decideLeaveRequest((req as any).user, positiveId(req.params.id, "request id"), req.body ?? {}));
export const leaveAttachmentController = endpoint(req => getLeaveAttachment((req as any).user, positiveId(req.params.id, "request id")));
