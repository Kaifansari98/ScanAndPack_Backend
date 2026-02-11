import { Request, Response } from "express";
import { TechCheckService } from "../../../../services/production/tech-check/tech-check.service";
import { prisma } from "../../../../prisma/client";
import { NotificationService } from "../../../../services/notification/notification.service";
import { NotificationType } from "../../../../prisma/generated";

const techCheckService = new TechCheckService();

export class TechCheckController {
  // ✅ Get All Tech-Check Leads
  public static getAllTechCheckLeads = async (req: Request, res: Response) => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const userId = parseInt(req.params.userId);

      if (!vendorId || !userId) {
        return res.status(400).json({
          success: false,
          message: "Vendor ID and User ID are required",
        });
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const leads = await techCheckService.getLeadsWithStatusTechCheck(
        vendorId,
        userId,
        limit,
        page
      );

      return res.status(200).json({
        success: true,
        message: "Tech Check leads fetched successfully",
        count: leads.total,
        data: leads,
      });
    } catch (error: any) {
      console.error("[TechCheckController] getAllTechCheckLeads Error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  // ✅ Approve Tech Check
  public static approveTechCheck = async (req: Request, res: Response) => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const leadId = parseInt(req.params.leadId);
      const userId = parseInt(req.params.userId);

      const {
        assign_to_user_id,
        account_id,
        product_structure_instance_id,
      } = req.body;

      const instanceId = product_structure_instance_id
        ? Number(product_structure_instance_id)
        : undefined;

      // Instance-wise completion path
      if (instanceId) {
        const result = await techCheckService.approveTechCheck(
          vendorId,
          leadId,
          userId,
          Number(assign_to_user_id || 0),
          Number(account_id || 0),
          instanceId
        );

        if (result?.moved_to_order_login && result?.assign_to_user_id) {
          try {
            const assignee = await prisma.userMaster.findUnique({
              where: { id: Number(result.assign_to_user_id) },
              select: {
                user_type: { select: { user_type: true } },
              },
            });
            const assigneeRole = assignee?.user_type?.user_type?.toLowerCase();
            if (assigneeRole !== "admin" && assigneeRole !== "super-admin") {
              const lead = await prisma.leadMaster.findUnique({
                where: { id: leadId },
                select: { firstname: true, lastname: true },
              });
              const leadName = `${lead?.firstname ?? ""} ${lead?.lastname ?? ""}`.trim();

              await NotificationService.createAndSend({
                vendor_id: vendorId,
                user_id: Number(result.assign_to_user_id),
                sender_id: userId,
                type: NotificationType.LEAD_ASSIGNED,
                title: "Lead assigned",
                message:
                  leadName.length > 0
                    ? `Lead ${leadName} has been assigned to you.`
                    : "A lead has been assigned to you.",
                entity_type: "lead",
                entity_id: leadId,
                redirect_url: `/dashboard/leads/details/${leadId}?accountId=${result.account_id || account_id}`,
              });
            }
          } catch (notificationError: any) {
            console.error("⚠️ Failed to send order-login assignment notification", {
              error: notificationError?.message,
              lead_id: leadId,
              assignee_user_id: result.assign_to_user_id,
            });
          }
        }

        return res.status(200).json({
          success: true,
          message: result?.moved_to_order_login
            ? "All instances completed. Lead moved to Order Login"
            : "Tech check marked as completed for instance",
          data: result,
        });
      }

      if (
        !vendorId ||
        !leadId ||
        !userId ||
        !assign_to_user_id ||
        !account_id
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Missing required fields (vendorId, leadId, userId, assign_to_user_id, account_id)",
        });
      }

      const result = await techCheckService.approveTechCheck(
        vendorId,
        leadId,
        userId,
        Number(assign_to_user_id),
        Number(account_id),
        undefined
      );

      try {
        const assignee = await prisma.userMaster.findUnique({
          where: { id: Number(assign_to_user_id) },
          select: {
            user_type: { select: { user_type: true } },
          },
        });
        const assigneeRole = assignee?.user_type?.user_type?.toLowerCase();
        if (assigneeRole !== "admin" && assigneeRole !== "super-admin") {
          const lead = await prisma.leadMaster.findUnique({
            where: { id: leadId },
            select: { firstname: true, lastname: true },
          });
          const leadName = `${lead?.firstname ?? ""} ${lead?.lastname ?? ""}`.trim();

          await NotificationService.createAndSend({
            vendor_id: vendorId,
            user_id: Number(assign_to_user_id),
            sender_id: userId,
            type: NotificationType.LEAD_ASSIGNED,
            title: "Lead assigned",
            message:
              leadName.length > 0
                ? `Lead ${leadName} has been assigned to you.`
                : "A lead has been assigned to you.",
            entity_type: "lead",
            entity_id: leadId,
            redirect_url: `/dashboard/leads/details/${leadId}?accountId=${account_id}`,
          });
        }
      } catch (notificationError: any) {
        console.error("⚠️ Failed to send order-login assignment notification", {
          error: notificationError?.message,
          lead_id: leadId,
          assignee_user_id: assign_to_user_id,
        });
      }

      return res.status(200).json({
        success: true,
        message: "Tech check approved & assigned to backend user",
        data: result,
      });
    } catch (error: any) {
      console.error("[TechCheckController] approveTechCheck Error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  // ✅ Approve Multiple Documents
  public static approveMultipleDocuments = async (
    req: Request,
    res: Response
  ) => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const leadId = parseInt(req.params.leadId);
      const userId = parseInt(req.params.userId);
      const { approvedDocs } = req.body;

      if (!vendorId || !leadId || !userId) {
        return res.status(400).json({
          success: false,
          message: "Vendor ID, Lead ID, and User ID are required",
        });
      }

      if (!approvedDocs || !Array.isArray(approvedDocs)) {
        return res.status(400).json({
          success: false,
          message: "approvedDocs array is required",
        });
      }

      const result = await techCheckService.approveMultipleDocuments(
        vendorId,
        leadId,
        userId,
        approvedDocs
      );

      return res.status(200).json({
        success: true,
        message: "Selected documents approved successfully",
        data: result,
      });
    } catch (error: any) {
      console.error(
        "[TechCheckController] approveMultipleDocuments Error:",
        error
      );
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  // ✅ Reject Tech Check
  public static rejectTechCheck = async (req: Request, res: Response) => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const leadId = parseInt(req.params.leadId);
      const userId = parseInt(req.params.userId);
      const { rejectedDocs, remark } = req.body;

      if (!vendorId || !leadId || !userId) {
        return res.status(400).json({
          success: false,
          message: "Vendor ID, Lead ID, and User ID are required",
        });
      }

      if (!rejectedDocs || !Array.isArray(rejectedDocs)) {
        return res.status(400).json({
          success: false,
          message: "RejectedDocs array is required",
        });
      }

      const result = await techCheckService.rejectTechCheck(
        vendorId,
        leadId,
        userId,
        rejectedDocs,
        remark
      );

      return res.status(200).json({
        success: true,
        message: "Tech check rejected successfully",
        data: result,
      });
    } catch (error: any) {
      console.error("[TechCheckController] rejectTechCheck Error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };
}
