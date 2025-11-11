import { ActivityStatus } from "@prisma/client";
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

      if (userType === "sales-executive" || userType === "site-supervisor") {
        // ✅ Leads from LeadUserMapping
        const mappedLeads = await prisma.leadUserMapping.findMany({
          where: { vendor_id: vendorId, user_id: userId, status: "active" },
          select: { lead_id: true },
        });

        // ✅ Leads from UserLeadTask (created_by OR assigned_to)
        const taskLeads = await prisma.userLeadTask.findMany({
          where: {
            vendor_id: vendorId,
            OR: [{ created_by: userId }, { user_id: userId }],
          },
          select: { lead_id: true },
        });

        // ✅ Union of both sources
        const leadIds = [
          ...new Set([
            ...mappedLeads.map((m) => m.lead_id),
            ...taskLeads.map((t) => t.lead_id),
          ]),
        ];

        whereClause = {
          ...whereClause,
          id: { in: leadIds.length > 0 ? leadIds : [0] }, // avoid empty "in []"
        };
      }
      // ✅ Admin/super-admin → see all vendor leads

      if (userType === "sales-executive" || userType === "site-supervisor") {
        totalMyTasks = await prisma.userLeadTask.count({
          where: {
            vendor_id: vendorId,
            // OR: [{ user_id: userId }, { created_by: userId }],
            user_id: userId, // ✅ Only assigned tasks
            status: "open",
            closed_at: null,
          },
        });
        logger.info("[LeadStatsService] totalMyTasks debug", {
          userId,
          totalMyTasks,
        });
      }
    }

    // Helper: count leads by status type
    const countByStatus = async (statusType: string) =>
      prisma.leadMaster.count({
        where: {
          ...whereClause,
          statusType: { vendor_id: vendorId, type: statusType },
          activity_status: {
            in: [ActivityStatus.onGoing, ActivityStatus.lostApproval],
          },
        },
      });

    // Aggregate counts
    const totalLeads = await prisma.leadMaster.count({
      where: {
        ...whereClause,
        statusType: { vendor_id: vendorId },
        activity_status: {
          in: [ActivityStatus.onGoing, ActivityStatus.lostApproval],
        },
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
    const totalTechCheckStageLeads = await countByStatus("tech-check-stage");
    const totalOrderLoginStageLeads = await countByStatus("order-login-stage");
    const totalProductionStageLeads = await countByStatus("production-stage");
    const totalReadyToDispatchStageLeads = await countByStatus("ready-to-dispatch-stage");
    const totalSiteReadinessStageLeads = await countByStatus("site-readiness-stage");
    const totalDispatchPlanningStageLeads = await countByStatus("dispatch-planning-stage");

    const stats = {
      total_leads: totalLeads,
      total_open_leads: totalOpenLeads,
      total_initial_site_measurement_leads: totalInitialSiteMeasurementLeads,
      total_designing_stage_leads: totalDesigningStageLeads,
      total_booking_stage_leads: totalBookingStageLeads,
      total_final_measurement_leads: totalFinalMeasurementStageLeads,
      total_client_documentation_leads: totalClientDocumentationStageLeads,
      total_client_approval_leads: totalClientApprovalStageLeads,
      total_my_tasks: totalMyTasks,
      total_tech_check_leads: totalTechCheckStageLeads,
      total_order_login_leads: totalOrderLoginStageLeads,
      total_production_stage_leads: totalProductionStageLeads,
      total_ready_to_dispatch_leads: totalReadyToDispatchStageLeads,
      total_site_readiness_stage_leads: totalSiteReadinessStageLeads,
      total_dispatch_planning_stage_leads: totalDispatchPlanningStageLeads,
    };

    logger.debug("[LeadStatsService] Computed stats", stats);
    return stats;
  }
}
