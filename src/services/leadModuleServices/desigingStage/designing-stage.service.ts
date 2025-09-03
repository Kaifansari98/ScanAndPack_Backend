import { prisma } from "../../../prisma/client";

export class DesigingStage {

  public static async addToDesigingStage(
    lead_id: number,
    user_id: number,
    vendor_id: number
  ) {
    // 1. Check if user belongs to the same vendor
    const user = await prisma.userMaster.findFirst({
      where: { id: user_id, vendor_id },
    });

    if (!user) {
      throw new Error("Unauthorized: User does not belong to this vendor");
    }

    // 2. Check lead existence and ownership
    const lead = await prisma.leadMaster.findFirst({
      where: { id: lead_id, vendor_id, is_deleted: false },
    });

    if (!lead) {
      throw new Error("Lead not found for this vendor");
    }

    // 3. Update lead status
    const updatedLead = await prisma.leadMaster.update({
      where: { id: lead_id },
      data: { status_id: 3 }, // ✅ Set to status 3
    });

    // 4. Create log in LeadStatusLogs
    const log = await prisma.leadStatusLogs.create({
      data: {
        lead_id,
        account_id: lead.account_id,
        created_by: user_id,
        vendor_id,
        status_id: 3,
      },
    });

    return { updatedLead, log };
  }

}