type LeadDetailedLogDb = {
  leadMaster: {
    findFirst: (args: any) => Promise<{ status_id: number | null; statusType?: { tag: string } | null } | null>;
  };
  leadProductStructureInstance: {
    count: (args: any) => Promise<number>;
    findFirst: (args: any) => Promise<{ is_tech_check_completed: boolean | null; is_order_login_completed: boolean | null } | null>;
  };
  statusTypeMaster: {
    findFirst: (args: any) => Promise<{ id: number } | null>;
  };
  leadDetailedLogs: {
    create: (args: any) => Promise<any>;
  };
};

interface CreateLeadLogParams {
  vendor_id: number;
  lead_id: number;
  account_id: number;
  task_id?: number;
  action: string;
  action_type: "CREATE" | "UPDATE" | "DELETE" | "UPLOAD" | "STATUS_CHANGE";
  created_by: number;
  created_at?: Date;
  history_type?: "Lead" | "Task" | "FollowUp" | "Approval";
  stage_id?: number;   // if provided, skips all resolution logic
  instance_id?: number; // used to resolve Type 9 / Type 10 when multi-instance
}

const MULTI_INSTANCE_STAGE_TAGS = new Set(["Type 8", "Type 9", "Type 10"]);

/**
 * Creates a LeadDetailedLogs entry, automatically resolving stage_id.
 *
 * Standard path: reads LeadMaster.status_id.
 *
 * Multi-instance override (Type 8 / Type 9 / Type 10 only):
 *   When the lead currently sits at one of those tags AND has more than one
 *   LeadProductStructureInstance, the supplied instance_id is inspected:
 *     - is_tech_check_completed = true  → stage resolves to Type 9
 *     - is_order_login_completed = true → stage resolves to Type 10 (wins over Type 9)
 *
 * Pass either `prisma` or a transaction client (`tx`) as the first argument.
 */
export async function createLeadLog(
  db: LeadDetailedLogDb,
  params: CreateLeadLogParams,
) {
  const {
    vendor_id,
    lead_id,
    account_id,
    task_id,
    action,
    action_type,
    created_by,
    created_at,
    history_type,
    stage_id: providedStageId,
    instance_id,
  } = params;

  let stage_id = providedStageId;

  if (stage_id == null) {
    // Always fetch the current lead status first
    const lead = await db.leadMaster.findFirst({
      where: { id: lead_id },
      select: {
        status_id: true,
        statusType: { select: { tag: true } },
      },
    });

    stage_id = lead?.status_id ?? undefined;
    const currentTag = lead?.statusType?.tag ?? null;

    // Multi-instance override: only for Type 8 / Type 9 / Type 10
    if (
      instance_id != null &&
      currentTag != null &&
      MULTI_INSTANCE_STAGE_TAGS.has(currentTag)
    ) {
      const instanceCount = await db.leadProductStructureInstance.count({
        where: { lead_id, vendor_id },
      });

      if (instanceCount > 1) {
        const instance = await db.leadProductStructureInstance.findFirst({
          where: { id: instance_id },
          select: {
            is_tech_check_completed: true,
            is_order_login_completed: true,
          },
        });

        if (instance) {
          // Type 10 takes precedence over Type 9
          const targetTag =
            instance.is_order_login_completed === true
              ? "Type 10"
              : instance.is_tech_check_completed === true
              ? "Type 9"
              : null;

          if (targetTag) {
            const status = await db.statusTypeMaster.findFirst({
              where: { vendor_id, tag: targetTag },
              select: { id: true },
            });
            if (status) stage_id = status.id;
          }
        }
      }
    }
  }

  return db.leadDetailedLogs.create({
    data: {
      vendor_id,
      lead_id,
      account_id,
      ...(task_id != null && { task_id }),
      action,
      action_type,
      created_by,
      ...(created_at != null && { created_at }),
      ...(history_type != null && { history_type }),
      ...(stage_id != null && { stage_id }),
    },
  });
}
