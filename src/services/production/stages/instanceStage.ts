import { Prisma } from "../../../prisma/generated";

export function instanceStageEligibility(tag: string): Prisma.LeadProductStructureInstanceWhereInput {
  const stage = Number(tag.replace(/type/i, "").trim());
  if (stage === 9 || stage === 10) {
    return {
      is_archived: false,
      is_tech_check_completed: true,
      ...(stage === 10 ? { is_order_login_completed: true } : {}),
      AND: [
        ...(stage === 9 ? [{ OR: [{ is_order_login_completed: false }, { is_order_login_completed: null }] }] : []),
        { OR: [{ stage_status_id: null }, { stageStatus: { tag: { in: ["Type 8", "Type 9", "Type 10"] } } }] },
      ],
    };
  }
  return { is_archived: false, stageStatus: { tag: `Type ${stage}` } };
}

// Instance stages replace the lead status gate, while all caller ownership,
// franchise, activity and search filters still apply to the resulting leads.
export function instanceAwareStageWhere(
  largeScale: boolean, tag: string, statusIds: number[],
): Prisma.LeadMasterWhereInput {
  const stage = Number(tag.replace(/type/i, "").trim());
  if (!largeScale || stage < 9 || stage > 17 || !Number.isFinite(stage)) {
    return { status_id: { in: statusIds } };
  }
  const eligibility = instanceStageEligibility(tag);
  return { AND: [{ OR: [
    { productStructureInstances: { some: { AND: [eligibility, { stage_status_id: { not: null } }] } } },
    { status_id: { in: statusIds }, productStructureInstances: { some: {
      AND: [stage <= 10 ? eligibility : { is_archived: false }, { stage_status_id: null }],
    } } },
    ...(stage >= 11 ? [{ status_id: { in: statusIds }, productStructureInstances: { none: {} } }] : []),
  ] }] };
}
