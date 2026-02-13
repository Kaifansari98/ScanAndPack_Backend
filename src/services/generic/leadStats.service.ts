import { ActivityStatus } from "../../prisma/generated";
import { prisma } from "../../prisma/client";
import logger from "../../utils/logger";

export class LeadStatsService {
  static async getVendorLeadStats(vendorId: number, userId?: number) {
    logger.info("[LeadStatsService] getVendorLeadStats called", {
      vendorId,
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

      totalMyTasks = await prisma.userLeadTask.count({
        where: {
          vendor_id: vendorId,
          user_id: userId,
          status: { in: ["open", "in_progress"] },
        },
      });

      if (userType === "sales-executive" || userType === "site-supervisor") {
        // ✅ Leads from LeadUserMapping
        const mappedLeads = await prisma.leadUserMapping.findMany({
          where: { vendor_id: vendorId, user_id: userId, status: "active" },
          select: { lead_id: true },
        });

        // ✅ Use only mapped leads (ignore userLeadTask)
        const leadIds = [...new Set(mappedLeads.map((m) => m.lead_id))];

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

    // Helper: count leads by status type
    const countByStatus = async (statusType: string) =>
      prisma.leadMaster.count({
        where: {
          ...baseLeadScope,
          statusType: { vendor_id: vendorId, type: statusType },
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

    const totalOpenLeads = await countByStatus("open");
    const totalInitialSiteMeasurementLeads = await countByStatus(
      "initial-site-measurement"
    );
    const totalDesigningStageLeads = await countByStatus("designing-stage");
    const totalBookingStageLeads = await countByStatus("booking-stage");
    const totalFinalMeasurementStageLeads = await countByStatus(
      "final-site-measurement-stage"
    );
    const totalClientDocumentationStageLeads = await countByStatus(
      "client-documentation-stage"
    );
    const totalClientApprovalStageLeads = await countByStatus(
      "client-approval-stage"
    );
    const instanceStageTags = ["Type 8", "Type 9", "Type 10"];

    const totalTechCheckStageLeads = await prisma.leadProductStructureInstance.count({
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

    const totalOrderLoginStageLeads = await prisma.leadProductStructureInstance.count({
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

    const totalProductionStageLeads = await prisma.leadProductStructureInstance.count({
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
    const totalReadyToDispatchStageLeads = await countByStatus(
      "ready-to-dispatch-stage"
    );
    const totalSiteReadinessStageLeads = await countByStatus(
      "site-readiness-stage"
    );
    const totalDispatchPlanningStageLeads = await countByStatus(
      "dispatch-planning-stage"
    );
    const totalDispatchStageLeads = await countByStatus("dispatch-stage");
    const totalUnderInstallationStageLeads = await countByStatus(
      "under-installation-stage"
    );
    const totalFinalhandoverStageLeads = await countByStatus(
      "final-handover-stage"
    );
    const totalProjectCompletedStageLeads = await prisma.leadMaster.count({
      where: {
        ...baseLeadScope,
        statusType: { vendor_id: vendorId, tag: "Type 17" },
      },
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
