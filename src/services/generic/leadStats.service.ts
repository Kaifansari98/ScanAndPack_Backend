import { prisma } from "../../prisma/client";

export class LeadStatsService {
  static async getVendorLeadStats(vendorId: number) {
    // total leads (status = open)
    const totalLeads = await prisma.leadMaster.count({
      where: {
        vendor_id: vendorId,
        is_deleted: false,
        statusType: {
          type: "open",
        },
      },
    });

    // initial site measurement leads
    const totalInitialSiteMeasurementLeads = await prisma.leadMaster.count({
      where: {
        vendor_id: vendorId,
        is_deleted: false,
        statusType: {
          type: "initial-site-measurement",
        },
      },
    });

    // designing stage leads
    const totalDesigningStageLeads = await prisma.leadMaster.count({
      where: {
        vendor_id: vendorId,
        is_deleted: false,
        statusType: {
          type: "designing-stage",
        },
      },
    });

    return {
      total_leads: totalLeads,
      total_initial_site_measurement_leads: totalInitialSiteMeasurementLeads,
      total_designing_stage_leads: totalDesigningStageLeads,
    };
  }
}
