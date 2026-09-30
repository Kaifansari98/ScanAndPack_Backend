type LeadStatusLogDb = {
  leadStatusLogs: {
    findFirst: (args: any) => Promise<{ created_at: Date } | null>;
    create: (args: any) => Promise<any>;
  };
};

interface EnsureLeadStatusLogParams {
  vendorId: number;
  leadId: number;
  accountId: number | null | undefined;
  statusId: number | null | undefined;
  createdBy: number;
  createdAt?: Date;
}

export async function ensureLeadStatusLog(
  db: LeadStatusLogDb,
  params: EnsureLeadStatusLogParams,
) {
  const {
    vendorId,
    leadId,
    accountId,
    statusId,
    createdBy,
    createdAt = new Date(),
  } = params;

  if (!accountId || !statusId) {
    return null;
  }

  const existingLog = await db.leadStatusLogs.findFirst({
    where: {
      vendor_id: vendorId,
      lead_id: leadId,
      account_id: accountId,
      status_id: statusId,
      created_by: createdBy,
    },
    select: { created_at: true },
    orderBy: { created_at: "desc" },
  });

  if (existingLog) {
    const diffMs = Math.abs(createdAt.getTime() - existingLog.created_at.getTime());
    if (diffMs <= 10_000) {
      return existingLog;
    }
  }

  return db.leadStatusLogs.create({
    data: {
      vendor_id: vendorId,
      lead_id: leadId,
      account_id: accountId,
      status_id: statusId,
      created_by: createdBy,
      created_at: createdAt,
    },
  });
}
