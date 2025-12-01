import { Request, Response } from "express";
import {
  createLeadService,
  getClientRequiredCompletionDate,
  getLeadLogsWithDocuments,
  getLeadsByVendor,
  getLeadsByVendorAndUser,
  getSiteSupervisorByVendor,
  softDeleteLead,
  updateLeadService,
  verifyUserTokenService,
} from "../../../services/leadModuleServices/leadsGeneration/leadGeneration.service";
import {
  createLeadSchema,
  validateUpdateLeadInput,
  validateLeadAssignmentInput,
  createLeadDraftSchema,
} from "../../../validations/leadValidation";
import { ApiResponse } from "../../../utils/apiResponse";
import {
  getSalesExecutivesByVendor,
  getSalesExecutiveById,
  assignLeadToUser,
  getLeadById,
  editTaskISMService,
} from "../../../services/leadModuleServices/leadsGeneration/leadGeneration.service";
import { prisma } from "../../../prisma/client";
import logger from "../../../utils/logger";

export class LeadController {
  /**
   * Helper method to explain access levels
   */
  private getAccessExplanation(role: string): string {
    switch (role) {
      case "sales-executive":
        return "You can view leads that you created or that are assigned to you";
      case "admin":
      case "super-admin":
        return "You can view all leads for your vendor";
      default:
        return "You can only view leads that you created";
    }
  }

  /**
   * Create a new lead with optional file attachments
   */
  async createLead(req: Request, res: Response): Promise<Response> {
    logger.info("[CONTROLLER] createLead called");

    try {
      const files = (req.files as Express.MulterS3.File[]) || [];
      const { vendor_id, is_draft } = req.body;
      const draftMode = String(is_draft) === "true";

      // 1. Resolve the vendor's Open status ID dynamically
      const openStatus = await prisma.statusTypeMaster.findFirst({
        where: {
          vendor_id: Number(vendor_id),
          tag: "Type 1", // ✅ Open status
        },
        select: { id: true },
      });

      if (!openStatus) {
        throw new Error(
          `Open status (Type 1) not found for vendor ${vendor_id}`
        );
      }

      const payload = {
        ...req.body,
        site_type_id: req.body.site_type_id
          ? Number(req.body.site_type_id)
          : undefined,
        status_id: openStatus.id, // <-- use openStatus' id here
        source_id: Number(req.body.source_id) || undefined,
        vendor_id: Number(req.body.vendor_id),
        created_by: Number(req.body.created_by),
        assign_to: req.body.assign_to ? Number(req.body.assign_to) : undefined,
        assigned_by: req.body.assigned_by
          ? Number(req.body.assigned_by)
          : undefined,
        product_types: req.body.product_types
          ? [].concat(req.body.product_types)
          : undefined,
        product_structures: req.body.product_structures
          ? [].concat(req.body.product_structures)
          : undefined,
        initial_site_measurement_date: req.body.initial_site_measurement_date
          ? new Date(req.body.initial_site_measurement_date)
          : undefined,
        site_map_link: req.body.site_map_link || null,
      };

      // 🧩 Use draft or full schema dynamically
      const schemaToUse = draftMode ? createLeadDraftSchema : createLeadSchema;

      const { error, value } = schemaToUse.validate(payload, {
        convert: true,
        allowUnknown: true,
      });

      if (error) {
        logger.warn("Validation failed", { details: error.details });
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          details: error.details.map((d) => ({
            field: d.path.join("."),
            message: d.message,
          })),
        });
      }

      if (files.length > 10) {
        logger.warn("Too many files uploaded", { count: files.length });
        return res.status(400).json({
          success: false,
          error: "Too many files",
          details: "Maximum 10 files allowed",
        });
      }

      // Pass raw files to the service (supports Multer S3 files)
      const result = await createLeadService(
        { ...value, is_draft: draftMode },
        files
      );

      return res.status(201).json({
        success: true,
        message: "Lead created successfully",
        data: {
          ...result,
          documentsUploaded: files.length,
        },
      });
    } catch (error: any) {
      logger.error("[ERROR] createLead failed", {
        error: error.message,
        stack: error.stack,
      });
      console.error("[ERROR] createLead:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  /**
   * Fetch all leads for a specific vendor (admin access)
   */
  async fetchLeadsByVendor(req: Request, res: Response): Promise<Response> {
    try {
      const vendorId = parseInt(req.params.vendorId);
      if (isNaN(vendorId)) {
        return res.status(400).json({ error: "Invalid vendorId" });
      }

      const leads = await getLeadsByVendor(vendorId);
      return res.json(leads);
    } catch (error: any) {
      console.error("[CONTROLLER] fetchLeadsByVendor error:", error);
      return res.status(500).json({ error: "Failed to fetch leads" });
    }
  }

  /**
   * Fetch leads for a specific vendor and user with role-based access control
   * - Sales executives: Only see leads created by them OR assigned to them
   * - Admins/Super-admins: See all vendor leads
   * - Other roles: Only see leads created by them
   */
  fetchLeadsByVendorAndUser = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const userId = parseInt(req.params.userId);

      // Validate parameters
      if (isNaN(vendorId) || vendorId <= 0) {
        return res.status(400).json({
          success: false,
          error: "Invalid vendorId provided",
        });
      }

      if (isNaN(userId) || userId <= 0) {
        return res.status(400).json({
          success: false,
          error: "Invalid userId provided",
        });
      }

      console.log(
        `[CONTROLLER] Fetching leads for vendor ${vendorId} and user ${userId}`
      );

      const result = await getLeadsByVendorAndUser(vendorId, userId);

      // Prepare response with metadata
      const response = {
        success: true,
        message: "Leads fetched successfully",
        data: {
          leads: result.leads,
          metadata: {
            total_leads: result.leads.length,
            user_role: result.userInfo.role,
            can_view_all_leads: result.userInfo.canViewAllLeads,
            user_info: result.userInfo.userData,
            filter_applied:
              result.userInfo.role === "sales-executive"
                ? "created_by_or_assigned_to"
                : "all_vendor_leads",
            access_explanation: this.getAccessExplanation(result.userInfo.role),
          },
        },
      };

      console.log(
        `[CONTROLLER] Successfully fetched ${result.leads.length} leads for ${result.userInfo.role}`
      );

      return res.status(200).json(response);
    } catch (error: any) {
      console.error("[CONTROLLER] fetchLeadsByVendorAndUser error:", error);

      // Handle specific error types
      if (error.message.includes("User not found")) {
        return res.status(404).json({
          success: false,
          error: "User not found or inactive",
        });
      }

      if (error.message.includes("not found for vendor")) {
        return res.status(403).json({
          success: false,
          error: "User does not belong to this vendor",
        });
      }

      return res.status(500).json({
        success: false,
        error: "Failed to fetch leads",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // Controller method to fetch a single lead by ID
  fetchLeadById = async (req: Request, res: Response): Promise<Response> => {
    try {
      const leadId = parseInt(req.params.leadId);
      const userId = parseInt(req.params.userId);
      const vendorId = parseInt(req.params.vendorId);

      // Validate parameters
      if (isNaN(leadId) || leadId <= 0) {
        return res.status(400).json({
          success: false,
          error: "Invalid leadId provided",
        });
      }

      if (isNaN(userId) || userId <= 0) {
        return res.status(400).json({
          success: false,
          error: "Invalid userId provided",
        });
      }

      if (isNaN(vendorId) || vendorId <= 0) {
        return res.status(400).json({
          success: false,
          error: "Invalid vendorId provided",
        });
      }

      console.log(
        `[CONTROLLER] Fetching lead ${leadId} for user ${userId} in vendor ${vendorId}`
      );

      const result = await getLeadById(leadId, userId, vendorId);

      // Prepare response with metadata
      const response = {
        success: true,
        message: "Lead fetched successfully",
        data: {
          lead: result.lead,
          metadata: {
            user_role: result.userInfo.role,
            can_view_all_leads: result.userInfo.canViewAllLeads,
            user_info: result.userInfo.userData,
            access_type:
              result.userInfo.role === "sales-executive"
                ? "created_by_or_assigned_to"
                : "all_vendor_leads",
            access_explanation: this.getAccessExplanation(result.userInfo.role),
          },
        },
      };

      console.log(
        `[CONTROLLER] Successfully fetched lead ${leadId} for ${result.userInfo.role}`
      );

      return res.status(200).json(response);
    } catch (error: any) {
      console.error("[CONTROLLER] fetchLeadById error:", error);

      // Handle specific error types
      if (error.message.includes("User not found")) {
        return res.status(404).json({
          success: false,
          error: "User not found or inactive",
        });
      }

      if (error.message.includes("not found for vendor")) {
        return res.status(403).json({
          success: false,
          error: "User does not belong to this vendor",
        });
      }

      if (error.message.includes("Lead not found or access denied")) {
        return res.status(404).json({
          success: false,
          error:
            "Lead not found or you don't have permission to view this lead",
        });
      }

      return res.status(500).json({
        success: false,
        error: "Failed to fetch lead",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * Soft delete a lead
   */
  async deleteLead(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const { deletedBy } = req.params;

      if (!deletedBy) {
        return res.status(400).json({ message: "deletedBy is required" });
      }

      const lead = await softDeleteLead(Number(id), Number(deletedBy));
      return res
        .status(200)
        .json({ message: "Lead deleted successfully", lead });
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  }

  /**
   * Update an existing lead
   */
  async updateLead(req: Request, res: Response): Promise<void> {
    try {
      const leadId = parseInt(req.params.leadId);
      const updatedBy = parseInt(req.params.userId);

      if (!updatedBy || isNaN(updatedBy)) {
        res
          .status(400)
          .json(ApiResponse.error("Invalid user ID provided", 400));
        return;
      }

      // Validate leadId
      if (!leadId || isNaN(leadId)) {
        res
          .status(400)
          .json(ApiResponse.error("Invalid lead ID provided", 400));
        return;
      }

      // Merge updated_by into request body before validation
      const payloadWithUpdatedBy = { ...req.body, updated_by: updatedBy };

      // Validate request body
      const validationResult = validateUpdateLeadInput(payloadWithUpdatedBy);
      if (!validationResult.isValid) {
        res
          .status(400)
          .json(
            ApiResponse.error(
              "Validation failed",
              400,
              validationResult.errors
                ? validationResult.errors.map(
                    (e: any) => `${e.field}: ${e.message}`
                  )
                : undefined
            )
          );
        return;
      }

      console.log(
        "[DEBUG] Controller received update request for lead ID:",
        leadId
      );
      console.log("[DEBUG] Update payload:", req.body);

      // Call service to update lead
      const result = await updateLeadService(leadId, {
        ...req.body,
        updated_by: updatedBy,
      });

      console.log("[INFO] Lead updated successfully:", {
        leadId: result.lead.id,
        accountId: result.account.id,
      });

      res.status(200).json(
        ApiResponse.success(
          {
            lead: {
              id: result.lead.id,
              firstname: result.lead.firstname,
              lastname: result.lead.lastname,
              contact_no: result.lead.contact_no,
              email: result.lead.email,
              site_address: result.lead.site_address,
              site_map_link: result.lead.site_map_link,
              updated_at: result.lead.updated_at,
              initial_site_measurement_date:
                result.lead.initial_site_measurement_date,
            },
            account: {
              id: result.account.id,
              name: result.account.name,
              contact_no: result.account.contact_no,
              email: result.account.email,
              updated_at: result.account.updated_at,
            },
            productTypesUpdated: result.productTypesUpdated,
            productStructuresUpdated: result.productStructuresUpdated,
          },
          "Lead updated successfully",
          200
        )
      );
    } catch (error: any) {
      console.error("[ERROR] Failed to update lead:", error.message);
      console.error("[ERROR] Stack trace:", error.stack);

      // Handle specific error types
      if (error.message.includes("not found")) {
        res.status(404).json(ApiResponse.error(error.message, 404));
        return;
      }

      if (error.message.includes("already exists")) {
        res.status(409).json(ApiResponse.error(error.message, 409));
        return;
      }

      // ✅ Handle invalid date
      if (error.message.includes("Invalid initial_site_measurement_date")) {
        res.status(400).json(ApiResponse.error(error.message, 400));
        return;
      }

      // Generic server error
      res
        .status(500)
        .json(
          ApiResponse.error(
            "An unexpected error occurred while updating the lead",
            500
          )
        );
    }
  }

  /**
   * Fetch all sales executives for a specific vendor
   */
  async fetchSalesExecutivesByVendor(
    req: Request,
    res: Response
  ): Promise<Response> {
    try {
      const vendorId = parseInt(req.params.vendorId);

      // Validate vendorId
      if (isNaN(vendorId) || vendorId <= 0) {
        return res
          .status(400)
          .json(ApiResponse.error("Invalid vendor ID provided", 400));
      }

      console.log(
        `[CONTROLLER] Fetching sales executives for vendor ID: ${vendorId}`
      );

      const salesExecutives = await getSalesExecutivesByVendor(vendorId);

      // Check if any sales executives were found
      if (salesExecutives.length === 0) {
        return res
          .status(200)
          .json(
            ApiResponse.success(
              [],
              "No sales executives found for this vendor",
              200
            )
          );
      }

      console.log(
        `[CONTROLLER] Found ${salesExecutives.length} sales executives`
      );

      return res.status(200).json(
        ApiResponse.success(
          {
            sales_executives: salesExecutives,
            count: salesExecutives.length,
          },
          "Sales executives fetched successfully",
          200
        )
      );
    } catch (error: any) {
      console.error("[CONTROLLER] fetchSalesExecutivesByVendor error:", error);

      return res
        .status(500)
        .json(
          ApiResponse.error(
            "Failed to fetch sales executives",
            500,
            process.env.NODE_ENV === "development" ? error.message : undefined
          )
        );
    }
  }

  /**
   * Fetch all Site Supervisors for a specific vendor
   */
  async fetchSiteSupervisorsByVendor(
    req: Request,
    res: Response
  ): Promise<Response> {
    try {
      const vendorId = parseInt(req.params.vendorId);

      // Validate vendorId
      if (isNaN(vendorId) || vendorId <= 0) {
        return res
          .status(400)
          .json(ApiResponse.error("Invalid vendor ID provided", 400));
      }

      console.log(
        `[CONTROLLER] Fetching Site Supervisors for vendor ID: ${vendorId}`
      );

      const siteSupervisors = await getSiteSupervisorByVendor(vendorId);

      // Check if any sales executives were found
      if (siteSupervisors.length === 0) {
        return res
          .status(200)
          .json(
            ApiResponse.success(
              [],
              "No site supervisors found for this vendor",
              200
            )
          );
      }

      console.log(
        `[CONTROLLER] Found ${siteSupervisors.length} Site Supervisors`
      );

      return res.status(200).json(
        ApiResponse.success(
          {
            site_supervisors: siteSupervisors,
            count: siteSupervisors.length,
          },
          "site supervisors fetched successfully",
          200
        )
      );
    } catch (error: any) {
      console.error("[CONTROLLER] fetchSiteSupervisorsByVendor error:", error);

      return res
        .status(500)
        .json(
          ApiResponse.error(
            "Failed to fetch Site Supervisors",
            500,
            process.env.NODE_ENV === "development" ? error.message : undefined
          )
        );
    }
  }

  /**
   * Fetch a specific sales executive by ID within a vendor
   */
  async fetchSalesExecutiveById(
    req: Request,
    res: Response
  ): Promise<Response> {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const userId = parseInt(req.params.userId);

      // Validate parameters
      if (isNaN(vendorId) || vendorId <= 0) {
        return res
          .status(400)
          .json(ApiResponse.error("Invalid vendor ID provided", 400));
      }

      if (isNaN(userId) || userId <= 0) {
        return res
          .status(400)
          .json(ApiResponse.error("Invalid user ID provided", 400));
      }

      console.log(
        `[CONTROLLER] Fetching sales executive ID: ${userId} for vendor: ${vendorId}`
      );

      const salesExecutive = await getSalesExecutiveById(vendorId, userId);

      if (!salesExecutive) {
        return res
          .status(404)
          .json(
            ApiResponse.error(
              "Sales executive not found or not authorized for this vendor",
              404
            )
          );
      }

      console.log(
        `[CONTROLLER] Sales executive found: ${salesExecutive.user_name}`
      );

      return res
        .status(200)
        .json(
          ApiResponse.success(
            salesExecutive,
            "Sales executive fetched successfully",
            200
          )
        );
    } catch (error: any) {
      console.error("[CONTROLLER] fetchSalesExecutiveById error:", error);

      return res
        .status(500)
        .json(
          ApiResponse.error(
            "Failed to fetch sales executive",
            500,
            process.env.NODE_ENV === "development" ? error.message : undefined
          )
        );
    }
  }

  /**
   * Assign a lead to a sales executive
   * Only accessible to admin and super-admin users
   */
  async assignLead(req: Request, res: Response): Promise<void> {
    try {
      const leadId = parseInt(req.params.leadId);
      const vendorId = parseInt(req.params.vendorId);

      // Validate leadId
      if (isNaN(leadId) || leadId <= 0) {
        res
          .status(400)
          .json(ApiResponse.error("Invalid lead ID provided", 400));
        return;
      }

      // Validate vendorId
      if (isNaN(vendorId) || vendorId <= 0) {
        res
          .status(400)
          .json(ApiResponse.error("Invalid vendor ID provided", 400));
        return;
      }

      console.log(`[CONTROLLER] Lead assignment request received`);
      console.log(`[CONTROLLER] Lead ID: ${leadId}, Vendor ID: ${vendorId}`);
      console.log(`[CONTROLLER] Request body:`, req.body);

      // Validate request payload
      const validationResult = validateLeadAssignmentInput(req.body);
      if (!validationResult.isValid) {
        res
          .status(400)
          .json(
            ApiResponse.error(
              "Validation failed",
              400,
              validationResult.errors
                ? validationResult.errors.map(
                    (e: any) => `${e.field}: ${e.message}`
                  )
                : undefined
            )
          );
        return;
      }

      const assignmentPayload = validationResult.data;

      // Additional validation: ensure assign_to and assign_by are different
      if (assignmentPayload.assign_to === assignmentPayload.assign_by) {
        res
          .status(400)
          .json(
            ApiResponse.error(
              "assign_to and assign_by cannot be the same user",
              400
            )
          );
        return;
      }

      console.log(`[CONTROLLER] Payload validation successful`);
      console.log(
        `[CONTROLLER] Assigning lead to user ${assignmentPayload.assign_to} by user ${assignmentPayload.assign_by}`
      );

      // Call service to assign lead
      const result = await assignLeadToUser(
        leadId,
        vendorId,
        assignmentPayload
      );

      console.log(`[CONTROLLER] Lead assignment successful`);
      console.log(
        `[CONTROLLER] Lead ${result.lead.id} assigned to ${result.assignedTo.user_name}`
      );

      res.status(200).json(
        ApiResponse.success(
          {
            lead: {
              id: result.lead.id,
              name: `${result.lead.firstname} ${result.lead.lastname}`,
              contact_no: result.lead.contact_no,
              email: result.lead.email,
              updated_at: result.lead.updated_at,
            },
            assignment: {
              assigned_to: {
                id: result.assignedTo.id,
                name: result.assignedTo.user_name,
                contact: result.assignedTo.user_contact,
                email: result.assignedTo.user_email,
              },
              assigned_by: {
                id: result.assignedBy.id,
                name: result.assignedBy.user_name,
                contact: result.assignedBy.user_contact,
                email: result.assignedBy.user_email,
              },
              assigned_at: result.lead.updated_at,
            },
            message: `Lead successfully assigned to ${result.assignedTo.user_name}`,
          },
          "Lead assigned successfully",
          200
        )
      );
    } catch (error: any) {
      console.error("[CONTROLLER] Failed to assign lead:", error.message);
      console.error("[CONTROLLER] Stack trace:", error.stack);

      // Handle specific error types
      if (
        error.message.includes("Invalid admin user") ||
        error.message.includes("insufficient permissions")
      ) {
        res
          .status(403)
          .json(
            ApiResponse.error(
              "Access denied. Only admin and super-admin users can assign leads",
              403
            )
          );
        return;
      }

      if (
        error.message.includes("Invalid sales executive") ||
        error.message.includes("not a sales executive")
      ) {
        res
          .status(400)
          .json(
            ApiResponse.error(
              "Invalid assignment target. User must be an active sales executive",
              400
            )
          );
        return;
      }

      if (
        error.message.includes("Lead not found") ||
        error.message.includes("doesn't belong to this vendor")
      ) {
        res
          .status(404)
          .json(
            ApiResponse.error(
              "Lead not found or doesn't belong to this vendor",
              404
            )
          );
        return;
      }

      if (error.message.includes("already assigned")) {
        res.status(409).json(ApiResponse.error(error.message, 409));
        return;
      }

      // Generic server error
      res
        .status(500)
        .json(
          ApiResponse.error(
            "An unexpected error occurred while assigning the lead",
            500,
            process.env.NODE_ENV === "development" ? error.message : undefined
          )
        );
    }
  }

  /**
   * Get lead assignment history (optional feature)
   * Shows who assigned leads to whom and when
   */
  async getLeadAssignmentHistory(
    req: Request,
    res: Response
  ): Promise<Response> {
    try {
      const leadId = parseInt(req.params.leadId);
      const vendorId = parseInt(req.params.vendorId);

      // Validate parameters
      if (isNaN(leadId) || leadId <= 0) {
        return res
          .status(400)
          .json(ApiResponse.error("Invalid lead ID provided", 400));
      }

      if (isNaN(vendorId) || vendorId <= 0) {
        return res
          .status(400)
          .json(ApiResponse.error("Invalid vendor ID provided", 400));
      }

      console.log(
        `[CONTROLLER] Fetching assignment history for lead ${leadId}`
      );

      // This would require a separate table to track assignment history
      // For now, just return current assignment info
      const lead = await prisma.leadMaster.findFirst({
        where: {
          id: leadId,
          vendor_id: vendorId,
          is_deleted: false,
        },
        include: {
          assignedTo: {
            select: {
              id: true,
              user_name: true,
              user_contact: true,
              user_email: true,
            },
          },
          assignedBy: {
            select: {
              id: true,
              user_name: true,
              user_contact: true,
              user_email: true,
            },
          },
        },
      });

      if (!lead) {
        return res.status(404).json(ApiResponse.error("Lead not found", 404));
      }

      const assignmentInfo = {
        lead_id: lead.id,
        lead_name: `${lead.firstname} ${lead.lastname}`,
        current_assignment: {
          assigned_to: lead.assignedTo
            ? {
                id: lead.assignedTo.id,
                name: lead.assignedTo.user_name,
                contact: lead.assignedTo.user_contact,
                email: lead.assignedTo.user_email,
              }
            : null,
          assigned_by: lead.assignedBy
            ? {
                id: lead.assignedBy.id,
                name: lead.assignedBy.user_name,
                contact: lead.assignedBy.user_contact,
                email: lead.assignedBy.user_email,
              }
            : null,
          assigned_at: lead.updated_at,
        },
      };

      return res
        .status(200)
        .json(
          ApiResponse.success(
            assignmentInfo,
            "Lead assignment information retrieved successfully",
            200
          )
        );
    } catch (error: any) {
      console.error("[CONTROLLER] getLeadAssignmentHistory error:", error);

      return res
        .status(500)
        .json(
          ApiResponse.error(
            "Failed to fetch lead assignment history",
            500,
            process.env.NODE_ENV === "development" ? error.message : undefined
          )
        );
    }
  }

  async editTaskISM(req: Request, res: Response): Promise<Response> {
    logger.info("[CONTROLLER] editTaskISM called");

    try {
      const leadId = Number(req.params.leadId);
      const taskId = Number(req.params.taskId);
      const {
        task_type,
        due_date,
        remark,
        user_id,
        updated_by,
        status,
        closed_at,
        closed_by,
      } = req.body;

      if (!leadId || !taskId) {
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          details: [
            !leadId && {
              field: "leadId",
              message: "leadId (param) is required",
            },
            !taskId && {
              field: "taskId",
              message: "taskId (param) is required",
            },
          ].filter(Boolean),
        });
      }

      const result = await editTaskISMService({
        lead_id: leadId,
        task_id: taskId,
        task_type,
        due_date,
        remark,
        assignee_user_id: user_id ? Number(user_id) : undefined,
        updated_by: Number(updated_by),
        status,
        closed_at,
        closed_by: closed_by ? Number(closed_by) : undefined,
      });

      return res.status(200).json({
        success: true,
        message: "ISM task updated successfully",
        data: result,
      });
    } catch (error: any) {
      logger.error("[ERROR] editTaskISM:", { err: error });
      return res.status(500).json({
        success: false,
        error: "Internal server error",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  verifyUserTokenController = async (req: Request, res: Response) => {
    const { token } = req.params;
    try {
      const vendor = await verifyUserTokenService(token);
      return res.json({
        success: true,
        data: {
          // id: vendor.id,
          name: vendor.vendor_name,
          email: vendor.primary_contact_email,
          contact: vendor.primary_contact_number,
        },
      });
    } catch (err: any) {
      return res.status(400).json({
        success: false,
        error: err.message,
      });
    }
  };

  async getLeadLogsWithDocuments(req: Request, res: Response) {
    try {
      const { lead_id, vendor_id } = req.params;
      const limit = Number(req.query.limit) || 10;
      const cursor = req.query.cursor ? Number(req.query.cursor) : undefined;

      if (!lead_id || !vendor_id) {
        return res.status(400).json({
          success: false,
          message: "lead_id and vendor_id are required",
        });
      }

      const { data, meta } = await getLeadLogsWithDocuments({
        lead_id: Number(lead_id),
        vendor_id: Number(vendor_id),
        limit,
        cursor,
      });

      return res.status(200).json({
        success: true,
        message: "Lead logs fetched successfully",
        data,
        meta,
      });
    } catch (error: any) {
      logger.error("[LeadLogsController] Error fetching logs:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch lead logs",
        error: error.message,
      });
    }
  }

  async deleteDocument(req: Request, res: Response) {
    try {
      const { vendorId, documentId } = req.params;
      const { deleted_by } = req.body;

      if (!vendorId || !documentId || !deleted_by) {
        return res.status(400).json({
          success: false,
          message: "vendor_id, document_id, and deleted_by are required",
        });
      }

      // 🧾 Check if document exists and belongs to the vendor
      const existingDoc = await prisma.leadDocuments.findFirst({
        where: {
          id: Number(documentId),
          vendor_id: Number(vendorId),
          is_deleted: false,
        },
        include: {
          lead: true,
          account: true,
        },
      });

      if (!existingDoc) {
        return res.status(404).json({
          success: false,
          message: "Document not found or already deleted",
        });
      }

      // 🧹 Soft delete it
      const updatedDoc = await prisma.leadDocuments.update({
        where: { id: Number(documentId) },
        data: {
          is_deleted: true,
          deleted_by: Number(deleted_by),
          deleted_at: new Date(),
        },
      });

      // 🪵 Step 1: Create LeadDetailedLogs entry
      const detailedLog = await prisma.leadDetailedLogs.create({
        data: {
          vendor_id: Number(vendorId),
          lead_id: existingDoc.lead_id!,
          account_id: existingDoc.account_id!,
          action: `Document "${existingDoc.doc_og_name}" was deleted.`,
          action_type: "DELETE",
          created_by: Number(deleted_by),
        },
      });

      // 🪵 Step 2: Create LeadDocumentLogs entry (linked to detailedLog)
      await prisma.leadDocumentLogs.create({
        data: {
          vendor_id: Number(vendorId),
          lead_id: existingDoc.lead_id!,
          account_id: existingDoc.account_id!,
          doc_id: Number(documentId),
          lead_logs_id: detailedLog.id,
          created_by: Number(deleted_by),
        },
      });

      return res.status(200).json({
        success: true,
        message: "Document deleted successfully (soft delete)",
        data: updatedDoc,
      });
    } catch (error: any) {
      console.error("Error deleting document:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while deleting document",
        error: error.message,
      });
    }
  }

  async getClientRequiredCompletionDate(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const { vendorId, leadId } = req.params;

      if (!vendorId || !leadId) {
        res.status(400).json({
          success: false,
          message: "vendorId and leadId are required.",
        });
        return;
      }

      const date = await getClientRequiredCompletionDate(
        Number(vendorId),
        Number(leadId)
      );

      if (!date) {
        res.status(404).json({
          success: false,
          message: "No completion date found for this lead.",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Client required completion date fetched successfully.",
        data: {
          lead_id: Number(leadId),
          vendor_id: Number(vendorId),
          client_required_order_login_complition_date: date,
        },
      });
    } catch (error: any) {
      console.error(
        "[ClientApprovalController] getClientRequiredCompletionDate error:",
        error
      );
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error.",
      });
    }
  }
}

// Export a single instance of the controller
export const leadController = new LeadController();
