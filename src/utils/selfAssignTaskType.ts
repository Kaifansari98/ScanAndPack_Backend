export const validateSelfAssignTask = async ({
  tx,
  vendorId,
  taskType,
  assigneeUserId,
  createdBy,
}: {
  tx: any;
  vendorId: number;
  taskType: string;
  assigneeUserId: number;
  createdBy: number;
}) => {
  const creator = await tx.userMaster.findUnique({
    where: { id: createdBy },
    select: { id: true, vendor_id: true, user_type_id: true },
  });

  if (!creator) {
    throw new Error(`Creator user ${createdBy} not found`);
  }

  if (creator.vendor_id !== vendorId) {
    throw new Error(
      `Creator user ${createdBy} does not belong to vendor ${vendorId}`,
    );
  }

  const selfAssignTaskType = await tx.selfAssignTaskTypeMaster.findFirst({
    where: {
      vendor_id: vendorId,
      user_type_id: creator.user_type_id,
      type: taskType,
    },
    select: { id: true },
  });

  if (selfAssignTaskType && assigneeUserId !== createdBy) {
    throw new Error("This task type can only be assigned to yourself");
  }

  return !!selfAssignTaskType;
};
