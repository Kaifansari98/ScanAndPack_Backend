import { prisma } from "../../prisma/client";
import type { Prisma } from "../../../generated/prisma_client/client";
import bcrypt from "bcryptjs";
import { redis } from "../../config/redis";

const sessionCacheKey = (sessionId: number) => `auth:session:${sessionId}`;
const vendorSessionsKey = (vendorId: number) => `auth:vendor-sessions:${vendorId}`;

const ensureCustomUserPrivilegeMappings = async (
  vendorId: number,
  userId: number,
) => {
  const activePrivileges = await prisma.privilegeMaster.findMany({
    where: {
      vendor_id: vendorId,
      is_active: true,
    },
    select: {
      id: true,
    },
  });

  if (activePrivileges.length === 0) return;

  await prisma.userPrivilegeMapping.createMany({
    data: activePrivileges.map((privilege) => ({
      vendor_id: vendorId,
      user_id: userId,
      privilege_id: privilege.id,
      is_allowed: false,
    })),
    skipDuplicates: true,
  });
};

const revokeUserActiveSessionsForPrivilegeChange = async (
  vendorId: number,
  userId: number,
) => {
  const now = new Date();

  const activeSessions = await prisma.userSession.findMany({
    where: {
      vendor_id: vendorId,
      user_id: userId,
      status: "active",
    },
    select: {
      id: true,
    },
  });

  if (activeSessions.length === 0) return 0;

  await prisma.userSession.updateMany({
    where: {
      vendor_id: vendorId,
      user_id: userId,
      status: "active",
    },
    data: {
      status: "revoked",
      is_current: false,
      revoked_at: now,
      revoke_reason: "User privileges updated",
      last_seen_at: now,
    },
  });

  try {
    await redis.del(activeSessions.map((session: { id: number }) => sessionCacheKey(session.id)));
    await redis.sRem(
      vendorSessionsKey(vendorId),
      activeSessions.map((session: { id: number }) => String(session.id)),
    );
  } catch (error) {
    console.error("Failed to evict user session cache after privilege update:", error);
  }

  return activeSessions.length;
};

const revokeUserActiveSessions = async (
  vendorId: number,
  userId: number,
  reason: string = "Password changed",
) => {
  const now = new Date();

  const activeSessions = await prisma.userSession.findMany({
    where: {
      vendor_id: vendorId,
      user_id: userId,
      status: "active",
    },
    select: {
      id: true,
    },
  });

  if (activeSessions.length === 0) return 0;

  await prisma.userSession.updateMany({
    where: {
      vendor_id: vendorId,
      user_id: userId,
      status: "active",
    },
    data: {
      status: "revoked",
      is_current: false,
      revoked_at: now,
      revoke_reason: reason,
      last_seen_at: now,
    },
  });

  try {
    await redis.del(activeSessions.map((session: { id: number }) => sessionCacheKey(session.id)));
    await redis.sRem(
      vendorSessionsKey(vendorId),
      activeSessions.map((session: { id: number }) => String(session.id)),
    );
  } catch (error) {
    console.error("Failed to evict user session cache after password reset:", error);
  }

  return activeSessions.length;
};

const validateUserFranchises = async (vendorId: number, input: unknown): Promise<number[]> => {
  if (!Array.isArray(input) || input.length === 0 ||
      input.some((id) => typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0)) {
    throw Object.assign(new Error("Select at least one valid franchise."), { statusCode: 400 });
  }
  const ids = [...new Set(input as number[])];
  const count = await prisma.franchiseMaster.count({
    where: { vendor_id: vendorId, id: { in: ids } },
  });
  if (count !== ids.length) {
    throw Object.assign(new Error("Invalid franchise selection for the given vendor."), { statusCode: 400 });
  }
  return ids;
};

const syncUserFranchises = async (
  tx: Prisma.TransactionClient, vendorId: number, userId: number,
  ids: number[], actorId?: number,
) => {
  const mappedIds = ids.length > 1 ? ids : [];
  await tx.siteSupervisorFranchiseMapping.deleteMany({
    where: { vendor_id: vendorId, supervisor_id: userId,
      ...(mappedIds.length ? { franchise_id: { notIn: mappedIds } } : {}) },
  });
  for (const franchiseId of mappedIds) {
    await tx.siteSupervisorFranchiseMapping.upsert({
      where: { vendor_supervisor_franchise_unique: {
        vendor_id: vendorId, supervisor_id: userId, franchise_id: franchiseId,
      } },
      create: { vendor_id: vendorId, supervisor_id: userId, franchise_id: franchiseId,
        created_by: actorId, updated_by: actorId },
      update: { updated_by: actorId },
    });
  }
};

const requireSupervisorConfirmation = async (
  vendorId: number, franchiseIds: number[], userType: string,
  confirmed: unknown, excludeUserId?: number,
) => {
  if (confirmed === true || userType.trim().toLowerCase().replace(/[ _]+/g, "-") !== "site-supervisor") return;

  const supervisorWhere = {
    vendor_id: vendorId,
    ...(excludeUserId === undefined ? {} : { id: { not: excludeUserId } }),
    user_type: { user_type: { in: ["site-supervisor", "site supervisor", "site_supervisor"], mode: "insensitive" as const } },
  };
  const franchises = await prisma.franchiseMaster.findMany({
    where: {
      vendor_id: vendorId,
      id: { in: franchiseIds },
      OR: [
        { users: { some: supervisorWhere } },
        { siteSupervisorFranchiseMappings: { some: {
          vendor_id: vendorId, supervisor: supervisorWhere,
        } } },
      ],
    },
    select: { id: true, franchise_name: true },
    orderBy: { franchise_name: "asc" },
  });
  if (franchises.length) {
    throw Object.assign(new Error("Selected franchises already have a site supervisor. Confirm to add another."), {
      statusCode: 409,
      code: "SUPERVISOR_CONFIRMATION_REQUIRED",
      franchises,
    });
  }
};

const assignFranchiseLeadsToSupervisor = async (
  tx: Prisma.TransactionClient, vendorId: number, userId: number,
  franchiseIds: number[], actorId: number,
  removedFranchiseIds: number[] = [],
) => {
  const vendor = await tx.vendorMaster.findUnique({
    where: { id: vendorId },
    select: { handlesLargeScaleProjects: true },
  });
  if (vendor?.handlesLargeScaleProjects !== false) return;

  if (removedFranchiseIds.length) {
    const leadScope = {
      vendor_id: vendorId,
      franchise_id: { in: removedFranchiseIds },
    };
    await tx.leadUserMapping.updateMany({
      where: {
        vendor_id: vendorId, user_id: userId, type: "site-supervisor",
        status: "active", lead: leadScope,
      },
      data: { status: "inactive", updated_by: actorId },
    });
    // Prevent the task forms' legacy fallback from restoring a removed assignment.
    await tx.leadSiteSupervisorMapping.updateMany({
      where: { vendor_id: vendorId, user_id: userId, status: "active", lead: leadScope },
      data: { status: "inactive" },
    });
    await tx.leadChatMember.deleteMany({
      where: {
        user_id: userId,
        chatRoom: { vendor_id: vendorId, lead: leadScope },
      },
    });
    // Hand each removed franchise's leads and pending tasks to a remaining supervisor.
    for (const franchiseId of removedFranchiseIds) {
      const replacement = await tx.userMaster.findFirst({
        where: {
          vendor_id: vendorId, id: { not: userId }, status: "active",
          user_type: { user_type: { in: ["site-supervisor", "site supervisor", "site_supervisor"], mode: "insensitive" } },
          OR: [
            { franchise_id: franchiseId },
            { siteSupervisorFranchiseMappings: { some: { vendor_id: vendorId, franchise_id: franchiseId } } },
          ],
        },
        select: { id: true },
        orderBy: { id: "asc" },
      });
      if (!replacement) {
        const franchise = await tx.franchiseMaster.findUnique({ where: { id: franchiseId }, select: { franchise_name: true } });
        throw Object.assign(new Error(`Map another site supervisor to ${franchise?.franchise_name ?? "this franchise"} before removing it from this supervisor.`), { statusCode: 409 });
      }
      await assignFranchiseLeadsToSupervisor(tx, vendorId, replacement.id, [franchiseId], actorId);
    }
  }

  // LeadUserMapping requires an account; drafts without one cannot be mapped yet.
  // Process bounded batches to avoid oversized bulk inserts for large franchises.
  let cursor = 0;
  while (true) {
    const leads = await tx.leadMaster.findMany({
      where: {
        vendor_id: vendorId, franchise_id: { in: franchiseIds },
        is_deleted: false, account_id: { not: null }, id: { gt: cursor },
      },
      select: { id: true, account_id: true },
      orderBy: { id: "asc" },
      take: 500,
    });
    if (!leads.length) break;

    const scope = {
      vendor_id: vendorId, lead_id: { in: leads.map((lead) => lead.id) },
      type: "site-supervisor",
    };
    const existing = await tx.leadUserMapping.findMany({
      where: scope,
      select: { id: true, lead_id: true, user_id: true },
      orderBy: { id: "asc" },
    });
    // Retain one mapping per lead when the selected supervisor was assigned before.
    const retained = new Map<number, number>();
    const previousSupervisors = new Map<number, Set<number>>();
    for (const mapping of existing) {
      if (mapping.user_id === userId) {
        if (!retained.has(mapping.lead_id)) retained.set(mapping.lead_id, mapping.id);
      } else {
        const supervisors = previousSupervisors.get(mapping.lead_id) ?? new Set<number>();
        supervisors.add(mapping.user_id);
        previousSupervisors.set(mapping.lead_id, supervisors);
      }
    }
    await tx.leadUserMapping.updateMany({
      where: { ...scope, status: "active" },
      data: { status: "inactive", updated_by: actorId },
    });
    if (retained.size) {
      await tx.leadUserMapping.updateMany({
        where: { ...scope, user_id: userId, id: { in: [...retained.values()] } },
        data: { status: "active", updated_by: actorId },
      });
    }
    const unassigned = leads.filter((lead) => !retained.has(lead.id));
    if (unassigned.length) {
      await tx.leadUserMapping.createMany({
        data: unassigned.map((lead) => ({
          vendor_id: vendorId, lead_id: lead.id, account_id: lead.account_id!,
          user_id: userId, type: "site-supervisor", status: "active",
          created_by: actorId,
        })),
      });
    }
    const rooms = await tx.leadChatRoom.findMany({
      where: { vendor_id: vendorId, lead_id: scope.lead_id },
      select: { id: true, lead_id: true },
    });
    if (rooms.length) {
      const removals = rooms.flatMap((room) => {
        const supervisors = previousSupervisors.get(room.lead_id);
        return supervisors?.size
          ? [{ chat_room_id: room.id, user_id: { in: [...supervisors] } }]
          : [];
      });
      if (removals.length) {
        await tx.leadChatMember.deleteMany({ where: { OR: removals } });
      }
      await tx.leadChatMember.createMany({
        data: rooms.map((room) => ({
          chat_room_id: room.id, user_id: userId, added_by: actorId,
        })),
        skipDuplicates: true,
      });
    }
    cursor = leads[leads.length - 1].id;
  }

  // Pending site-supervisor tasks follow the lead to its new supervisor.
  await tx.userLeadTask.updateMany({
    where: {
      vendor_id: vendorId, user_id: { not: userId },
      status: { in: ["open", "in_progress"] },
      lead: { vendor_id: vendorId, franchise_id: { in: franchiseIds }, is_deleted: false },
      user: { user_type: { user_type: { in: ["site-supervisor", "site supervisor", "site_supervisor"], mode: "insensitive" } } },
    },
    data: { user_id: userId, updated_by: actorId },
  });
};

const getPhoneVariants = (identifier: string): string[] => {
  const trimmed = identifier.trim();
  const digitsOnly = trimmed.replace(/\D/g, "");
  const variants = new Set<string>();

  if (trimmed) variants.add(trimmed);
  if (digitsOnly) {
    variants.add(digitsOnly);
    if (digitsOnly.length === 10) {
      variants.add(`+91${digitsOnly}`);
      variants.add(`91${digitsOnly}`);
      variants.add(`0${digitsOnly}`);
      variants.add(`+91 ${digitsOnly}`);
      variants.add(`+91 ${digitsOnly.slice(0, 5)} ${digitsOnly.slice(5)}`);
    } else if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
      const national = digitsOnly.slice(2);
      variants.add(national);
      variants.add(`+${digitsOnly}`);
      variants.add(`+91${national}`);
      variants.add(`0${national}`);
      variants.add(`+91 ${national}`);
      variants.add(`+91 ${national.slice(0, 5)} ${national.slice(5)}`);
    } else if (digitsOnly.length === 11 && digitsOnly.startsWith("0")) {
      const national = digitsOnly.slice(1);
      variants.add(national);
      variants.add(`+91${national}`);
      variants.add(`91${national}`);
      variants.add(`+91 ${national}`);
      variants.add(`+91 ${national.slice(0, 5)} ${national.slice(5)}`);
    }
  }
  return Array.from(variants);
};


export const generateNextEmployeeCode = async (
  vendorId: number,
  client: any = prisma,
): Promise<string> => {
  const usersWithCode = await client.userMaster.findMany({
    where: {
      vendor_id: vendorId,
      employee_code: { startsWith: "EMP-" },
    },
    select: { employee_code: true },
  });

  let maxNum = 0;
  for (const u of usersWithCode) {
    if (u.employee_code) {
      const match = u.employee_code.trim().match(/^EMP-(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
  }

  return "EMP-" + String(maxNum + 1).padStart(3, "0");
};

export const ensureEmployeeCodesForVendor = async (
  vendorId: number,
  client: any = prisma,
): Promise<void> => {
  const unassignedUsers = await client.userMaster.findMany({
    where: {
      vendor_id: vendorId,
      OR: [{ employee_code: null }, { employee_code: "" }],
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  if (unassignedUsers.length === 0) return;

  const usersWithCode = await client.userMaster.findMany({
    where: {
      vendor_id: vendorId,
      employee_code: { startsWith: "EMP-" },
    },
    select: { employee_code: true },
  });

  let maxNum = 0;
  for (const u of usersWithCode) {
    if (u.employee_code) {
      const match = u.employee_code.trim().match(/^EMP-(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
  }

  for (const u of unassignedUsers) {
    maxNum++;
    const generatedCode = "EMP-" + String(maxNum).padStart(3, "0");
    await client.userMaster.update({
      where: { id: u.id },
      data: { employee_code: generatedCode },
    });
  }
};

export const createUserService = async (data: {
  vendor_id: number;
  franchise_id?: number;
  franchise_ids?: number[];
  confirm_additional_supervisor?: boolean;
  user_name: string;
  employee_code?: string | null;
  designation?: string | null;
  department?: string | null;
  aadhar_no?: string | null;
  pan_no?: string | null;
  permanent_address?: string | null;
  current_address?: string | null;
  aadhar_card_file?: string | null;
  pan_card_file?: string | null;
  bank_account_holder_name?: string | null;
  bank_account_number?: string | null;
  bank_ifsc_code?: string | null;
  bank_name?: string | null;
  bank_document_file?: string | null;
  joining_date?: string | Date | null;
  exit_date?: string | Date | null;
  salary_rate_type?: string | null;
  salary_amount?: string | null;
  statutory_compliance?: string | null;
  work_location?: string | null;
  user_contact: string;
  user_email: string;
  personal_email?: string | null;
  user_timezone: string;
  password: string;
  user_type_id: number;
  status?: string;
}, actorId?: number) => {
  const franchiseIds = await validateUserFranchises(Number(data.vendor_id),
    data.franchise_ids === undefined ? [data.franchise_id] : data.franchise_ids);
  const { franchise_ids: _franchiseIds, confirm_additional_supervisor, ...userData } = data;
  if (userData.employee_code) {
    userData.employee_code = typeof userData.employee_code === 'string' ? userData.employee_code.trim() : userData.employee_code;
    const existingCode = await prisma.userMaster.findFirst({
      where: {
        vendor_id: Number(data.vendor_id),
        employee_code: { equals: String(userData.employee_code).trim(), mode: "insensitive" },
      },
      select: { id: true, user_name: true },
    });
    if (existingCode) {
      const error = new Error(`Employee code "${userData.employee_code}" is already in use by user "${existingCode.user_name}".`);
      (error as any).statusCode = 409;
      throw error;
    }
  }

  if (data.user_contact) {
    const contactVariants = getPhoneVariants(data.user_contact);
    const existingContact = await prisma.userMaster.findFirst({
      where: { user_contact: { in: contactVariants } },
      select: { id: true, user_name: true },
    });
    if (existingContact) {
      const error = new Error(
        `Contact number "${data.user_contact}" is already registered to user "${existingContact.user_name}".`
      );
      (error as any).statusCode = 409;
      throw error;
    }
  }

  if (data.user_email) {
    const existingEmail = await prisma.userMaster.findFirst({
      where: { user_email: { equals: data.user_email.trim(), mode: "insensitive" } },
      select: { id: true, user_name: true },
    });
    if (existingEmail) {
      const error = new Error(
        `Email "${data.user_email}" is already registered to user "${existingEmail.user_name}".`
      );
      (error as any).statusCode = 409;
      throw error;
    }
  }

  const hashedPassword = await bcrypt.hash(data.password, 10);
  const userType = await prisma.userTypeMaster.findUnique({
    where: { id: Number(data.user_type_id) },
    select: { user_type: true },
  });

  if (!userType) {
    const error = new Error("Invalid user_type_id.");
    (error as any).statusCode = 400;
    throw error;
  }

  await requireSupervisorConfirmation(Number(data.vendor_id), franchiseIds, userType.user_type,
    confirm_additional_supervisor);

  const createdUser = await prisma.$transaction(async (tx) => {
    const vendor = await tx.vendorMaster.findUnique({
      where: { id: Number(data.vendor_id) },
      select: { is_hrms_master_enabled: true },
    });
    const isHrmsEnabled = vendor?.is_hrms_master_enabled === true;

    let employeeCode = userData.employee_code ? String(userData.employee_code).trim() : null;
    let effectiveEmail = userData.user_email ? String(userData.user_email).trim() : '';
    if (!effectiveEmail) {
      const cleanContact = userData.user_contact ? String(userData.user_contact).replace(/\D/g, '') : String(Date.now());
      effectiveEmail = `user_${cleanContact}@noemail.local`;
    }
    if (!employeeCode) {
      employeeCode = await generateNextEmployeeCode(Number(data.vendor_id), tx);
    }

    const joiningDate = userData.joining_date ? new Date(userData.joining_date) : null;
    const exitDate = userData.exit_date ? new Date(userData.exit_date) : null;
    const contractStartDate = userData.contract_start_date ? new Date(userData.contract_start_date) : null;
    const contractEndDate = userData.contract_end_date ? new Date(userData.contract_end_date) : null;

    const user = await tx.userMaster.create({
      data: {
        ...userData,
        user_email: effectiveEmail,
        joining_date: joiningDate,
        exit_date: exitDate,
        employee_type: userData.employee_type || "permanent",
        contract_start_date: contractStartDate,
        contract_end_date: contractEndDate,
        employee_code: employeeCode,
        franchise_id: franchiseIds[0],
        password: hashedPassword,
      },
    });

    if (isHrmsEnabled) {
      if (userData.aadhar_card_file || userData.aadhar_no) {
        await tx.userDocument.create({
          data: {
            user_id: user.id,
            document_name: "Aadhar Card",
            document_number: userData.aadhar_no || "",
            filename: userData.aadhar_card_file || "",
          },
        });
      }

      if (userData.pan_card_file || userData.pan_no) {
        await tx.userDocument.create({
          data: {
            user_id: user.id,
            document_name: "Pan Card",
            document_number: userData.pan_no || "",
            filename: userData.pan_card_file || "",
          },
        });
      }

      if (userData.bank_document_file) {
        await tx.userDocument.create({
          data: {
            user_id: user.id,
            document_name: "Bank Document",
            document_number: userData.bank_account_number || "",
            filename: userData.bank_document_file || "",
          },
        });
      }
    }
    await syncUserFranchises(tx, user.vendor_id, user.id, franchiseIds, actorId);
    if (userType.user_type.trim().toLowerCase().replace(/[ _]+/g, "-") === "site-supervisor") {
      await assignFranchiseLeadsToSupervisor(tx, user.vendor_id, user.id, franchiseIds, actorId ?? user.id);
    }
    return user;
  });

  if (userType.user_type.trim().toLowerCase() === "custom") {
    await ensureCustomUserPrivilegeMappings(
      Number(data.vendor_id),
      createdUser.id,
    );
  }

  return createdUser;
};

export const MasterResetPasswordService = async ({
  user_id,
  new_password,
}: {
  user_id: number;
  new_password: string;
}) => {
  // 1️⃣ Check if user exists
  const user = await prisma.userMaster.findUnique({
    where: { id: user_id },
    select: { id: true, vendor_id: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  // 2️⃣ Hash new password
  const hashedPassword = await bcrypt.hash(new_password, 10);

  // 3️⃣ Update password
  await prisma.userMaster.update({
    where: { id: user_id },
    data: {
      password: hashedPassword,
      updated_at: new Date(),
    },
  });

  // 4️⃣ Revoke all active sessions
  await revokeUserActiveSessions(user.vendor_id, user.id);

  return { message: "Password reset successfully" };
};

export const updateUserService = async (
  userId: number,
  data: {
    user_name?: string;
    employee_type?: string | null;
    employee_code?: string | null;
    contract_start_date?: string | Date | null;
    contract_end_date?: string | Date | null;
    designation?: string | null;
    department?: string | null;
    aadhar_no?: string | null;
    pan_no?: string | null;
    permanent_address?: string | null;
    current_address?: string | null;
    aadhar_card_file?: string | null;
    pan_card_file?: string | null;
    bank_account_holder_name?: string | null;
      bank_account_number?: string | null;
      bank_ifsc_code?: string | null;
      bank_name?: string | null;
      bank_document_file?: string | null;
      joining_date?: string | Date | null;
      exit_date?: string | Date | null;
      salary_rate_type?: string | null;
      salary_amount?: string | null;
      statutory_compliance?: string | null;
      work_location?: string | null;
    user_contact?: string;
    user_email?: string;
    user_timezone?: string;
    password?: string;
    user_type_id?: number;
    franchise_id?: number | null;
    franchise_ids?: number[];
    confirm_additional_supervisor?: boolean;
    status?: string;
  },
  actorId?: number,
) => {
  const user = await prisma.userMaster.findUnique({
    where: { id: userId },
    select: {
      id: true, vendor_id: true, franchise_id: true, user_type_id: true, employee_code: true,
      siteSupervisorFranchiseMappings: { select: { franchise_id: true } },
    },
  });

  if (!user) {
    const error = new Error("User not found");
    (error as any).statusCode = 404;
    throw error;
  }

  const updateData: Record<string, any> = {};

  if (data.user_name !== undefined) updateData.user_name = data.user_name;
  if (data.employee_type !== undefined) updateData.employee_type = data.employee_type || "permanent";
  if (data.contract_start_date !== undefined) updateData.contract_start_date = data.contract_start_date ? new Date(data.contract_start_date) : null;
  if (data.contract_end_date !== undefined) updateData.contract_end_date = data.contract_end_date ? new Date(data.contract_end_date) : null;
  if (data.employee_code !== undefined) {
    updateData.employee_code = data.employee_code ? data.employee_code.trim() : null;
  }
  if (!updateData.employee_code && !user.employee_code) {
    updateData.employee_code = await generateNextEmployeeCode(user.vendor_id, prisma);
  }
  if (data.designation !== undefined) updateData.designation = data.designation;
  if (data.user_contact !== undefined) {
    const contactVariants = getPhoneVariants(data.user_contact);
    const existingContact = await prisma.userMaster.findFirst({
      where: {
        user_contact: { in: contactVariants },
        NOT: { id: userId },
      },
      select: { id: true, user_name: true, user_contact: true },
    });
    if (existingContact) {
      const error = new Error(
        `Contact number "${data.user_contact}" is already in use by another user`
      );
      (error as any).statusCode = 409;
      throw error;
    }
    updateData.user_contact = data.user_contact;
  }
  if (data.personal_email !== undefined) updateData.personal_email = data.personal_email ? data.personal_email.trim() : null;
  if (data.user_email !== undefined) {
    const existingEmail = await prisma.userMaster.findFirst({
      where: {
        user_email: { equals: data.user_email.trim(), mode: "insensitive" },
        NOT: { id: userId },
      },
      select: { id: true, user_name: true, user_email: true },
    });
    if (existingEmail) {
      const error = new Error(
        `Email "${data.user_email}" is already in use by user "${existingEmail.user_name}".`
      );
      (error as any).statusCode = 409;
      throw error;
    }
    updateData.user_email = data.user_email.trim();
  }
  if (data.user_timezone !== undefined) updateData.user_timezone = data.user_timezone;
  if (data.user_type_id !== undefined) updateData.user_type_id = data.user_type_id;
  const franchiseIds = data.franchise_ids !== undefined || data.franchise_id !== undefined
    ? await validateUserFranchises(user.vendor_id,
        data.franchise_ids === undefined ? [data.franchise_id] : data.franchise_ids)
    : undefined;
  if (franchiseIds) updateData.franchise_id = franchiseIds[0];
  if (data.status !== undefined) updateData.status = data.status;
  if (data.department !== undefined) updateData.department = data.department;
  if (data.aadhar_no !== undefined) updateData.aadhar_no = data.aadhar_no;
  if (data.pan_no !== undefined) updateData.pan_no = data.pan_no;
  if (data.permanent_address !== undefined) updateData.permanent_address = data.permanent_address;
  if (data.current_address !== undefined) updateData.current_address = data.current_address;
  if (data.aadhar_card_file !== undefined) updateData.aadhar_card_file = data.aadhar_card_file;
  if (data.pan_card_file !== undefined) updateData.pan_card_file = data.pan_card_file;
  if (data.bank_account_holder_name !== undefined) updateData.bank_account_holder_name = data.bank_account_holder_name;
  if (data.bank_account_number !== undefined) updateData.bank_account_number = data.bank_account_number;
  if (data.bank_ifsc_code !== undefined) updateData.bank_ifsc_code = data.bank_ifsc_code;
  if (data.bank_name !== undefined) updateData.bank_name = data.bank_name;
  if (data.bank_document_file !== undefined) updateData.bank_document_file = data.bank_document_file;
  if (data.joining_date !== undefined) updateData.joining_date = data.joining_date ? new Date(data.joining_date) : null;
  if (data.exit_date !== undefined) updateData.exit_date = data.exit_date ? new Date(data.exit_date) : null;
  if (data.salary_rate_type !== undefined) updateData.salary_rate_type = data.salary_rate_type;
  if (data.salary_amount !== undefined) updateData.salary_amount = data.salary_amount;
  if (data.statutory_compliance !== undefined) updateData.statutory_compliance = data.statutory_compliance;
  if (data.work_location !== undefined) updateData.work_location = data.work_location;

  if (data.password) {
    updateData.password = await bcrypt.hash(data.password, 10);
  }

  if (Object.keys(updateData).length === 0) {
    return { message: "No changes to update" };
  }

  const effectiveUserType = await prisma.userTypeMaster.findUnique({
    where: { id: Number(data.user_type_id ?? user.user_type_id) },
    select: { user_type: true },
  });
  if (!effectiveUserType) {
    throw Object.assign(new Error("Invalid user_type_id."), { statusCode: 400 });
  }
  const previousFranchiseIds = [...new Set([
    ...(user.franchise_id ? [user.franchise_id] : []),
    ...user.siteSupervisorFranchiseMappings.map((mapping) => mapping.franchise_id),
  ])];
  const selectedFranchiseIds = franchiseIds ?? previousFranchiseIds;
  const removedFranchiseIds = franchiseIds
    ? previousFranchiseIds.filter((id) => !franchiseIds.includes(id))
    : [];
  await requireSupervisorConfirmation(user.vendor_id, selectedFranchiseIds,
    effectiveUserType.user_type, data.confirm_additional_supervisor, userId);

  const updatedUser = await prisma.$transaction(async (tx) => {
    const updated = await tx.userMaster.update({ where: { id: userId }, data: updateData });

    if (data.aadhar_card_file !== undefined || data.aadhar_no !== undefined) {
      const existingAadhar = await tx.userDocument.findFirst({
        where: { user_id: userId, document_name: "Aadhar Card" },
      });
      if (existingAadhar) {
        await tx.userDocument.update({
          where: { id: existingAadhar.id },
          data: {
            document_number: data.aadhar_no !== undefined ? (data.aadhar_no || "") : existingAadhar.document_number,
            filename: data.aadhar_card_file !== undefined ? (data.aadhar_card_file || "") : existingAadhar.filename,
          },
        });
      } else if (data.aadhar_card_file || data.aadhar_no) {
        await tx.userDocument.create({
          data: {
            user_id: userId,
            document_name: "Aadhar Card",
            document_number: data.aadhar_no || "",
            filename: data.aadhar_card_file || "",
          },
        });
      }
    }

    if (data.pan_card_file !== undefined || data.pan_no !== undefined) {
      const existingPan = await tx.userDocument.findFirst({
        where: { user_id: userId, document_name: "Pan Card" },
      });
      if (existingPan) {
        await tx.userDocument.update({
          where: { id: existingPan.id },
          data: {
            document_number: data.pan_no !== undefined ? (data.pan_no || "") : existingPan.document_number,
            filename: data.pan_card_file !== undefined ? (data.pan_card_file || "") : existingPan.filename,
          },
        });
      } else if (data.pan_card_file || data.pan_no) {
        await tx.userDocument.create({
          data: {
            user_id: userId,
            document_name: "Pan Card",
            document_number: data.pan_no || "",
            filename: data.pan_card_file || "",
          },
        });
      }
    }

    if (data.bank_document_file !== undefined) {
      const existingBankDoc = await tx.userDocument.findFirst({
        where: { user_id: userId, document_name: "Bank Document" },
      });
      if (existingBankDoc) {
        await tx.userDocument.update({
          where: { id: existingBankDoc.id },
          data: {
            document_number: data.bank_account_number !== undefined ? (data.bank_account_number || "") : existingBankDoc.document_number,
            filename: data.bank_document_file !== undefined ? (data.bank_document_file || "") : existingBankDoc.filename,
          },
        });
      } else if (data.bank_document_file) {
        await tx.userDocument.create({
          data: {
            user_id: userId,
            document_name: "Bank Document",
            document_number: data.bank_account_number || "",
            filename: data.bank_document_file || "",
          },
        });
      }
    }
    if (franchiseIds) await syncUserFranchises(tx, user.vendor_id, userId, franchiseIds, actorId);
    if ((franchiseIds || (data.user_type_id !== undefined && data.user_type_id !== user.user_type_id)) &&
        effectiveUserType.user_type.trim().toLowerCase().replace(/[ _]+/g, "-") === "site-supervisor") {
      await assignFranchiseLeadsToSupervisor(tx, user.vendor_id, userId, selectedFranchiseIds, actorId ?? userId, removedFranchiseIds);
    }
    return updated;
  });

  if (data.password) {
    await revokeUserActiveSessions(updatedUser.vendor_id, updatedUser.id);
  }

  const effectiveUserTypeId = updateData.user_type_id ?? undefined;

  if (effectiveUserTypeId !== undefined) {
    const userType = await prisma.userTypeMaster.findUnique({
      where: { id: Number(effectiveUserTypeId) },
      select: { user_type: true },
    });

    if (userType?.user_type.trim().toLowerCase() === "custom") {
      await ensureCustomUserPrivilegeMappings(
        updatedUser.vendor_id,
        updatedUser.id,
      );
    }
  }

  return updatedUser;
};

export const getUsersByVendorService = async ({
  vendorId,
  page = 1,
  limit = 20,
  search = "",
  franchise_id,
  user_type,
  exclude_user_type,
}: {
  vendorId: number;
  page?: number;
  limit?: number;
  search?: string;
  franchise_id?: number;
  user_type?: string;
  exclude_user_type?: string;
}) => {
  if (!vendorId) {
    const error = new Error("vendorId is required");
    (error as any).statusCode = 400;
    throw error;
  }

  const pageNum = Number.isFinite(page) && page > 0 ? page : 1;
  const limitNum = Number.isFinite(limit) && limit > 0 ? limit : 20;
  const normalizedSearch = search.trim();
  const normalizedUserType = user_type?.trim();
  const normalizedExcludeUserType = exclude_user_type?.trim();

  const where: any = {
    vendor_id: vendorId,
    ...(franchise_id ? { franchise_id } : {}),
  };

  if (normalizedUserType) {
    const types = normalizedUserType
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    where.user_type = {
      user_type:
        types.length > 1
          ? { in: types, mode: "insensitive" as const }
          : { equals: types[0], mode: "insensitive" as const },
    };
  } else if (normalizedExcludeUserType) {
    const excludeTypes = normalizedExcludeUserType
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    where.user_type = {
      isNot: {
        user_type:
          excludeTypes.length > 1
            ? { in: excludeTypes, mode: "insensitive" as const }
            : { equals: excludeTypes[0], mode: "insensitive" as const },
      },
    };
  }

  if (normalizedSearch) {
    where.OR = [
      { user_name: { contains: normalizedSearch, mode: "insensitive" as const } },
      { employee_code: { contains: normalizedSearch, mode: "insensitive" as const } },
      { designation: { contains: normalizedSearch, mode: "insensitive" as const } },
      { user_contact: { contains: normalizedSearch, mode: "insensitive" as const } },
      { user_email: { contains: normalizedSearch, mode: "insensitive" as const } },
      { status: { contains: normalizedSearch, mode: "insensitive" as const } },
      ...(normalizedUserType
        ? []
        : [
            {
              user_type: {
                user_type: { contains: normalizedSearch, mode: "insensitive" as const },
              },
            },
          ]),
      {
        franchise: {
          franchise_name: {
            contains: normalizedSearch,
            mode: "insensitive" as const,
          },
        },
      },
    ];
  }

  try {
    await ensureEmployeeCodesForVendor(vendorId, prisma);
  } catch (err) {
    console.error("Failed to backfill employee codes for vendor:", err);
  }

  const [users, count] = await Promise.all([
    prisma.userMaster.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      select: {
        id: true,
        vendor_id: true,
        franchise_id: true,
        employee_type: true,
        employee_code: true,
        contract_start_date: true,
        contract_end_date: true,
        department: true,
        aadhar_no: true,
        pan_no: true,
        permanent_address: true,
        current_address: true,
        aadhar_card_file: true,
        pan_card_file: true,
        bank_account_holder_name: true,
        bank_account_number: true,
        bank_ifsc_code: true,
        bank_name: true,
        bank_document_file: true,
        joining_date: true,
        exit_date: true,
        salary_rate_type: true,
        salary_amount: true,
        statutory_compliance: true,
        work_location: true,
        siteSupervisorFranchiseMappings: {
          orderBy: { id: "asc" },
          select: { franchise: { select: { id: true, franchise_name: true } } },
        },
        user_name: true,
        designation: true,
        user_contact: true,
        user_email: true,
        personal_email: true,
        user_timezone: true,
        status: true,
        created_at: true,
        user_type: {
          select: {
            user_type: true,
          },
        },
        franchise: {
          select: {
            franchise_name: true,
          },
        },
      },
    }),
    prisma.userMaster.count({ where }),
  ]);

  return {
    count,
    data: users.map(({ siteSupervisorFranchiseMappings, ...user }) => {
      const mapped = siteSupervisorFranchiseMappings.map((mapping) => mapping.franchise);
      const franchises = user.franchise_id && user.franchise
        ? [{ id: user.franchise_id, ...user.franchise }, ...mapped.filter((fr) => fr.id !== user.franchise_id)]
        : mapped;
      return { ...user, franchises, franchise_ids: franchises.map((fr) => fr.id) };
    }),
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(count / limitNum),
      totalRecoards: count,
      hasNext: pageNum < Math.ceil(count / limitNum),
      hasPrev: pageNum > 1,
    },
  };
};

export const getUserByIdService = async (userId: number, vendorId?: number) => {
  if (!userId) {
    const error = new Error("userId is required");
    (error as any).statusCode = 400;
    throw error;
  }

  const user = await prisma.userMaster.findFirst({
    where: {
      id: userId,
      ...(vendorId ? { vendor_id: vendorId } : {}),
    },
    select: {
      id: true,
      vendor_id: true,
      franchise_id: true,
      employee_type: true,
      employee_code: true,
      contract_start_date: true,
      contract_end_date: true,
      department: true,
      aadhar_no: true,
      pan_no: true,
      permanent_address: true,
      current_address: true,
      aadhar_card_file: true,
      pan_card_file: true,
        bank_account_holder_name: true,
        bank_account_number: true,
        bank_ifsc_code: true,
        bank_name: true,
        bank_document_file: true,
        joining_date: true,
        exit_date: true,
        salary_rate_type: true,
        salary_amount: true,
        statutory_compliance: true,
        work_location: true,
      siteSupervisorFranchiseMappings: {
        orderBy: { id: "asc" },
        select: { franchise: { select: { id: true, franchise_name: true } } },
      },
      user_name: true,
      designation: true,
      user_contact: true,
      user_email: true,
      personal_email: true,
      user_timezone: true,
      status: true,
      created_at: true,
      user_type: {
        select: {
          id: true,
          user_type: true,
        },
      },
      franchise: {
        select: {
          id: true,
          franchise_name: true,
        },
      },
    },
  });

  if (!user) {
    const error = new Error("User not found");
    (error as any).statusCode = 404;
    throw error;
  }

  const { siteSupervisorFranchiseMappings, ...userData } = user;
  const mapped = siteSupervisorFranchiseMappings
    .map((mapping: any) => mapping.franchise)
    .filter(Boolean);
  const franchises = userData.franchise
    ? [userData.franchise, ...mapped.filter((fr: any) => fr?.id !== userData.franchise?.id)]
    : mapped;

  return {
    ...userData,
    franchises,
    franchise_ids: franchises.map((fr: any) => fr.id),
  };
};

export const getPrivilegeMastersByVendorService = async (
  vendorId: number,
  search = "",
  userId?: number,
) => {
  if (!vendorId) {
    const error = new Error("vendorId is required");
    (error as any).statusCode = 400;
    throw error;
  }

  const normalizedSearch = search.trim();
  let selectedPrivilegeIds = new Set<number>();

  if (userId) {
    const user = await prisma.userMaster.findFirst({
      where: {
        id: userId,
        vendor_id: vendorId,
      },
      select: { id: true },
    });

    if (!user) {
      const error = new Error("User not found for this vendor");
      (error as any).statusCode = 404;
      throw error;
    }

    const mappings = await prisma.userPrivilegeMapping.findMany({
      where: {
        vendor_id: vendorId,
        user_id: userId,
        is_allowed: true,
      },
      select: {
        privilege_id: true,
      },
    });

    selectedPrivilegeIds = new Set(
      mappings.map((mapping) => mapping.privilege_id),
    );
  }

  const privileges = await prisma.privilegeMaster.findMany({
    where: {
      vendor_id: vendorId,
      is_active: true,
      ...(normalizedSearch
        ? {
            OR: [
              {
                code: {
                  contains: normalizedSearch,
                  mode: "insensitive" as const,
                },
              },
              {
                action: {
                  contains: normalizedSearch,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    },
    orderBy: [
      { parent_module: "asc" },
      { child_module: "asc" },
      { action: "asc" },
    ],
    select: {
      id: true,
      vendor_id: true,
      code: true,
      parent_module: true,
      child_module: true,
      action: true,
      label: true,
      description: true,
      is_active: true,
    },
  });

  const mappedPrivileges = privileges.map((privilege) => ({
    ...privilege,
    is_selected: selectedPrivilegeIds.has(privilege.id),
  }));

  const getSectionChildPrivileges = (
    parentModuleName: string,
    childModuleIncludes: string[],
    codePrefixes: string[]
  ) => {
    const normalizedKeywords = childModuleIncludes.map((val) => val.toLowerCase());
    const normalizedCodePrefixes = codePrefixes.map((val) => val.toLowerCase());

    return mappedPrivileges.filter((privilege) => {
      const parentModule = privilege.parent_module.toLowerCase();
      const childModule = privilege.child_module.toLowerCase();
      const privilegeCode = privilege.code.toLowerCase();

      if (
        parentModule === parentModuleName.toLowerCase() &&
        normalizedCodePrefixes.length > 0
      ) {
        return normalizedCodePrefixes.some((prefix) =>
          privilegeCode.startsWith(prefix)
        );
      }

      return (
        parentModule === parentModuleName.toLowerCase() &&
        normalizedKeywords.some((keyword) => childModule.includes(keyword))
      );
    });
  };

  const getDynamicGroups = (parentModuleName: string, idPrefix: string) => {
    const groupsMap = new Map<string, { id: string; title: string; privileges: typeof mappedPrivileges }>();

    mappedPrivileges.forEach((privilege) => {
      if (privilege.parent_module.toLowerCase() !== parentModuleName.toLowerCase()) return;

      const normalizedChildModule = privilege.child_module.trim();
      if (!normalizedChildModule) return;

      const groupKey = normalizedChildModule.toLowerCase();
      const existingGroup = groupsMap.get(groupKey);

      if (existingGroup) {
        existingGroup.privileges.push(privilege);
        return;
      }

      groupsMap.set(groupKey, {
        id: `${idPrefix}-${groupKey.replace(/[^a-z0-9]+/g, "-")}`,
        title: normalizedChildModule,
        privileges: [privilege],
      });
    });

    return Array.from(groupsMap.values()).sort((left, right) =>
      left.title.localeCompare(right.title)
    );
  };

  const getDynamicGroupsByChild = (
    parentModuleName: string,
    childModuleName: string,
    idPrefix: string,
  ) =>
    getDynamicGroups(parentModuleName, idPrefix).filter(
      (group) => group.title.trim().toLowerCase() === childModuleName.toLowerCase(),
    );

  const sections = [
    {
      id: "leads",
      title: "Leads",
      description: "Manage access to lead viewing, status updates, reassignment, and task actions.",
      children: [
        {
          id: "open",
          title: "Open Leads",
          privileges: getSectionChildPrivileges("Leads", ["Open Leads"], ["leads.open_leads."]),
        },
        {
          id: "initial_site_measurement",
          title: "Initial Site Measurement",
          privileges: getSectionChildPrivileges("Leads", ["ISM Leads"], ["leads.ism_leads.", "leads.initial_site_measurement."]),
        },
        {
          id: "designing_stage",
          title: "Desiging Stage",
          privileges: getSectionChildPrivileges("Leads", ["Designing Stage"], ["leads.designing_stage."]),
        },
        {
          id: "booking_stage",
          title: "Booking Stage",
          privileges: getSectionChildPrivileges("Leads", ["Booking Done"], ["leads.booking_done.", "leads.booking_stage."]),
        },
      ],
    },
    {
      id: "projects",
      title: "Projects",
      description: "Manage access to project milestones, files, approvals, and project updates.",
      children: [
        {
          id: "final_measurements",
          title: "Final Measurements",
          privileges: getSectionChildPrivileges("Project", ["Final Measurement"], ["project.final_measurement."]),
        },
        {
          id: "client_documentations",
          title: "Client Documentations",
          privileges: getSectionChildPrivileges("Project", ["Client Documentation"], ["project.client_documentation."]),
        },
        {
          id: "client_approvals",
          title: "Client Approvals",
          privileges: getSectionChildPrivileges(
            "Project",
            ["Client Approval", "Client Approval Form", "Client Payment Details", "Client Approval Screenshots"],
            ["project.client_approval."]
          ),
        },
      ],
    },
    {
      id: "productions",
      title: "Productions",
      description: "Manage access to production stages, planning flows, and execution actions.",
      children: [
        {
          id: "tech_check_stage",
          title: "Tech Check Stage",
          privileges: getSectionChildPrivileges("Production", ["Tech Check"], ["production.tech_check."]),
        },
        {
          id: "order_login_stage",
          title: "Order Login Stage",
          privileges: getSectionChildPrivileges(
            "Production",
            ["Order Login", "Approved Documents", "Payment Lockin", "Production Files", "Order Login Details", "Move to Production"],
            ["production.order_login."]
          ),
        },
        {
          id: "production_stage",
          title: "Production Stage",
          privileges: getSectionChildPrivileges(
            "Production",
            [
              "Production Files",
              "Pre Production Files",
              "Under Production",
              "Post Production - Woodwork",
              "Post Production - Hardware",
              "Post Production - QC Photos",
              "Set no. of boxes",
              "Mark as Completed",
              "Ready to Dispatch",
            ],
            ["production.production."]
          ),
        },
        {
          id: "ready_to_dispatch",
          title: "Ready To Dispatch",
          privileges: getSectionChildPrivileges("Production", ["Ready To Dispatch"], ["production.ready_to_dispatch."]),
        },
      ],
    },
    {
      id: "installations",
      title: "Installations",
      description: "Manage access to installation progress, readiness, documents, and handover actions.",
      children: [
        {
          id: "site_readiness",
          title: "Site Readiness",
          privileges: getSectionChildPrivileges(
            "Installation",
            ["Site Readiness", "Checklist of site readiness", "Current sites photos", "Move to Dispatch Planning"],
            ["installation.site_readiness."]
          ),
        },
        {
          id: "dispatch_planning",
          title: "Dispatch Planning",
          privileges: getSectionChildPrivileges("Installation", ["Dispatch Planning"], ["installation.dispatch_planning."]),
        },
        {
          id: "dispatch_stage",
          title: "Dispatch",
          privileges: getSectionChildPrivileges(
            "Installation",
            [
              "Dispatch",
              "Dispatch Snapshot",
              "Dispatch Details",
              "Dispatch Documents",
              "Add Pending Material",
              "Post Dispatch",
              "Move to Under Installation",
            ],
            ["installation.dispatch."]
          ),
        },
        {
          id: "under_installation",
          title: "Under Installation",
          privileges: getSectionChildPrivileges("Installation", ["Under Installation"], ["installation.under_installation."]),
        },
        {
          id: "final_handover",
          title: "Final Handover",
          privileges: getSectionChildPrivileges("Installation", ["Final Handover", "Pending Work"], ["installation.final_handover."]),
        },
      ],
    },
    {
      id: "general_privileges",
      title: "General Privileges",
      description: "Manage access to shared tools and servicing-specific privilege actions.",
      tabs: [
        {
          id: "servicing",
          title: "Servicing",
          groups: getDynamicGroups("Servicing", "general-servicing"),
        },
        {
          id: "general_tools",
          title: "General Tools",
          groups: [
            ...getDynamicGroups("Lead Detail", "general-tools"),
            ...getDynamicGroupsByChild("General", "Servicing", "general-common-actions")
              .map((group) => ({ ...group, title: "Common Actions" })),
          ],
        },
      ],
    },
  ];

  return sections;
};

export const updateUserPrivilegeMappingsService = async ({
  vendorId,
  userId,
  privilegeIds,
}: {
  vendorId: number;
  userId: number;
  privilegeIds: number[];
}) => {
  if (!vendorId || !userId) {
    const error = new Error("vendorId and userId are required");
    (error as any).statusCode = 400;
    throw error;
  }

  const user = await prisma.userMaster.findFirst({
    where: {
      id: userId,
      vendor_id: vendorId,
    },
    select: {
      id: true,
      user_type: {
        select: {
          user_type: true,
        },
      },
    },
  });

  if (!user) {
    const error = new Error("User not found for this vendor");
    (error as any).statusCode = 404;
    throw error;
  }

  if (user.user_type?.user_type.trim().toLowerCase() !== "custom") {
    const error = new Error("Privilege mappings can only be updated for custom users");
    (error as any).statusCode = 400;
    throw error;
  }

  const activePrivileges = await prisma.privilegeMaster.findMany({
    where: {
      vendor_id: vendorId,
      is_active: true,
    },
    select: { id: true },
  });

  const activePrivilegeIds = activePrivileges.map((privilege) => privilege.id);

  if (activePrivilegeIds.length === 0) {
    return { updated: 0 };
  }

  const requestedPrivilegeIds = Array.from(
    new Set(
      privilegeIds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  );

  const allowedPrivilegeIdSet = new Set(activePrivilegeIds);
  const filteredRequestedPrivilegeIds = requestedPrivilegeIds.filter((id) =>
    allowedPrivilegeIdSet.has(id),
  );
  const existingAllowedMappings = await prisma.userPrivilegeMapping.findMany({
    where: {
      vendor_id: vendorId,
      user_id: userId,
      privilege_id: {
        in: activePrivilegeIds,
      },
      is_allowed: true,
    },
    select: {
      privilege_id: true,
    },
  });
  const existingAllowedPrivilegeIds = existingAllowedMappings
    .map((mapping) => mapping.privilege_id)
    .sort((left, right) => left - right);
  const normalizedRequestedPrivilegeIds = [...filteredRequestedPrivilegeIds].sort(
    (left, right) => left - right,
  );
  const hasChanged =
    existingAllowedPrivilegeIds.length !== normalizedRequestedPrivilegeIds.length ||
    existingAllowedPrivilegeIds.some(
      (privilegeId, index) => privilegeId !== normalizedRequestedPrivilegeIds[index],
    );

  if (!hasChanged) {
    return { updated: filteredRequestedPrivilegeIds.length, sessions_revoked: 0 };
  }

  await prisma.$transaction(async (tx) => {
    await tx.userPrivilegeMapping.createMany({
      data: activePrivilegeIds.map((privilegeId) => ({
        vendor_id: vendorId,
        user_id: userId,
        privilege_id: privilegeId,
        is_allowed: false,
      })),
      skipDuplicates: true,
    });

    await tx.userPrivilegeMapping.updateMany({
      where: {
        vendor_id: vendorId,
        user_id: userId,
        privilege_id: {
          in: activePrivilegeIds,
        },
      },
      data: {
        is_allowed: false,
      },
    });

    if (filteredRequestedPrivilegeIds.length > 0) {
      await tx.userPrivilegeMapping.updateMany({
        where: {
          vendor_id: vendorId,
          user_id: userId,
          privilege_id: {
            in: filteredRequestedPrivilegeIds,
          },
        },
        data: {
          is_allowed: true,
        },
      });
    }
  });

  const revokedSessions = await revokeUserActiveSessionsForPrivilegeChange(
    vendorId,
    userId,
  );

  return {
    updated: filteredRequestedPrivilegeIds.length,
    sessions_revoked: revokedSessions,
  };
};
