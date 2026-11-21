import { prisma, Prisma } from "../../prisma/client";
import { ComplaintStatus, ComplaintTaskType, LeadTaskStatus, NotificationType } from "../../prisma/generated";
import logger from "../../utils/logger";
import { NotificationService } from "../notification/notification.service";
import { sendTaskAssignedEmail } from "../email/brevoEmail.service";
import { createTaskHistoryLog } from "../task/taskHistory.service";

// Complaint tasks: each workflow stage gets one task for whoever has to act
// next, the HO (assigned head site supervisor, else a vendor HSS, else a super
// admin) or the assigned site supervisor. After every complaint change the
// open tasks are reconciled with the complaint's state: tasks the stage needs
// are opened or reassigned, and tasks it no longer needs are closed.
//
// Tasks always show on the complaint's details page. For a complaint raised
// against a CRM lead, each task is also mirrored into UserLeadTask so it shows
// in My Tasks with the lead; complaints for external clients stay off My Tasks.

type Tx = Prisma.TransactionClient;
type Owner = "HO" | "SS";

const OPEN: LeadTaskStatus[] = ["open", "in_progress"];
const FINISHED: ComplaintStatus[] = ["CLOSED", "REJECTED", "CANCELLED"];

// What each task is called in My Tasks and on the details page, by key prefix.
export const COMPLAINT_TASK_TITLES: Record<string, string> = {
  VERIFICATION: "Complaint Verification",
  REOPEN_REVIEW: "Reopened Complaint Review",
  INFO: "Complaint Information Follow-up",
  ON_HOLD: "On-Hold Complaint Review",
  VISIT_PLAN: "Complaint Visit Planning",
  FREE_VISIT: "Complaint Free Visit Approval",
  VISIT_CHARGE: "Complaint Visit Charge Follow-up",
  SCHEDULE_VISIT: "Complaint Visit Scheduling",
  SITE_VISIT: "Complaint Site Visit",
  VISIT_CASH: "Complaint Visit Cash Collection",
  PAYMENT: "Complaint Payment Verification",
  INSPECTION_REVIEW: "Complaint Inspection Review",
  QUOTATION: "Complaint Quotation Preparation",
  QUOTATION_APPROVAL: "Complaint Quotation Approval",
  CLIENT_APPROVAL: "Complaint Quotation Client Follow-up",
  REPAIR_PAYMENT: "Complaint Repair Payment Collection",
  RESOLUTION_PAYMENT: "Complaint Resolution Payment Collection",
  PROCUREMENT: "Complaint Material Procurement",
  REPAIR_PLAN: "Complaint Resolution Start",
  REPAIR: "Complaint Resolution Work",
  CLIENT_CONFIRMATION: "Complaint Client Confirmation",
  FINAL_CLOSURE: "Complaint Closure Approval",
};

export const complaintTaskTitle = (taskKey: string) =>
  COMPLAINT_TASK_TITLES[taskKey.split(":")[0]] ?? "Complaint Task";

/** Every task title, for the My Tasks type filter. */
export const COMPLAINT_TASK_TYPE_NAMES = Object.values(COMPLAINT_TASK_TITLES);

type Wanted = {
  key: string;
  type: ComplaintTaskType;
  owner: Owner;
  /** A specific person (the visit's or repair's supervisor) instead of the owner. */
  assignee?: number | null;
  due?: Date | null;
  status?: "open" | "in_progress";
  visit_id?: number;
  execution_id?: number;
};

async function loadState(tx: Tx, complaintId: number) {
  // One sync at a time per complaint.
  await tx.$queryRaw`SELECT id FROM "ComplaintMaster" WHERE id = ${complaintId} FOR UPDATE`;
  const complaint = await tx.complaintMaster.findUnique({
    where: { id: complaintId },
    select: {
      id: true,
      vendor_id: true,
      complaint_code: true,
      client_name: true,
      status: true,
      lead_id: true,
      account_id: true,
      assigned_ss_id: true,
      assigned_hss_id: true,
      current_cycle_id: true,
      category: { select: { name: true } },
      lead: { select: { franchise_id: true, statusType: { select: { type: true } } } },
    },
  });
  if (!complaint?.current_cycle_id) return null;
  const cycleId = complaint.current_cycle_id;
  const [visits, payments, executions, repairCharges, resolutionDue] = await Promise.all([
    tx.complaintVisit.findMany({
      where: { complaint_id: complaint.id, cycle_id: cycleId },
      select: {
        id: true,
        status: true,
        pay_at_visit: true,
        assigned_ss_id: true,
        scheduled_for: true,
        _count: { select: { inspectionReports: true } },
        charges: {
          select: { amount: true, status: true, allocations: { select: { amount: true, payment: { select: { status: true } } } } },
        },
      },
    }),
    tx.complaintPayment.findMany({
      where: { complaint_id: complaint.id, cycle_id: cycleId, status: "PENDING_VERIFICATION" },
      select: { id: true },
    }),
    tx.complaintExecution.findMany({
      where: { complaint_id: complaint.id, cycle_id: cycleId, status: { notIn: ["WORK_COMPLETED", "CANCELLED"] } },
      select: {
        id: true,
        status: true,
        assigned_ss_id: true,
        scheduled_for: true,
        _count: { select: { miscellaneous: true } },
      },
    }),
    tx.complaintCharge.findMany({
      where: { complaint_id: complaint.id, cycle_id: cycleId, charge_type: "REPAIR", status: "OPEN" },
      select: { id: true, amount: true, allocations: { select: { amount: true, payment: { select: { status: true } } } } },
    }),
    tx.complaintQuotation.findFirst({
      where: {
        complaint_id: complaint.id,
        cycle_id: cycleId,
        status: "CLIENT_ACCEPTED",
        payment_at_resolution: true,
        charges: { none: {} },
      },
      select: { id: true },
    }),
  ]);
  return { complaint, cycleId, visits, payments, executions, repairCharges, resolutionDue };
}

type State = NonNullable<Awaited<ReturnType<typeof loadState>>>;

// Amount still to collect on a charge (pending payments count as collected).
const outstanding = (charge: { amount: Prisma.Decimal; allocations: { amount: Prisma.Decimal; payment: { status: string } }[] }) =>
  Number(charge.amount) -
  charge.allocations
    .filter((a) => ["VERIFIED", "PENDING_VERIFICATION"].includes(a.payment.status))
    .reduce((sum, a) => sum + Number(a.amount), 0);

// The tasks the complaint needs right now.
function wantedTasks(s: State): Wanted[] {
  const { complaint } = s;
  if (FINISHED.includes(complaint.status)) return [];
  const tasks: Wanted[] = [];
  const add = (task: Wanted) => tasks.push(task);

  // Payments anyone recorded wait for HO verification, at any stage.
  for (const p of s.payments) add({ key: `PAYMENT:${p.id}`, type: "PAYMENT_VERIFICATION", owner: "HO" });
  // Cash an installation team took at a finished visit, not yet recorded.
  for (const v of s.visits) {
    const charge = v.charges[0];
    if (v.status === "COMPLETED" && v.pay_at_visit && charge?.status === "OPEN" && outstanding(charge) > 0)
      add({ key: `VISIT_CASH:${v.id}`, type: "PAYMENT_COLLECTION", owner: "SS", assignee: v.assigned_ss_id, visit_id: v.id });
  }

  switch (complaint.status) {
    case "NEW":
    case "UNDER_VERIFICATION":
      add({ key: "VERIFICATION", type: "VERIFICATION", owner: "HO", status: complaint.status === "NEW" ? "open" : "in_progress" });
      break;
    case "REOPENED":
      add({ key: "REOPEN_REVIEW", type: "REOPEN_REVIEW", owner: "HO" });
      break;
    case "MORE_INFORMATION_REQUIRED":
      add({ key: "INFO", type: "INFORMATION_FOLLOW_UP", owner: "SS" });
      break;
    case "ON_HOLD":
      add({ key: "ON_HOLD", type: "ON_HOLD_REVIEW", owner: "HO" });
      break;
    case "APPROVED_FOR_VISIT":
    case "AWAITING_CLIENT_ACCEPTANCE":
    case "PAYMENT_PENDING":
    case "VISIT_SCHEDULED": {
      let active = false;
      for (const v of s.visits) {
        const charge = v.charges[0];
        const visit = { visit_id: v.id, assignee: v.assigned_ss_id };
        switch (v.status) {
          case "PENDING_FREE_APPROVAL":
            active = true;
            add({ key: `FREE_VISIT:${v.id}`, type: "FREE_VISIT_APPROVAL", owner: "HO", visit_id: v.id });
            break;
          case "AWAITING_CHARGE_ACCEPTANCE":
          case "AWAITING_PAYMENT":
            active = true;
            // Once fully paid, the payment-verification task takes over.
            if (!charge || outstanding(charge) > 0)
              add({ key: `VISIT_CHARGE:${v.id}`, type: "VISIT_CHARGE_FOLLOW_UP", owner: "SS", ...visit });
            break;
          case "READY_TO_SCHEDULE":
            active = true;
            add({ key: `SCHEDULE_VISIT:${v.id}`, type: "VISIT_SCHEDULING", owner: "SS", ...visit });
            break;
          case "SCHEDULED":
          case "CONFIRMED":
            active = true;
            add({ key: `SITE_VISIT:${v.id}`, type: "SITE_VISIT", owner: "SS", ...visit, due: v.scheduled_for });
            break;
          case "COMPLETED":
            // Visit done but its inspection report is still due.
            if (complaint.status === "VISIT_SCHEDULED" && v._count.inspectionReports === 0) {
              active = true;
              add({ key: `SITE_VISIT:${v.id}`, type: "SITE_VISIT", owner: "SS", ...visit, due: v.scheduled_for, status: "in_progress" });
            }
            break;
        }
      }
      if (!active && complaint.status === "APPROVED_FOR_VISIT")
        add({ key: "VISIT_PLAN", type: "VISIT_SCHEDULING", owner: "SS" });
      break;
    }
    case "INSPECTION_SUBMITTED":
      add({ key: "INSPECTION_REVIEW", type: "INSPECTION_REPORT", owner: "HO" });
      break;
    case "QUOTATION_PREPARATION":
      add({ key: "QUOTATION", type: "QUOTATION_PREPARATION", owner: "HO" });
      break;
    case "DEPARTMENT_HEAD_APPROVAL":
      add({ key: "QUOTATION_APPROVAL", type: "QUOTATION_APPROVAL", owner: "HO" });
      break;
    case "QUOTATION_SHARED":
    case "AWAITING_CLIENT_APPROVAL":
      add({ key: "CLIENT_APPROVAL", type: "CLIENT_APPROVAL_FOLLOW_UP", owner: "HO" });
      break;
    case "AWAITING_PAYMENT":
      for (const c of s.repairCharges)
        if (outstanding(c) > 0) add({ key: `REPAIR_PAYMENT:${c.id}`, type: "PAYMENT_COLLECTION", owner: "SS" });
      break;
    case "AWAITING_CLIENT_CONFIRMATION":
      add({ key: "CLIENT_CONFIRMATION", type: "CLIENT_CONFIRMATION_FOLLOW_UP", owner: "SS" });
      break;
    case "AWAITING_HO_CLOSURE_APPROVAL":
      add({ key: "FINAL_CLOSURE", type: "FINAL_CLOSURE", owner: "HO" });
      break;
  }

  // Repairs (Start Resolution onwards) follow their execution.
  for (const e of s.executions) {
    const exec = { execution_id: e.id, assignee: e.assigned_ss_id };
    switch (e.status) {
      case "PROCUREMENT_PENDING":
      case "MATERIAL_ORDERED":
        // Factory (Miscellaneous) requests are tracked by the factory's own tasks.
        if (e._count.miscellaneous === 0)
          add({ key: `PROCUREMENT:${e.id}`, type: "PROCUREMENT", owner: "SS", ...exec });
        break;
      case "MATERIAL_NOT_REQUIRED":
      case "MATERIAL_RECEIVED":
      case "MATERIAL_READY":
        add({ key: `REPAIR_PLAN:${e.id}`, type: "REPAIR", owner: "SS", ...exec });
        break;
      case "REPAIR_SCHEDULED":
      case "WORK_IN_PROGRESS":
        add({
          key: `REPAIR:${e.id}`,
          type: "REPAIR",
          owner: "SS",
          ...exec,
          due: e.scheduled_for,
          status: e.status === "WORK_IN_PROGRESS" ? "in_progress" : "open",
        });
        break;
    }
  }
  if (s.resolutionDue)
    add({ key: `RESOLUTION_PAYMENT:${s.resolutionDue.id}`, type: "PAYMENT_COLLECTION", owner: "SS" });
  return tasks;
}

async function activeUser(tx: Tx, vendorId: number, id: number | null) {
  if (!id) return null;
  const user = await tx.userMaster.findFirst({ where: { id, vendor_id: vendorId, status: "active" }, select: { id: true } });
  return user?.id ?? null;
}

async function firstOfRole(tx: Tx, vendorId: number, role: string) {
  const user = await tx.userMaster.findFirst({
    where: { vendor_id: vendorId, status: "active", user_type: { user_type: { equals: role, mode: "insensitive" } } },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  return user?.id ?? null;
}

export type ComplaintTaskNotice = {
  vendorId: number;
  userId: number;
  title: string;
  complaintId: number;
  complaintCode: string;
  clientName: string;
  dueDate: Date | null;
  leadTaskId: number | null;
};

const CLOSED: LeadTaskStatus[] = ["completed", "cancelled", "closed"];

// Reconciles the complaint's tasks with its state. Returns who to notify.
export async function syncComplaintTasks(tx: Tx, complaintId: number, actorId: number) {
  const s = await loadState(tx, complaintId);
  if (!s) return [];
  const { complaint, cycleId } = s;
  const vendorId = complaint.vendor_id;
  const now = new Date();

  const ho =
    (await activeUser(tx, vendorId, complaint.assigned_hss_id)) ??
    (await firstOfRole(tx, vendorId, "head-site-supervisor")) ??
    (await firstOfRole(tx, vendorId, "super-admin")) ??
    actorId;
  const ss = (await activeUser(tx, vendorId, complaint.assigned_ss_id)) ?? ho;

  const wanted = wantedTasks(s);
  const existing = await tx.complaintTask.findMany({
    where: { complaint_id: complaint.id },
    select: { id: true, cycle_id: true, task_key: true, status: true, assigned_to: true, due_date: true },
  });
  const byKey = new Map(existing.filter((t) => t.cycle_id === cycleId).map((t) => [t.task_key, t]));
  const changed: number[] = [];
  const notify: { taskId: number; userId: number; title: string; due: Date | null }[] = [];

  for (const w of wanted) {
    const assignee = (await activeUser(tx, vendorId, w.assignee ?? null)) ?? (w.owner === "HO" ? ho : ss);
    const status = w.status ?? "open";
    const current = byKey.get(w.key);
    if (!current) {
      const task = await tx.complaintTask.create({
        data: {
          vendor_id: vendorId,
          complaint_id: complaint.id,
          cycle_id: cycleId,
          task_type: w.type,
          task_key: w.key,
          assigned_to: assignee,
          status,
          due_date: w.due ?? now,
          visit_id: w.visit_id ?? null,
          execution_id: w.execution_id ?? null,
          created_by: actorId,
        },
        select: { id: true },
      });
      changed.push(task.id);
      notify.push({ taskId: task.id, userId: assignee, title: complaintTaskTitle(w.key), due: w.due ?? now });
      continue;
    }
    const reopened = CLOSED.includes(current.status);
    const reassigned = current.assigned_to !== assignee;
    const due = w.due ?? (reopened ? now : current.due_date);
    if (reopened || reassigned || current.status !== status || due?.getTime() !== current.due_date?.getTime()) {
      await tx.complaintTask.update({
        where: { id: current.id },
        data: {
          status,
          assigned_to: assignee,
          due_date: due,
          ...(reopened ? { completed_by: null, completed_at: null } : {}),
        },
      });
      changed.push(current.id);
      if (reopened || reassigned)
        notify.push({ taskId: current.id, userId: assignee, title: complaintTaskTitle(w.key), due });
    }
  }

  // Open tasks the complaint no longer needs: the work was done (or the
  // complaint was cancelled). Older cycles' leftovers close too.
  const wantedKeys = new Set(wanted.map((w) => w.key));
  const finishedStatus: LeadTaskStatus = complaint.status === "CANCELLED" ? "cancelled" : "completed";
  for (const t of existing) {
    if (!OPEN.includes(t.status)) continue;
    if (t.cycle_id === cycleId && wantedKeys.has(t.task_key)) continue;
    await tx.complaintTask.update({
      where: { id: t.id },
      data: { status: finishedStatus, completed_by: actorId, completed_at: now },
    });
    changed.push(t.id);
  }

  // Tasks the workflow closed itself (e.g. a cancelled visit) still need their
  // My Tasks row closed, so mirror every task whose row is out of step.
  const leadTaskIds = new Map<number, number>();
  if (complaint.lead_id && complaint.account_id)
    await mirrorToMyTasks(tx, s, changed, actorId, leadTaskIds);

  return notify
    .filter((n) => n.userId !== actorId)
    .map<ComplaintTaskNotice>((n) => ({
      vendorId,
      userId: n.userId,
      title: n.title,
      complaintId: complaint.id,
      complaintCode: complaint.complaint_code,
      clientName: complaint.client_name,
      dueDate: n.due,
      leadTaskId: leadTaskIds.get(n.taskId) ?? null,
    }));
}

async function mirrorToMyTasks(tx: Tx, s: State, changed: number[], actorId: number, leadTaskIds: Map<number, number>) {
  const { complaint } = s;
  const tasks = await tx.complaintTask.findMany({
    // All of them: a task the workflow closed on its own may still have an
    // open My Tasks row. Complaints have a handful of tasks at most.
    where: { complaint_id: complaint.id },
    select: {
      id: true,
      task_key: true,
      status: true,
      assigned_to: true,
      due_date: true,
      completed_by: true,
      completed_at: true,
      created_by: true,
      leadTask: { select: { id: true, status: true, user_id: true, due_date: true } },
    },
  });
  const remark = `${complaint.complaint_code} · ${complaint.category.name}`;
  for (const t of tasks) {
    const title = complaintTaskTitle(t.task_key);
    const closed = CLOSED.includes(t.status);
    const due = t.due_date ?? new Date();
    if (!t.leadTask) {
      // A task that finished before it was ever mirrored has nothing to show.
      if (closed && !changed.includes(t.id)) continue;
      const row = await tx.userLeadTask.create({
        data: {
          vendor_id: complaint.vendor_id,
          lead_id: complaint.lead_id!,
          account_id: complaint.account_id!,
          franchise_id: complaint.lead?.franchise_id ?? null,
          user_id: t.assigned_to,
          task_type: title,
          lead_stage: complaint.lead?.statusType?.type ?? null,
          due_date: due,
          remark,
          status: t.status,
          closed_by: closed ? (t.completed_by ?? actorId) : null,
          closed_at: closed ? (t.completed_at ?? new Date()) : null,
          created_by: t.created_by,
          complaint_id: complaint.id,
          complaint_task_id: t.id,
        },
      });
      leadTaskIds.set(t.id, row.id);
      await createTaskHistoryLog({ db: tx, task: row, createdBy: actorId, actionType: "CREATE" });
      continue;
    }
    leadTaskIds.set(t.id, t.leadTask.id);
    const lt = t.leadTask;
    if (lt.status === t.status && lt.user_id === t.assigned_to && lt.due_date.getTime() === due.getTime()) continue;
    const row = await tx.userLeadTask.update({
      where: { id: lt.id },
      data: {
        status: t.status,
        user_id: t.assigned_to,
        due_date: due,
        updated_by: actorId,
        closed_by: closed ? (t.completed_by ?? actorId) : null,
        closed_at: closed ? (t.completed_at ?? new Date()) : null,
      },
    });
    await createTaskHistoryLog({ db: tx, task: row, createdBy: actorId, actionType: "UPDATE" });
  }
}

const clientBaseUrl = (base?: string) =>
  (base || process.env.CLIENT_BASE_URL || process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");

// In-app notification and email for each new or reassigned task, the same way
// other CRM tasks announce themselves. Never throws: the change already saved.
export async function notifyComplaintTasks(notices: ComplaintTaskNotice[], actorId: number, base?: string) {
  if (!notices.length) return;
  try {
    const [actor, users] = await Promise.all([
      prisma.userMaster.findUnique({ where: { id: actorId }, select: { user_name: true } }),
      prisma.userMaster.findMany({
        where: { id: { in: notices.map((n) => n.userId) } },
        select: { id: true, user_name: true, user_email: true },
      }),
    ]);
    const leadTaskIds = notices.map((n) => n.leadTaskId).filter((id): id is number => !!id);
    const leadCodes = new Map(
      (
        await prisma.userLeadTask.findMany({
          where: { id: { in: leadTaskIds } },
          select: { id: true, lead: { select: { lead_code: true } } },
        })
      ).map((t) => [t.id, t.lead.lead_code]),
    );
    for (const n of notices) {
      // The work happens on the complaint page (a My Tasks row opens it too).
      const path = `/dashboard/client-complaints/details/${n.complaintId}`;
      const user = users.find((u) => u.id === n.userId);
      try {
        await NotificationService.createAndSend({
          vendor_id: n.vendorId,
          user_id: n.userId,
          sender_id: actorId,
          type: NotificationType.TASK_ASSIGNED,
          title: "New task assigned",
          message: `${n.title} for complaint ${n.complaintCode} (${n.clientName}).`,
          entity_type: n.leadTaskId ? "task" : "complaint",
          entity_id: n.leadTaskId ?? n.complaintId,
          redirect_url: path,
        });
        const email = user?.user_email?.trim();
        if (email)
          await sendTaskAssignedEmail({
            allowSuperAdmin: true,
            vendor_id: n.vendorId,
            toEmail: email,
            toName: user?.user_name ?? undefined,
            leadCode: (n.leadTaskId && leadCodes.get(n.leadTaskId)) || n.complaintCode,
            taskTitle: n.title,
            leadName: `${n.clientName} (${n.complaintCode})`,
            assignedBy: actor?.user_name ?? "CRM",
            dueDate: n.dueDate
              ? n.dueDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
              : "—",
            remark: `Complaint ${n.complaintCode}`,
            taskUrl: `${clientBaseUrl(base)}${path}`,
          });
      } catch (error) {
        logger.error("Complaint task notification failed", {
          complaint_id: n.complaintId,
          user_id: n.userId,
          message: (error as Error)?.message,
        });
      }
    }
  } catch (error) {
    logger.error("Complaint task notifications failed", { message: (error as Error)?.message });
  }
}

// Runs after a complaint change has been saved. Task trouble is logged, never
// surfaced: the user's action already succeeded.
export async function refreshComplaintTasks(complaintId: number, actorId: number, base?: string) {
  try {
    const notices = await prisma.$transaction((tx) => syncComplaintTasks(tx, complaintId, actorId));
    // Emails can be slow; the response does not wait for them.
    void notifyComplaintTasks(notices, actorId, base);
  } catch (error) {
    logger.error("Complaint task sync failed", {
      complaint_id: complaintId,
      message: (error as Error)?.message,
      stack: (error as Error)?.stack,
    });
  }
}

// One-off: brings every open complaint's tasks up to date (e.g. after deploy),
// without notifying anyone.
export async function refreshAllComplaintTasks() {
  const complaints = await prisma.complaintMaster.findMany({
    where: { status: { notIn: FINISHED }, raised_by_user_id: { not: null } },
    select: { id: true, raised_by_user_id: true },
  });
  for (const c of complaints)
    await prisma.$transaction((tx) => syncComplaintTasks(tx, c.id, c.raised_by_user_id!));
  return complaints.length;
}
