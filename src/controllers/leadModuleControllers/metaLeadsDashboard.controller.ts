import { Request, Response } from "express";
import { prisma } from "../../prisma/client";
import logger from "../../utils/logger";

export class MetaLeadsDashboardController {
  /**
   * GET /meta-leads
   * Returns a paginated, searchable, and filterable list of Meta Leads.
   */
  fetchLeads = async (req: Request, res: Response): Promise<Response> => {
    try {
      const search = (req.query.search as string) || "";
      const status = (req.query.status as string) || "";
      const formId = (req.query.form_id as string) || "";
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.max(1, Number(req.query.limit) || 10);
      const skip = (page - 1) * limit;

      const where: any = {};

      // Filter by status
      if (status) {
        where.status = status;
      }

      // Filter by form ID
      if (formId) {
        where.form_id = formId;
      }

      // Search filter (searches name, email, phone, or meta_lead_id)
      if (search) {
        where.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
          { meta_lead_id: { contains: search, mode: "insensitive" } },
        ];
      }

      const [leads, totalCount] = await Promise.all([
        prisma.metaLead.findMany({
          where,
          orderBy: { created_date: "desc" },
          skip,
          take: limit,
        }),
        prisma.metaLead.count({ where }),
      ]);

      const stats = {
        total: await prisma.metaLead.count(),
        new: await prisma.metaLead.count({ where: { status: "New" } }),
        contacted: await prisma.metaLead.count({ where: { status: "Contacted" } }),
        qualified: await prisma.metaLead.count({ where: { status: "Qualified" } }),
        converted: await prisma.metaLead.count({ where: { status: "Converted" } }),
        closed: await prisma.metaLead.count({ where: { status: "Closed" } }),
      };

      const totalPages = Math.ceil(totalCount / limit);

      return res.status(200).json({
        success: true,
        data: {
          leads,
          stats,
          pagination: {
            page,
            limit,
            totalRecords: totalCount,
            totalPages,
          },
        },
      });
    } catch (error: any) {
      logger.error("[META DASHBOARD] Error fetching leads:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to fetch leads",
      });
    }
  };

  /**
   * GET /meta-leads/:id
   * Returns details of a specific Meta Lead.
   */
  fetchLeadById = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = Number(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: "Invalid ID parameter" });
      }

      const lead = await prisma.metaLead.findUnique({
        where: { id },
      });

      if (!lead) {
        return res.status(404).json({ success: false, error: "Lead not found" });
      }

      return res.status(200).json({
        success: true,
        data: lead,
      });
    } catch (error: any) {
      logger.error("[META DASHBOARD] Error fetching lead by ID:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to fetch lead",
      });
    }
  };

  /**
   * PATCH /meta-leads/:id/status
   * Updates status of a lead.
   */
  updateLeadStatus = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = Number(req.params.id);
      const { status } = req.body;

      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: "Invalid ID parameter" });
      }

      const validStatuses = ["New", "Contacted", "Qualified", "Converted", "Closed"];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        });
      }

      const updatedLead = await prisma.metaLead.update({
        where: { id },
        data: { status },
      });

      return res.status(200).json({
        success: true,
        message: `Lead status updated to ${status}`,
        data: updatedLead,
      });
    } catch (error: any) {
      logger.error("[META DASHBOARD] Error updating lead status:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to update lead status",
      });
    }
  };

  /**
   * DELETE /meta-leads/:id
   * Deletes a Meta Lead.
   */
  deleteLead = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = Number(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: "Invalid ID parameter" });
      }

      await prisma.metaLead.delete({
        where: { id },
      });

      return res.status(200).json({
        success: true,
        message: "Lead deleted successfully",
      });
    } catch (error: any) {
      logger.error("[META DASHBOARD] Error deleting lead:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to delete lead",
      });
    }
  };

  /**
   * GET /meta-leads/export
   * Exports Meta Leads as a CSV file.
   */
  exportLeadsCsv = async (req: Request, res: Response): Promise<void> => {
    try {
      const search = (req.query.search as string) || "";
      const status = (req.query.status as string) || "";
      const formId = (req.query.form_id as string) || "";

      const where: any = {};
      if (status) where.status = status;
      if (formId) where.form_id = formId;
      if (search) {
        where.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
          { meta_lead_id: { contains: search, mode: "insensitive" } },
        ];
      }

      const leads = await prisma.metaLead.findMany({
        where,
        orderBy: { created_date: "desc" },
      });

      // Construct CSV content
      const headers = [
        "Lead ID (Meta)",
        "Name",
        "Phone",
        "Email",
        "Form Name",
        "Form ID",
        "Lead Source",
        "Lead Status",
        "Created Date",
        "Custom Fields (JSON)",
      ];

      const csvRows = [headers.join(",")];

      for (const lead of leads) {
        const row = [
          `"${lead.meta_lead_id}"`,
          `"${lead.name.replace(/"/g, '""')}"`,
          `"${lead.phone}"`,
          `"${(lead.email || "").replace(/"/g, '""')}"`,
          `"${(lead.form_name || "").replace(/"/g, '""')}"`,
          `"${lead.form_id || ""}"`,
          `"${lead.lead_source}"`,
          `"${lead.status}"`,
          `"${lead.created_date.toISOString()}"`,
          `"${JSON.stringify(lead.custom_fields || {}).replace(/"/g, '""')}"`,
        ];
        csvRows.push(row.join(","));
      }

      const csvContent = csvRows.join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="meta_leads_export.csv"');
      res.status(200).send(csvContent);
    } catch (error: any) {
      logger.error("[META DASHBOARD] Error exporting CSV:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to export CSV",
      });
    }
  };
}

export const metaLeadsDashboardController = new MetaLeadsDashboardController();
