import { prisma } from "../prisma/client";
import { createLeadLog } from "./leadDetailedLog";

const MAX_PART_NAMES = 10;

const fabricationLabel = (fabrication?: string | null) =>
  fabrication === "METALWORK" ? "Metalwork" : "Woodwork";

const formatParts = (names: string[]) => {
  const shown = names.slice(0, MAX_PART_NAMES).join(", ");
  const rest = names.length - MAX_PART_NAMES;
  return rest > 0 ? `${shown} +${rest} more` : shown;
};

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
  describe: (ctx: { projectName: string; fabrication: string; parts: string }) => string;
}) {
  const { vendorId, projectId, userId, cutListIds, describe } = params;
  if (!userId || cutListIds.length === 0) return;

  try {
    const [project, user, parts] = await Promise.all([
      prisma.projectMaster.findFirst({
        where: { id: projectId, vendor_id: vendorId },
        select: { lead_id: true, project_name: true },
      }),
      prisma.userMaster.findFirst({
        where: { id: userId, vendor_id: vendorId },
        select: { id: true },
      }),
      prisma.cutList.findMany({
        where: { id: { in: cutListIds }, project_id: projectId },
        select: { item_name: true, unique_code: true, fabrication: true },
        orderBy: { id: "asc" },
      }),
    ]);
    if (!project?.lead_id || !user) return;

    const fabrications = new Set(parts.map((part) => part.fabrication));
    const fabrication =
      fabrications.size === 1
        ? fabricationLabel([...fabrications][0])
        : "Woodwork & Metalwork";
    const names = parts.map((part) => part.item_name || part.unique_code || "Unnamed part");

    await createLeadLog(prisma as any, {
      vendor_id: vendorId,
      lead_id: project.lead_id,
      account_id: 0,
      action: describe({
        projectName: project.project_name,
        fabrication,
        parts: formatParts(names),
      }),
      action_type: "UPDATE",
      created_by: user.id,
      history_type: "TrackTrace",
    });
  } catch (error) {
    console.error("logCutlistMappingChange error:", error);
  }
}
