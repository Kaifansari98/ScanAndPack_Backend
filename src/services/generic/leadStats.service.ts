import { prisma } from "../../prisma/client";

export class LeadStatsService {
  static async getVendorLeadStats(vendorId: number, userId?: number) {
    let whereClause: any = {
      vendor_id: vendorId,
      is_deleted: false,
    };

    // If userId is provided, check user type and apply appropriate filters
    if (userId) {
      const user = await prisma.userMaster.findUnique({
        where: { id: userId },
        include: {
          user_type: true,
        },
      });

      if (!user) {
        throw new Error("User not found");
      }

      if (user.vendor_id !== vendorId) {
        throw new Error("User does not belong to the specified vendor");
      }

      const userType = user.user_type.user_type.toLowerCase();

      // If user is sales-executive, filter leads created by or assigned to them
      if (userType === "sales-executive") {
        whereClause = {
          ...whereClause,
          OR: [
            { created_by: userId },
            { assign_to: userId },
          ],
        };
      }
      // For admin and super-admin, show all vendor leads (no additional filtering needed)
    }

    // Total leads 
    const totalLeads = await prisma.leadMaster.count({
      where: {
        ...whereClause,
        statusType: {
          vendor_id: vendorId,
        },
      },
    });

    // Total leads (status = open)
    const totalOpenLeads = await prisma.leadMaster.count({
      where: {
        ...whereClause,
        statusType: {
          vendor_id: vendorId,
          type: "open",
        },
      },
    });

    // Initial site measurement leads
    const totalInitialSiteMeasurementLeads = await prisma.leadMaster.count({
      where: {
        ...whereClause,
        statusType: {
          type: "initial-site-measurement",
        },
      },
    });

    // Designing stage leads
    const totalDesigningStageLeads = await prisma.leadMaster.count({
      where: {
        ...whereClause,
        statusType: {
          vendor_id: vendorId,
          type: "designing-stage",
        },
      },
    });

    // Designing stage leads
    const totalBookingStageLeads = await prisma.leadMaster.count({
      where: {
        ...whereClause,
        statusType: {
          vendor_id: vendorId,
          type: "booking-stage",
        },
      },
    });

    // Final Measurement stage leads
    const totalFinalMeasurementStageLeads = await prisma.leadMaster.count({
      where: {
        ...whereClause,
        statusType: {
          vendor_id: vendorId,
          type: "final-site-measurement-stage",
        },
      },
    });

    const totalClientDocumentationStageLeads = await prisma.leadMaster.count({
      where: {
        ...whereClause,
        statusType: {
          vendor_id: vendorId,
          type: "client-documentation-stage",
        },
      },
    });

    return {
      total_leads: totalLeads,
      total_open_leads: totalOpenLeads,
      total_initial_site_measurement_leads: totalInitialSiteMeasurementLeads,
      total_designing_stage_leads: totalDesigningStageLeads,
      total_booking_stage_leads: totalBookingStageLeads,
      total_final_measurement_leads: totalFinalMeasurementStageLeads,
      total_client_documentation_leads: totalClientDocumentationStageLeads
    };
  }
}