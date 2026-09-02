import { prisma } from "../../prisma/client";
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
    await redis.del(activeSessions.map((session) => sessionCacheKey(session.id)));
    await redis.sRem(
      vendorSessionsKey(vendorId),
      activeSessions.map((session) => String(session.id)),
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
    await redis.del(activeSessions.map((session) => sessionCacheKey(session.id)));
    await redis.sRem(
      vendorSessionsKey(vendorId),
      activeSessions.map((session) => String(session.id)),
    );
  } catch (error) {
    console.error("Failed to evict user session cache after password reset:", error);
  }

  return activeSessions.length;
};

export const createUserService = async (data: {
  vendor_id: number;
  franchise_id: number;
  user_name: string;
  user_contact: string;
  user_email: string;
  user_timezone: string;
  password: string;
  user_type_id: number;
  status?: string;
}) => {
  if (!data.franchise_id) {
    const error = new Error("franchise_id is required.");
    (error as any).statusCode = 400;
    throw error;
  }

  const franchise = await prisma.franchiseMaster.findFirst({
    where: {
      id: Number(data.franchise_id),
      vendor_id: Number(data.vendor_id),
    },
    select: { id: true },
  });

  if (!franchise) {
    const error = new Error("Invalid franchise_id for the given vendor_id.");
    (error as any).statusCode = 400;
    throw error;
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

  const createdUser = await prisma.userMaster.create({
    data: {
      ...data,
      password: hashedPassword,
    },
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
    user_contact?: string;
    user_email?: string;
    user_timezone?: string;
    password?: string;
    user_type_id?: number;
    franchise_id?: number | null;
    status?: string;
  },
) => {
  const user = await prisma.userMaster.findUnique({
    where: { id: userId },
    select: { id: true, vendor_id: true },
  });

  if (!user) {
    const error = new Error("User not found");
    (error as any).statusCode = 404;
    throw error;
  }

  const updateData: Record<string, any> = {};

  if (data.user_name !== undefined) updateData.user_name = data.user_name;
  if (data.user_contact !== undefined) updateData.user_contact = data.user_contact;
  if (data.user_email !== undefined) updateData.user_email = data.user_email;
  if (data.user_timezone !== undefined) updateData.user_timezone = data.user_timezone;
  if (data.user_type_id !== undefined) updateData.user_type_id = data.user_type_id;
  if (data.franchise_id !== undefined) updateData.franchise_id = data.franchise_id;
  if (data.status !== undefined) updateData.status = data.status;

  if (data.password) {
    updateData.password = await bcrypt.hash(data.password, 10);
  }

  if (Object.keys(updateData).length === 0) {
    return { message: "No changes to update" };
  }

  const updatedUser = await prisma.userMaster.update({
    where: { id: userId },
    data: updateData,
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
}: {
  vendorId: number;
  page?: number;
  limit?: number;
  search?: string;
  franchise_id?: number;
}) => {
  if (!vendorId) {
    const error = new Error("vendorId is required");
    (error as any).statusCode = 400;
    throw error;
  }

  const pageNum = Number.isFinite(page) && page > 0 ? page : 1;
  const limitNum = Number.isFinite(limit) && limit > 0 ? limit : 20;
  const normalizedSearch = search.trim();

  const where = {
    vendor_id: vendorId,
    ...(franchise_id ? { franchise_id } : {}),
    ...(normalizedSearch
      ? {
          OR: [
            { user_name: { contains: normalizedSearch, mode: "insensitive" as const } },
            { user_contact: { contains: normalizedSearch, mode: "insensitive" as const } },
            { user_email: { contains: normalizedSearch, mode: "insensitive" as const } },
            { status: { contains: normalizedSearch, mode: "insensitive" as const } },
            {
              user_type: {
                user_type: { contains: normalizedSearch, mode: "insensitive" as const },
              },
            },
            {
              franchise: {
                franchise_name: {
                  contains: normalizedSearch,
                  mode: "insensitive" as const,
                },
              },
            },
          ],
        }
      : {}),
  };

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
        user_name: true,
        user_contact: true,
        user_email: true,
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
    data: users,
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(count / limitNum),
      totalRecoards: count,
      hasNext: pageNum < Math.ceil(count / limitNum),
      hasPrev: pageNum > 1,
    },
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
          groups: getDynamicGroups("Lead Detail", "general-tools"),
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
