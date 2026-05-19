import { createLeadLog } from "../../utils/leadDetailedLog";

type TaskHistoryTask = {
  id?: number;
  vendor_id: number;
  lead_id: number;
  account_id: number;
  user_id?: number | null;
  task_type?: string | null;
  due_date?: Date | null;
  remark?: string | null;
  status?: string | null;
};

type CreateTaskHistoryLogInput = {
  db: any;
  task: TaskHistoryTask;
  createdBy: number;
  actionType: "CREATE" | "UPDATE";
  action?: string;
  documentIds?: number[];
};

const formatDueDate = (dueDate?: Date | null) => {
  if (!dueDate) return null;
  return new Date(dueDate).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const resolveHistoryType = (taskType?: string | null) => {
  return taskType?.trim().toLowerCase() === "follow up" ? "FollowUp" : "Task";
};

const buildDefaultAction = ({
  task,
  actionType,
}: {
  task: TaskHistoryTask;
  actionType: "CREATE" | "UPDATE";
}) => {
  const taskLabel = task.task_type ?? "Task";
  const parts = [
    actionType === "CREATE"
      ? `Task "${taskLabel}" created.`
      : `Task "${taskLabel}" updated.`,
  ];

  if (task.status) {
    parts.push(`Status: ${task.status}.`);
  }

  const formattedDueDate = formatDueDate(task.due_date);
  if (formattedDueDate) {
    parts.push(`Due Date: ${formattedDueDate}.`);
  }

  if (task.remark && task.remark.trim()) {
    parts.push(`Remark: ${task.remark.trim()}`);
  }

  return parts.join(" ");
};

export const createTaskHistoryLog = async ({
  db,
  task,
  createdBy,
  actionType,
  action,
  documentIds = [],
}: CreateTaskHistoryLogInput) => {
  const detailedLog = await createLeadLog(db, {
    vendor_id: task.vendor_id,
    lead_id: task.lead_id,
    account_id: task.account_id,
    action: action ?? buildDefaultAction({ task, actionType }),
    action_type: actionType,
    history_type: resolveHistoryType(task.task_type),
    created_by: createdBy,
    created_at: new Date(),
  });

  if (documentIds.length > 0) {
    await db.leadDocumentLogs.createMany({
      data: documentIds.map((docId) => ({
        vendor_id: task.vendor_id,
        lead_id: task.lead_id,
        account_id: task.account_id,
        doc_id: docId,
        lead_logs_id: detailedLog.id,
        created_by: createdBy,
        created_at: new Date(),
      })),
    });
  }

  return detailedLog;
};
