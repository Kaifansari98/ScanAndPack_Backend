import { prisma } from "../prisma/client";
import { createLeadLog } from "./leadDetailedLog";
import { resolveLeadCode } from "./fileUtils";

const MAX_PART_NAMES = 10;

const fabricationLabel = (fabrication?: string | null) =>
  fabrication === "METALWORK" ? "Metalwork" : "Woodwork";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** "A", "A and B", "A, B and C", "A, B, … and 4 more" */
const formatList = (names: string[]) => {
  const shown = names.slice(0, MAX_PART_NAMES);
  const rest = names.length - shown.length;
  if (rest > 0) return `${shown.join(", ")} and ${rest} more`;
  if (shown.length <= 1) return shown.join("");
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
};

const namePart = (value?: string | null) => (value ?? "").trim().replace(/\s+/g, "-");

/**
 * Track & Trace project name for a lead instance:
 * Firstname-Lastname-StructureType-LEADCODE, with the instance's quantity index
 * appended (LEADCODE.3) only when the lead has more than one product instance.
 * Without an instance the structure type is omitted.
 */
export async function resolveLeadProjectName(
  vendorId: number,
  leadId: number,
  instanceId?: number | null,
) {
  const [lead, instance, leadCode] = await Promise.all([
    prisma.leadMaster.findFirst({
      where: { id: leadId, vendor_id: vendorId },
      select: { firstname: true, lastname: true },
    }),
    instanceId
      ? prisma.leadProductStructureInstance.findFirst({
          where: { id: instanceId, lead_id: leadId, vendor_id: vendorId },
          select: { productStructure: { select: { type: true } } },
        })
      : null,
    resolveLeadCode(vendorId, leadId, instanceId ?? undefined),
  ]);
  return [
    namePart(lead?.firstname),
    namePart(lead?.lastname),
    namePart(instance?.productStructure?.type),
    leadCode,
  ]
    .filter(Boolean)
    .join("-");
}

/** Writes one entry to the lead's Site History → Track Trace tab. Never throws. */
async function writeTrackTraceLog(params: {
  vendorId: number;
  leadId: number;
  userId: number;
  action: string;
  actionType: "CREATE" | "UPDATE";
}) {
  const user = await prisma.userMaster.findFirst({
    where: { id: params.userId, vendor_id: params.vendorId },
    select: { id: true },
  });
  if (!user) return;

  await createLeadLog(prisma as any, {
    vendor_id: params.vendorId,
    lead_id: params.leadId,
    account_id: 0,
    action: params.action,
    action_type: params.actionType,
    created_by: user.id,
    history_type: "TrackTrace",
  });
}

/** Records that a lead's cutlist upload created its Track & Trace project. */
export async function logProjectSentToTrackTrace(params: {
  vendorId: number;
  leadId: number;
  userId?: number | null;
  projectName: string;
  fabrication: "WOODWORK" | "METALWORK";
}) {
  const { vendorId, leadId, userId, projectName, fabrication } = params;
  if (!userId) return;

  try {
    await writeTrackTraceLog({
      vendorId,
      leadId,
      userId,
      actionType: "CREATE",
      action: `Project ${projectName} has been sent to the Track & Trace flow after the ${fabricationLabel(fabrication)} cutlist was uploaded.`,
    });
  } catch (error) {
    console.error("logProjectSentToTrackTrace error:", error);
  }
}

type MappingChange =
  | { kind: "assigned" | "removed"; machineName: string }
  | { kind: "excel"; added: number; removed: number };

/**
 * Records a cutlist part ↔ machine mapping change in the lead's Site History
 * (Track Trace tab). Best effort: a logging failure never fails the mapping change,
 * and projects without a linked lead or a known user are skipped.
 */
export async function logCutlistMappingChange(params: {
  vendorId: number;
  projectId: number;
  userId?: number | null;
  cutListIds: number[];
  change: MappingChange;
}) {
  const { vendorId, projectId, userId, cutListIds, change } = params;
  if (!userId || cutListIds.length === 0) return;

  try {
    const [project, parts] = await Promise.all([
      prisma.projectMaster.findFirst({
        where: { id: projectId, vendor_id: vendorId },
        select: { lead_id: true, project_name: true },
      }),
      prisma.cutList.findMany({
        where: { id: { in: cutListIds }, project_id: projectId },
        select: { item_name: true, unique_code: true, fabrication: true },
        orderBy: { id: "asc" },
      }),
    ]);
    if (!project?.lead_id) return;

    const fabrications = new Set(parts.map((part) => part.fabrication));
    const cutlist =
      fabrications.size === 1
        ? `${fabricationLabel([...fabrications][0])} cutlist`
        : "Woodwork and Metalwork cutlists";
    const partNames = formatList(
      parts.map((part) => part.item_name || part.unique_code || "Unnamed part"),
    );
    const partCount = plural(cutListIds.length, "part");
    const where = `in the ${cutlist} of project ${project.project_name}`;

    const action =
      change.kind === "excel"
        ? `Machine assignments ${where} were updated from an Excel upload: ${plural(change.added, "assignment")} added and ${change.removed} removed across ${partCount} (${partNames}).`
        : change.kind === "assigned"
          ? `Machine "${change.machineName}" was assigned to ${partCount} ${where}: ${partNames}.`
          : `Machine "${change.machineName}" was removed from ${partCount} ${where}: ${partNames}.`;

    await writeTrackTraceLog({
      vendorId,
      leadId: project.lead_id,
      userId,
      actionType: "UPDATE",
      action,
    });
  } catch (error) {
    console.error("logCutlistMappingChange error:", error);
  }
}
