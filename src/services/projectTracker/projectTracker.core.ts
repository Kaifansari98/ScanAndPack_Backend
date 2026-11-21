import { prisma } from "../../prisma/client";
import { ProjectTrackerStageKey } from "../../prisma/generated";
import { generateSignedUrl } from "../../utils/wasabiClient";

// Client Project Tracker, shared by the client app and the CRM.
//
// Progress comes from the CRM: the lead's stage (StatusTypeMaster "Type N")
// and, for large-scale vendors, each item's own stage. Booking-level stages
// are complete when every active item has passed them. The tracker tables add
// only what the CRM lacks: expected dates with approved revisions, On Hold /
// Delayed details, client remarks and published updates.

export type TrackerStatus = "PENDING" | "IN_PROGRESS" | "ON_HOLD" | "DELAYED" | "COMPLETED";

export const STAGES: {
  key: ProjectTrackerStageKey;
  name: string;
  description: string;
  department: string;
  // CRM stage tags ("Type N") that belong to this client stage.
  tags: number[];
  // Items move through this stage separately.
  itemLevel: boolean;
}[] = [
  { key: "BOOKING", name: "Booking confirmed", description: "Your booking and advance are confirmed.", department: "Sales", tags: [4], itemLevel: false },
  { key: "FINAL_MEASUREMENT", name: "Final measurement", description: "Our team takes the final site measurements so the designs match your walls exactly.", department: "Site team", tags: [5], itemLevel: false },
  { key: "TECH_CHECK", name: "TechCheck & order login", description: "Your designs pass our technical check and the order is logged for the factory.", department: "Technical team", tags: [6, 7, 8, 9], itemLevel: false },
  { key: "PRODUCTION", name: "Production", description: "Your furniture is being manufactured at our factory to the approved designs.", department: "Production", tags: [10], itemLevel: true },
  { key: "DISPATCH", name: "Dispatch", description: "Your furniture is packed, the delivery is planned and it leaves our factory.", department: "Dispatch", tags: [11, 12, 13, 14], itemLevel: true },
  { key: "DELIVERY", name: "Delivery at site", description: "Your furniture is on its way and reaches your site.", department: "Dispatch", tags: [], itemLevel: true },
  { key: "INSTALLATION", name: "Installation", description: "Our installation team fits everything at your site.", department: "Installation team", tags: [15], itemLevel: true },
  { key: "HANDOVER", name: "Handover", description: "Final inspection and handover of your finished project.", department: "Site team", tags: [16, 17], itemLevel: false },
];

export const STAGE_KEYS = STAGES.map((s) => s.key);
const DONE = STAGES.length;

export const tagNumber = (tag: string | null | undefined) => {
  const n = Number(String(tag ?? "").replace(/\D/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// Index of the client stage an item is in (DONE once handed over).
function position(tag: number, dispatched: boolean, handedOver: boolean) {
  if (handedOver || tag >= 17) return DONE;
  if (tag >= 16) return 7;
  if (tag >= 15) return 6;
  if (tag >= 14) return dispatched ? 5 : 4;
  if (tag >= 11) return 4;
  if (tag >= 10) return 3;
  if (tag >= 6) return 2;
  return tag >= 4 ? 1 : 0;
}

export const dateOnly = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const minDate = (dates: (Date | null | undefined)[]) =>
  dates.filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
const maxDate = (dates: (Date | null | undefined)[]) =>
  dates.filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

const FILE_URL_TTL_SECONDS = 60 * 60;
export const fileUrl = (key: string) => generateSignedUrl(key, FILE_URL_TTL_SECONDS, "inline");

export class TrackerError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
  }
}

/** Builds the tracker for one booking. `staff` adds internal-only fields. */
export async function buildTracker(leadId: number, vendorId: number, opts: { staff?: boolean } = {}) {
  const lead = await prisma.leadMaster.findFirst({
    where: { id: leadId, vendor_id: vendorId, is_deleted: false },
    select: {
      id: true,
      vendor_id: true,
      lead_code: true,
      firstname: true,
      lastname: true,
      site_address: true,
      statusType: { select: { tag: true } },
      dispatch_date: true,
      required_date_for_dispatch: true,
      actual_installation_start_date: true,
      expected_installation_end_date: true,
      final_handover_marked_at: true,
      productMappings: {
        where: { is_archived: false },
        select: { productType: { select: { type: true } } },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!lead) throw new TrackerError("Project not found.", 404);

  const [instances, leadLogs, rows] = await Promise.all([
    prisma.leadProductStructureInstance.findMany({
      where: { lead_id: lead.id, is_archived: false, status: { in: ["open", "onHold"] } },
      select: {
        id: true,
        title: true,
        stageStatus: { select: { tag: true } },
        production_erd_date: true,
        production_completed_at: true,
        required_date_for_dispatch: true,
        dispatch_date: true,
        actual_installation_start_date: true,
        expected_installation_end_date: true,
      },
      orderBy: [{ product_type_id: "asc" }, { product_structure_id: "asc" }, { quantity_index: "asc" }],
    }),
    prisma.leadStatusLogs.findMany({
      where: { lead_id: lead.id },
      select: { created_at: true, statusType: { select: { tag: true } } },
      orderBy: { created_at: "asc" },
    }),
    prisma.projectTrackerStage.findMany({ where: { lead_id: lead.id } }),
  ]);
  const history = instances.length
    ? await prisma.instanceStageHistory.findMany({
        where: { instance_id: { in: instances.map((i) => i.id) } },
        select: { created_at: true, toStatus: { select: { tag: true } } },
        orderBy: { created_at: "asc" },
      })
    : [];

  // First time the project reached each CRM stage.
  const reached = new Map<number, Date>();
  for (const log of [...leadLogs.map((l) => ({ at: l.created_at, tag: l.statusType.tag })), ...history.map((h) => ({ at: h.created_at, tag: h.toStatus.tag }))]) {
    const n = tagNumber(log.tag);
    const seen = reached.get(n);
    if (n && (!seen || log.at < seen)) reached.set(n, log.at);
  }

  const leadTag = tagNumber(lead.statusType?.tag);
  const handedOver = !!lead.final_handover_marked_at;
  const items = instances.map((i) => {
    const tag = tagNumber(i.stageStatus?.tag) || leadTag;
    return {
      id: i.id,
      title: i.title,
      position: position(tag, !!(i.dispatch_date ?? lead.dispatch_date), handedOver),
    };
  });
  const current = items.length
    ? Math.min(...items.map((i) => i.position))
    : position(leadTag, !!lead.dispatch_date, handedOver);
  const completed = current >= DONE;

  const rowOf = new Map(rows.map((r) => [r.stage, r]));
  // Expected dates the CRM already records.
  const crmExpected: Partial<Record<ProjectTrackerStageKey, Date | null>> = {
    PRODUCTION: maxDate(instances.map((i) => i.production_erd_date)),
    DISPATCH: lead.required_date_for_dispatch ?? maxDate(instances.map((i) => i.required_date_for_dispatch)),
    INSTALLATION: lead.expected_installation_end_date ?? maxDate(instances.map((i) => i.expected_installation_end_date)),
  };

  // The first expected date is frozen as the original commitment.
  const freeze = STAGES.filter((s) => crmExpected[s.key] && !rowOf.get(s.key)?.original_expected_date);
  for (const s of freeze) {
    const row = await prisma.projectTrackerStage.upsert({
      where: { lead_id_stage: { lead_id: lead.id, stage: s.key } },
      create: { vendor_id: vendorId, lead_id: lead.id, stage: s.key, original_expected_date: crmExpected[s.key], original_set_at: new Date() },
      update: { original_expected_date: crmExpected[s.key], original_set_at: new Date() },
    });
    rowOf.set(s.key, row);
  }

  const stageStart = (i: number): Date | null => {
    const s = STAGES[i];
    if (s.key === "DELIVERY")
      return lead.dispatch_date ?? minDate(instances.map((x) => x.dispatch_date)) ?? reached.get(14) ?? null;
    if (s.key === "INSTALLATION")
      return lead.actual_installation_start_date ?? minDate(instances.map((x) => x.actual_installation_start_date)) ?? reached.get(15) ?? null;
    return minDate(s.tags.map((t) => reached.get(t)));
  };
  const stageEnd = (i: number): Date | null => {
    const key = STAGES[i].key;
    if (key === "HANDOVER") return lead.final_handover_marked_at ?? reached.get(17) ?? null;
    if (key === "PRODUCTION")
      return maxDate(instances.map((x) => x.production_completed_at)) ?? stageStart(i + 1);
    if (key === "BOOKING") return stageStart(0);
    return stageStart(i + 1);
  };

  const today = dateOnly(new Date())!;
  const stages = STAGES.map((s, i) => {
    const row = rowOf.get(s.key);
    const original = dateOnly(row?.original_expected_date);
    const latest = dateOnly(row?.approved_expected_date) ?? original;
    const status: TrackerStatus =
      i < current ? "COMPLETED" : i > current ? "PENDING" : row?.hold_status ?? "IN_PROGRESS";
    const itemStatus = (pos: number): TrackerStatus =>
      pos > i ? "COMPLETED" : pos < i ? "PENDING" : i === current && row?.hold_status ? row.hold_status : "IN_PROGRESS";
    return {
      key: s.key,
      name: s.name,
      status,
      started_at: i <= current ? stageStart(i)?.toISOString() ?? null : null,
      completed_at: i < current ? stageEnd(i)?.toISOString() ?? null : null,
      original_expected_date: original,
      latest_expected_date: latest,
      revised: !!row?.approved_expected_date && row.approved_expected_date.getTime() !== row.original_expected_date?.getTime(),
      // Items move separately here; show each one once the stage is reached.
      items:
        s.itemLevel && items.length > 1 && i <= current
          ? items.map((it) => ({ id: it.id, title: it.title, status: itemStatus(it.position) }))
          : null,
      ...(opts.staff
        ? { overdue: status !== "COMPLETED" && status !== "PENDING" && !!latest && latest < today }
        : {}),
    };
  });

  const currentStage = completed ? null : stages[current];
  const currentRow = currentStage ? rowOf.get(currentStage.key) : undefined;
  const commitment = (key: ProjectTrackerStageKey) => stages.find((s) => s.key === key);
  const finalStage = [commitment("HANDOVER"), commitment("INSTALLATION")].find((s) => s?.latest_expected_date);

  return {
    lead,
    instances,
    rows: rowOf,
    completed,
    currentIndex: current,
    view: {
      project: {
        lead_id: lead.id,
        lead_code: lead.lead_code,
        name: projectName(lead.productMappings.map((m) => m.productType.type)),
        client_name: `${lead.firstname} ${lead.lastname}`.trim(),
        site_address: lead.site_address,
        completed,
        completed_at: completed ? stages[DONE - 1].completed_at : null,
        milestones_completed: Math.min(current, DONE),
        milestones_total: DONE,
      },
      expected_completion: {
        original: finalStage?.original_expected_date ?? null,
        latest: finalStage?.latest_expected_date ?? null,
      },
      current: currentStage
        ? {
            ...currentStage,
            description: STAGES[current].description,
            department: STAGES[current].department,
            remark: currentRow?.client_remark ?? null,
            remark_at: currentRow?.client_remark_at?.toISOString() ?? null,
            hold: currentRow?.hold_status
              ? {
                  status: currentRow.hold_status,
                  reason: currentRow.hold_reason,
                  action: currentRow.hold_action,
                  resume_date: dateOnly(currentRow.hold_resume_date),
                  since: currentRow.hold_since?.toISOString() ?? null,
                }
              : null,
          }
        : null,
      stages,
    },
  };
}

function projectName(types: string[]) {
  if (types.length === 0) return "Your project";
  if (types.length <= 2) return types.join(" & ");
  return `${types.slice(0, 2).join(", ")} +${types.length - 2} more`;
}

/**
 * Published updates, newest first: staff updates plus the stage milestones
 * the CRM recorded, so the history is complete without extra data entry.
 */
export async function trackerUpdates(
  tracker: Awaited<ReturnType<typeof buildTracker>>,
  opts: { limit?: number; withNames?: boolean } = {},
) {
  const updates = await prisma.projectTrackerUpdate.findMany({
    where: { lead_id: tracker.lead.id },
    include: { files: { orderBy: { id: "asc" } } },
    orderBy: { published_at: "desc" },
    take: opts.limit,
  });
  const names = opts.withNames ? await userNames(updates.map((u) => u.published_by)) : new Map<number, string>();

  const published = await Promise.all(
    updates.map(async (u) => ({
      id: `u${u.id}`,
      kind: u.kind,
      stage: u.stage,
      stage_name: STAGES.find((s) => s.key === u.stage)!.name,
      title: u.title,
      description: u.description,
      at: u.published_at.toISOString(),
      ...(opts.withNames ? { published_by: names.get(u.published_by) ?? null } : {}),
      files: await Promise.all(
        u.files.map(async (f) => ({
          id: f.id,
          name: f.original_name,
          media_type: f.media_type,
          url: await fileUrl(f.storage_key),
        })),
      ),
    })),
  );

  const milestones = tracker.view.stages.flatMap((s) => {
    const events = [];
    if (s.started_at && s.key !== "BOOKING")
      events.push({
        id: `start-${s.key}`,
        title: s.key === "DELIVERY" ? "Dispatched from our factory" : `${s.name} started`,
        at: s.started_at,
        stage: s.key,
      });
    if (s.key === "BOOKING" && s.completed_at)
      events.push({ id: "done-BOOKING", title: "Booking confirmed", at: s.completed_at, stage: s.key });
    if (s.key === "HANDOVER" && s.completed_at)
      events.push({ id: "done-HANDOVER", title: "Project handed over", at: s.completed_at, stage: s.key });
    return events;
  });

  return [
    ...published,
    ...milestones.map((m) => ({
      id: m.id,
      kind: "MILESTONE",
      stage: m.stage,
      stage_name: STAGES.find((s) => s.key === m.stage)!.name,
      title: m.title,
      description: null,
      at: m.at,
      files: [],
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, opts.limit);
}

export async function userNames(ids: (number | null | undefined)[]) {
  const unique = [...new Set(ids.filter((id): id is number => !!id))];
  if (!unique.length) return new Map<number, string>();
  const users = await prisma.userMaster.findMany({
    where: { id: { in: unique } },
    select: { id: true, user_name: true },
  });
  return new Map(users.map((u) => [u.id, u.user_name]));
}
