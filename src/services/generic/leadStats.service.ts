import { ActivityStatus } from "../../prisma/generated";
import { prisma } from "../../prisma/client";
import logger from "../../utils/logger";

export class LeadStatsService {
  static async getVendorLeadStats(
    vendorId: number,
    franchiseId: number | undefined,
    userId?: number
  ) {
    logger.info("[LeadStatsService] getVendorLeadStats called", {
      vendorId,
      franchiseId,
      userId,
    });

    let whereClause: any = {
      vendor_id: vendorId,
      is_deleted: false,
    };

    // ✅ Total My Tasks count (for current user)
    let totalMyTasks: number | null = null;

    // If userId is provided, check user type and apply appropriate filters
    if (userId) {
      const user = await prisma.userMaster.findUnique({
        where: { id: userId },
        include: { user_type: true },
      });

      if (!user) {
        logger.warn("User not found", { userId, vendorId });
        throw new Error("User not found");
      }

      if (user.vendor_id !== vendorId) {
        logger.warn("User does not belong to vendor", { userId, vendorId });
        throw new Error("User does not belong to the specified vendor");
      }

      const userType = user.user_type.user_type.toLowerCase();
      const shouldIncludeFranchise = [
        "sales-executive",
        "custom",
        // "site-supervisor",
        "admin",
        "super-admin",
      ].includes(userType);
      const shouldIncludeFranchiseForMyTasks = [
        "sales-executive",
        "custom",
        "admin",
      ].includes(userType);
      const shouldUseMapping = [
        "sales-executive",
        "custom",
        "site-supervisor",
        "backend",
        "tech-check",
        "factory",
        "head-site-supervisor",
        "pre-prod",
      ].includes(userType);
      console.log("[LeadStatsService] role flags", {
        userType,
        shouldIncludeFranchise,
        shouldUseMapping,
      });

      if (shouldIncludeFranchise && franchiseId) {
        whereClause = {
          ...whereClause,
          franchise_id: franchiseId,
        };
      }

      totalMyTasks = await prisma.userLeadTask.count({
        where: {
          vendor_id: vendorId,
          ...(shouldIncludeFranchiseForMyTasks && franchiseId
            ? { franchise_id: franchiseId }
            : {}),
          user_id: userId,
          status: { in: ["open", "in_progress"] },
        },
      });

      if (shouldUseMapping) {
        // Pre-prod and factory are mapping-only — taskLeads would pull leads they
        // don't own (e.g. tasks they created) and inflate the sidebar count.
        const mappingOnlyRoles = ["pre-prod", "factory"];
        const isMappingOnly = mappingOnlyRoles.includes(userType);

        const [mappedLeads, taskLeads] = await Promise.all([
          prisma.leadUserMapping.findMany({
            where: { vendor_id: vendorId, user_id: userId, status: "active" },
            select: { lead_id: true },
          }),
          isMappingOnly
            ? Promise.resolve([])
            : prisma.userLeadTask.findMany({
                where: {
                  vendor_id: vendorId,
                  OR: [{ created_by: userId }, { user_id: userId }],
                },
                select: { lead_id: true },
              }),
        ]);

        const leadIds = [
          ...new Set([
            ...mappedLeads.map((m) => m.lead_id),
            ...taskLeads.map((t) => t.lead_id),
          ]),
        ];
        console.log("[LeadStatsService] lead ids", {
          mappedCount: mappedLeads.length,
          taskCount: taskLeads.length,
          totalUnique: leadIds.length,
        });

        whereClause = {
          ...whereClause,
          id: { in: leadIds.length > 0 ? leadIds : [0] }, // avoid empty "in []"
        };
      }
      // ✅ Admin/super-admin → see all vendor leads

      // userLeadTask counts are no longer included
    }

    const baseLeadScope = {
      ...whereClause,
      activity_status: {
        in: [ActivityStatus.onGoing, ActivityStatus.lostApproval],
      },
    };

    // Helper: count leads by status tag (Type 1..17)
    const countByTag = async (statusTag: string) =>
      prisma.leadMaster.count({
        where: {
          ...baseLeadScope,
          statusType: { vendor_id: vendorId, tag: statusTag },
        },
      });

    // Aggregate counts
    const totalLeads = await prisma.leadMaster.count({
      where: {
        ...baseLeadScope,
        statusType: { vendor_id: vendorId },
      },
    });

    const overallStatusTags = [
      "Type 1",
      "Type 2",
      "Type 3",
      "Type 4",
      "Type 5",
      "Type 6",
      "Type 7",
      "Type 8",
      "Type 9",
      "Type 10",
      "Type 11",
      "Type 12",
      "Type 13",
      "Type 14",
      "Type 15",
      "Type 16",
      "Type 17",
    ];

    const totalOverallLeads = await prisma.leadMaster.count({
      where: {
        ...whereClause,
        statusType: { vendor_id: vendorId, tag: { in: overallStatusTags } },
        activity_status: ActivityStatus.onGoing,
      },
    });

    const totalOpenLeads = await countByTag("Type 1");
    const totalInitialSiteMeasurementLeads = await countByTag("Type 2");
    const totalDesigningStageLeads = await countByTag("Type 3");
    const totalBookingStageLeads = await countByTag("Type 4");
    const totalFinalMeasurementStageLeads = await countByTag("Type 5");
    const debugType5Leads = await prisma.leadMaster.findMany({
      where: {
        ...baseLeadScope,
        statusType: { vendor_id: vendorId, tag: "Type 5" },
      },
      select: { id: true, lead_code: true },
      take: 10,
    });
    console.log("[LeadStatsService] debug Type 5 leads", {
      count: totalFinalMeasurementStageLeads,
      sample: debugType5Leads,
    });
    const totalClientDocumentationStageLeads = await countByTag("Type 6");
    const totalClientApprovalStageLeads = await countByTag("Type 7");
    const instanceStageTags = ["Type 8", "Type 9", "Type 10"];

    const totalTechCheckStageLeads =
      await prisma.leadProductStructureInstance.count({
        where: {
          vendor_id: vendorId,
          OR: [
            { is_tech_check_completed: false },
            { is_tech_check_completed: null },
          ],
          lead: {
            ...baseLeadScope,
            statusType: { vendor_id: vendorId, tag: { in: instanceStageTags } },
          },
        },
      });

    const totalOrderLoginStageLeads =
      await prisma.leadProductStructureInstance.count({
        where: {
          vendor_id: vendorId,
          is_tech_check_completed: true,
          OR: [
            { is_order_login_completed: false },
            { is_order_login_completed: null },
          ],
          lead: {
            ...baseLeadScope,
            statusType: { vendor_id: vendorId, tag: { in: instanceStageTags } },
          },
        },
      });

    const totalProductionStageLeads =
      await prisma.leadProductStructureInstance.count({
        where: {
          vendor_id: vendorId,
          is_tech_check_completed: true,
          is_order_login_completed: true,
          lead: {
            ...baseLeadScope,
            statusType: { vendor_id: vendorId, tag: { in: instanceStageTags } },
          },
        },
      });
    const totalReadyToDispatchStageLeads = await countByTag("Type 11");
    const totalSiteReadinessStageLeads = await countByTag("Type 12");
    const totalDispatchPlanningStageLeads = await countByTag("Type 13");
    const totalDispatchStageLeads = await countByTag("Type 14");
    const totalUnderInstallationStageLeads = await prisma.leadMaster.count({
      where: {
        ...baseLeadScope,

        // Stage Filter (Type 15)
        statusType: {
          vendor_id: vendorId,
          tag: "Type 15",
        },

        // Hide ONLY when usable completed + misc still pending
        NOT: {
          AND: [
            { usable_handover_completed: true },
            {
              miscellaneousMaster: {
                some: { is_resolved: false },
              },
            },
          ],
        },
      },
    });
    const totalFinalhandoverStageLeads = await countByTag("Type 16");
    const totalProjectCompletedStageLeads = await prisma.leadMaster.count({
      where: {
        ...baseLeadScope,
        statusType: { vendor_id: vendorId, tag: "Type 17" },
      },
    });
    const totalServicingStageLeads = await prisma.leadMaster.count({
      where: {
        ...baseLeadScope,
        statusType: { vendor_id: vendorId, tag: "Type 17" },
        serviceSchedules: {
          some: {
            status: "open",
          },
        },
      },
    });

    console.log("[LeadStatsService] counts snapshot", {
      totalLeads,
      totalOverallLeads,
      totalOpenLeads,
      totalInitialSiteMeasurementLeads,
      totalDesigningStageLeads,
      totalBookingStageLeads,
      totalFinalMeasurementStageLeads,
      totalClientDocumentationStageLeads,
      totalClientApprovalStageLeads,
      totalTechCheckStageLeads,
      totalOrderLoginStageLeads,
      totalProductionStageLeads,
      totalReadyToDispatchStageLeads,
      totalSiteReadinessStageLeads,
      totalDispatchPlanningStageLeads,
      totalDispatchStageLeads,
      totalUnderInstallationStageLeads,
      totalFinalhandoverStageLeads,
      totalProjectCompletedStageLeads,
      totalServicingStageLeads,
    });

    // GROUP TOTALS
    const total_leads_group =
      totalOpenLeads +
      totalInitialSiteMeasurementLeads +
      totalDesigningStageLeads +
      totalBookingStageLeads;

    const total_project_group =
      totalFinalMeasurementStageLeads +
      totalClientDocumentationStageLeads +
      totalClientApprovalStageLeads;

    const total_production_group =
      totalTechCheckStageLeads +
      totalOrderLoginStageLeads +
      totalProductionStageLeads;

    const total_installation_group =
      totalSiteReadinessStageLeads +
      totalDispatchPlanningStageLeads +
      totalDispatchStageLeads +
      totalUnderInstallationStageLeads +
      totalFinalhandoverStageLeads +
      totalProjectCompletedStageLeads;

    const stats = {
      // =====================
      // INDIVIDUAL COUNTS
      // =====================
      total_leads: totalLeads,
      total_overall_leads: totalOverallLeads,
      total_my_tasks: totalMyTasks,

      total_open_leads: totalOpenLeads,
      total_initial_site_measurement_leads: totalInitialSiteMeasurementLeads,
      total_designing_stage_leads: totalDesigningStageLeads,
      total_booking_stage_leads: totalBookingStageLeads,

      total_final_measurement_leads: totalFinalMeasurementStageLeads,
      total_client_documentation_leads: totalClientDocumentationStageLeads,
      total_client_approval_leads: totalClientApprovalStageLeads,

      total_tech_check_leads: totalTechCheckStageLeads,
      total_order_login_leads: totalOrderLoginStageLeads,
      total_production_stage_leads: totalProductionStageLeads,
      total_ready_to_dispatch_leads: totalReadyToDispatchStageLeads,

      total_site_readiness_stage_leads: totalSiteReadinessStageLeads,
      total_dispatch_planning_stage_leads: totalDispatchPlanningStageLeads,
      total_dispatch_stage_leads: totalDispatchStageLeads,
      total_under_installation_stage_leads: totalUnderInstallationStageLeads,
      total_final_handover_stage_leads: totalFinalhandoverStageLeads,
      total_project_completed_stage_leads: totalProjectCompletedStageLeads,
      total_servicing_stage_leads: totalServicingStageLeads,

      // =====================
      // GROUP TOTALS (NEW)
      // =====================
      total_leads_group,
      total_project_group,
      total_production_group,
      total_installation_group,
    };

    logger.debug("[LeadStatsService] Computed stats", stats);
    return stats;
  }
}
