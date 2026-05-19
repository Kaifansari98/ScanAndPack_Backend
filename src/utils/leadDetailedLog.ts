type LeadDetailedLogDb = {
  leadMaster: {
    findFirst: (args: any) => Promise<{ status_id: number | null } | null>;
  };
  leadDetailedLogs: {
    create: (args: any) => Promise<any>;
  };
};

interface CreateLeadLogParams {
  vendor_id: number;
  lead_id: number;
  account_id: number;
  action: string;
  action_type: "CREATE" | "UPDATE" | "DELETE" | "UPLOAD" | "STATUS_CHANGE";
  created_by: number;
  created_at?: Date;
  history_type?: "Lead" | "Task" | "FollowUp";
  stage_id?: number; // if already known, skips the lookup
}

/**
 * Creates a LeadDetailedLogs entry, automatically resolving stage_id from
 * LeadMaster.status_id when not explicitly provided.
 *
 * Pass either `prisma` or a transaction client (`tx`) as the first argument —
 * both have the same API so the lookup stays within the same transaction.
 */
export async function createLeadLog(
  db: LeadDetailedLogDb,
  params: CreateLeadLogParams,
) {
  const {
    vendor_id,
    lead_id,
    account_id,
    action,
    action_type,
    created_by,
    created_at,
    history_type,
    stage_id: providedStageId,
  } = params;

  let stage_id = providedStageId;

  if (stage_id == null) {
    const lead = await db.leadMaster.findFirst({
      where: { id: lead_id },
      select: { status_id: true },
    });
    stage_id = lead?.status_id ?? undefined;
  }

  return db.leadDetailedLogs.create({
    data: {
      vendor_id,
      lead_id,
      account_id,
      action,
      action_type,
      created_by,
      ...(created_at != null && { created_at }),
      ...(history_type != null && { history_type }),
      ...(stage_id != null && { stage_id }),
    },
  });
}
