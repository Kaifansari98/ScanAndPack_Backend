import { Request, Response } from "express";
import { prisma } from "../../prisma/client";
import { LeadEntryType, LeadCallType, LeadStoreActionType } from "../../../generated/prisma_client/client";

// Helpers to get path params
const getParam = (param: any): string => {
  return typeof param === "string" ? param : "";
};

export class OnlineLeadController {
  // 1. Create Lead from API / Integration (ONLINE)
  createOnlineLead = async (req: Request, res: Response): Promise<Response> => {
    try {
      const {
        vendor_id,
        leads_name,
        email,
        contact,
        source,
        remark,
        firstname,
        lastname,
        alt_contact_no,
        site_address,
        site_type_id,
        source_id,
        refered_by,
        archetech_name,
        archetech_number,
        priority,
        product_types,
        product_structures,
      } = req.body;

      if (!vendor_id || !leads_name || !contact || !source) {
        return res.status(400).json({
          success: false,
          error: "Required fields: vendor_id, leads_name, contact, source",
        });
      }

      const cleanContact = String(contact).replace(/\D/g, "");
      if (cleanContact.length < 10) {
        return res.status(400).json({
          success: false,
          error: "Contact number must be at least 10 digits",
        });
      }

      // Find initial status (e.g., Interested or Call Disconnected or look for a default like "New Lead")
      // We will look for an active status for this vendor, if none found, we use a placeholder or create one.
      let defaultStatus = await prisma.onlineLeadFollowupStatus.findFirst({
        where: {
          vendor_id: Number(vendor_id),
          is_active: true,
        },
      });

      const lead = await prisma.onlineLead.create({
        data: {
          vendor_id: Number(vendor_id),
          leads_name,
          email: email || null,
          contact,
          source,
          lead_entry_type: LeadEntryType.ONLINE,
          remark: remark || "Lead received from online source",
          status: defaultStatus?.id || null,
          firstname: firstname || null,
          lastname: lastname || null,
          alt_contact_no: alt_contact_no || null,
          site_address: site_address || null,
          site_type_id: site_type_id ? Number(site_type_id) : null,
          source_id: source_id ? Number(source_id) : null,
          refered_by: refered_by || null,
          archetech_name: archetech_name || null,
          archetech_number: archetech_number || null,
          priority: priority || null,
          product_types: Array.isArray(product_types) ? product_types : [],
          product_structures: Array.isArray(product_structures) ? product_structures : [],
        },
      });

      // Create history entry
      if (defaultStatus) {
        await prisma.onlineLeadHistory.create({
          data: {
            vendor_id: Number(vendor_id),
            online_lead_id: lead.id,
            remark: remark || "Lead created from online source",
            created_by: 1, // System / Admin placeholder ID for automated creation
            online_lead_status_id: defaultStatus.id,
          },
        });
      }

      return res.status(201).json({
        success: true,
        data: lead,
      });
    } catch (error: any) {
      console.error("[ONLINE LEAD CONTROLLER] createOnlineLead error:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to create online lead",
      });
    }
  };

  // 2. Create Store Walk-in Lead
  createWalkInLead = async (req: Request, res: Response): Promise<Response> => {
    try {
      const {
        vendor_id,
        leads_name,
        email,
        contact,
        store_id,
        remark,
        created_by,
        selected_caller_id,
        firstname,
        lastname,
        alt_contact_no,
        site_address,
        site_type_id,
        source_id,
        refered_by,
        archetech_name,
        archetech_number,
        priority,
        product_types,
        product_structures,
      } = req.body;

      if (!vendor_id || !leads_name || !contact || !store_id || !created_by) {
        return res.status(400).json({
          success: false,
          error: "Required fields: vendor_id, leads_name, contact, store_id, created_by",
        });
      }

      const cleanContact = String(contact).replace(/\D/g, "");
      if (cleanContact.length < 10) {
        return res.status(400).json({
          success: false,
          error: "Contact number must be exactly 10 digits",
        });
      }

      // Find Walk-In Customer status
      const walkInStatus = await prisma.onlineLeadFollowupStatus.findFirst({
        where: {
          vendor_id: Number(vendor_id),
          status_name: { equals: "Walk-In Customer", mode: "insensitive" },
          is_active: true,
        },
      });

      if (!walkInStatus) {
        return res.status(400).json({
          success: false,
          error: "Please configure a 'Walk-In Customer' follow-up status first.",
        });
      }

      // Determine Walk-In Assignment Logic
      // 1. Store is fixed (store_id)
      // 2. Find active store admin (role Store Manager or Store Admin)
      // 3. Else find caller (role Telecaller or Store Caller)
      const storeUsers = await prisma.userMaster.findMany({
        where: {
          franchise_id: Number(store_id),
          status: "active",
        },
        include: {
          user_type: true,
        },
      });

      let assignToId: number | null = null;

      const storeAdmins = storeUsers.filter((u) => {
        const role = u.user_type?.user_type?.toLowerCase() || "";
        return role === "store manager" || role === "store admin";
      });

      const storeCallers = storeUsers.filter((u) => {
        const role = u.user_type?.user_type?.toLowerCase() || "";
        return role === "telecaller" || role === "store caller";
      });

      if (storeAdmins.length > 0) {
        // Assign to first store admin
        assignToId = storeAdmins[0].id;
      } else if (storeCallers.length === 1) {
        // Auto assign to single caller
        assignToId = storeCallers[0].id;
      } else if (storeCallers.length > 1) {
        // Multiple callers: use selected caller if provided
        if (selected_caller_id) {
          assignToId = Number(selected_caller_id);
        }
      }

      const lead = await prisma.onlineLead.create({
        data: {
          vendor_id: Number(vendor_id),
          leads_name,
          email: email || null,
          contact,
          source: "WALK_IN",
          lead_entry_type: LeadEntryType.WALK_IN,
          store_id: Number(store_id),
          assign_to: assignToId,
          status: walkInStatus.id,
          remark: remark || "Store Walk-in customer registered",
          created_by: Number(created_by),
          firstname: firstname || null,
          lastname: lastname || null,
          alt_contact_no: alt_contact_no || null,
          site_address: site_address || null,
          site_type_id: site_type_id ? Number(site_type_id) : null,
          source_id: source_id ? Number(source_id) : null,
          refered_by: refered_by || null,
          archetech_name: archetech_name || null,
          archetech_number: archetech_number || null,
          priority: priority || null,
          product_types: Array.isArray(product_types) ? product_types : [],
          product_structures: Array.isArray(product_structures) ? product_structures : [],
        },
      });

      // Create history
      await prisma.onlineLeadHistory.create({
        data: {
          vendor_id: Number(vendor_id),
          online_lead_id: lead.id,
          remark: remark || "Registered as Walk-In customer",
          created_by: Number(created_by),
          store_id: Number(store_id),
          online_lead_status_id: walkInStatus.id,
        },
      });

      // Log initial store preference
      await prisma.onlineLeadStoreLog.create({
        data: {
          vendor_id: Number(vendor_id),
          online_lead_id: lead.id,
          to_store_id: Number(store_id),
          action_type: LeadStoreActionType.PREFERENCE,
          selected_by: Number(created_by),
          assigned_to: assignToId,
          remark: "Walk-in store selection",
        },
      });

      return res.status(201).json({
        success: true,
        data: lead,
      });
    } catch (error: any) {
      console.error("[ONLINE LEAD CONTROLLER] createWalkInLead error:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to create store walk-in lead",
      });
    }
  };

  // 3. Fetch online leads with filters
  fetchLeads = async (req: Request, res: Response): Promise<Response> => {
    try {
      const vendorId = Number(req.query.vendor_id);
      const userId = req.query.userId ? Number(req.query.userId) : null;
      const tab = req.query.tab as string || "pool"; // pool, my, overall
      const search = req.query.search as string || "";
      const statusId = req.query.status_id ? Number(req.query.status_id) : null;
      const storeId = req.query.store_id ? Number(req.query.store_id) : null;

      if (isNaN(vendorId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid or missing vendor_id parameter",
        });
      }

      const where: any = {
        vendor_id: vendorId,
      };

      // Apply tab filters
      if (tab === "pool") {
        where.assign_to = null;
      } else if (tab === "my") {
        if (!userId) {
          return res.status(400).json({
            success: false,
            error: "userId parameter is required for 'my' tab",
          });
        }
        where.assign_to = userId;
      } else if (tab === "overall") {
        // Overall leads has no assignment filter (shows all unassigned + assigned leads for that vendor)
      }

      // Apply search filters
      if (search) {
        where.OR = [
          { leads_name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { contact: { contains: search, mode: "insensitive" } },
        ];
      }

      // Apply status and store filters
      if (statusId) {
        where.status = statusId;
      }
      if (storeId) {
        where.store_id = storeId;
      }

      const leads = await prisma.onlineLead.findMany({
        where,
        include: {
          assignedTo: {
            select: {
              id: true,
              user_name: true,
              user_email: true,
            },
          },
          finalAssignedLeads: {
            select: {
              id: true,
              user_name: true,
              user_email: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              user_name: true,
            },
          },
          franchise: {
            select: {
              id: true,
              franchise_name: true,
            },
          },
          followupStatus: true,
          sourceRelation: {
            select: {
              id: true,
              type: true,
            },
          },
          siteTypeRelation: {
            select: {
              id: true,
              type: true,
            },
          },
        },
        orderBy: {
          created_at: "desc",
        },
      });

      return res.status(200).json({
        success: true,
        data: leads,
      });
    } catch (error: any) {
      console.error("[ONLINE LEAD CONTROLLER] fetchLeads error:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to fetch leads",
      });
    }
  };

  // 4. Fetch lead by ID
  fetchLeadById = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = Number(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({
          success: false,
          error: "Invalid lead ID parameter",
        });
      }

      const lead = await prisma.onlineLead.findUnique({
        where: { id },
        include: {
          assignedTo: {
            select: {
              id: true,
              user_name: true,
              user_email: true,
            },
          },
          finalAssignedLeads: {
            select: {
              id: true,
              user_name: true,
              user_email: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              user_name: true,
            },
          },
          franchise: {
            select: {
              id: true,
              franchise_name: true,
            },
          },
          followupStatus: true,
          sourceRelation: {
            select: {
              id: true,
              type: true,
            },
          },
          siteTypeRelation: {
            select: {
              id: true,
              type: true,
            },
          },
          call_log: {
            include: {
              telecaller: {
                select: {
                  id: true,
                  user_name: true,
                },
              },
              status: true,
            },
            orderBy: {
              created_at: "desc",
            },
          },
          online_lead_history: {
            include: {
              createdBy: {
                select: {
                  id: true,
                  user_name: true,
                },
              },
              status: true,
              franchise: {
                select: {
                  id: true,
                  franchise_name: true,
                },
              },
            },
            orderBy: {
              created_at: "desc",
            },
          },
          store_logs: {
            include: {
              fromFranchise: true,
              toFranchise: true,
              selectedBy: {
                select: {
                  id: true,
                  user_name: true,
                },
              },
              assignedTo: {
                select: {
                  id: true,
                  user_name: true,
                },
              },
            },
            orderBy: {
              created_at: "desc",
            },
          },
        },
      });

      if (!lead) {
        return res.status(404).json({
          success: false,
          error: "Lead not found",
        });
      }

      return res.status(200).json({
        success: true,
        data: lead,
      });
    } catch (error: any) {
      console.error("[ONLINE LEAD CONTROLLER] fetchLeadById error:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to fetch lead details",
      });
    }
  };

  // 5. Assign Lead
  assignLead = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = Number(req.params.id);
      const { assign_to, remark, created_by } = req.body;

      if (isNaN(id) || !assign_to || !created_by) {
        return res.status(400).json({
          success: false,
          error: "Required fields: assign_to, created_by",
        });
      }

      const user = await prisma.userMaster.findUnique({
        where: { id: Number(assign_to) },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: "Assignee user not found",
        });
      }

      const lead = await prisma.onlineLead.update({
        where: { id },
        data: {
          assign_to: Number(assign_to),
        },
      });

      // Create history
      await prisma.onlineLeadHistory.create({
        data: {
          vendor_id: lead.vendor_id,
          online_lead_id: lead.id,
          remark: remark || `Lead assigned to telecaller ${user.user_name}`,
          created_by: Number(created_by),
          online_lead_status_id: lead.status || 1, // Fallback status if null
        },
      });

      return res.status(200).json({
        success: true,
        data: lead,
      });
    } catch (error: any) {
      console.error("[ONLINE LEAD CONTROLLER] assignLead error:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to assign lead",
      });
    }
  };

  // 6. Log Call Outcomes and History Remarks
  logCallAndOutcome = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = Number(req.params.id);
      const {
        telecaller_id,
        call_type,
        online_lead_status_id,
        duration_seconds,
        started_at,
        ended_at,
        remark,
        follow_up_date,
        store_preference_option,
        store_id,
      } = req.body;

      if (isNaN(id) || !telecaller_id || !online_lead_status_id) {
        return res.status(400).json({
          success: false,
          error: "Required fields: telecaller_id, online_lead_status_id",
        });
      }

      const lead = await prisma.onlineLead.findUnique({ where: { id } });
      if (!lead) {
        return res.status(404).json({ success: false, error: "Lead not found" });
      }

      const status = await prisma.onlineLeadFollowupStatus.findUnique({
        where: { id: Number(online_lead_status_id) },
      });

      if (!status) {
        return res.status(404).json({ success: false, error: "Status not found" });
      }

      // Check validation rule: followup_required = Yes (true) -> follow_up_date must be entered
      if (status.followup_required && !follow_up_date) {
        return res.status(400).json({
          success: false,
          error: `Next follow-up date is mandatory for status '${status.status_name}'`,
        });
      }

      // 1. Create Call Log
      const callLog = await prisma.onlineLeadCallLog.create({
        data: {
          vendor_id: lead.vendor_id,
          online_lead_id: lead.id,
          telecaller_id: Number(telecaller_id),
          call_type: call_type === "INCOMING" ? LeadCallType.INCOMING : LeadCallType.OUTGOING,
          online_lead_status_id: status.id,
          started_at: started_at ? new Date(started_at) : null,
          ended_at: ended_at ? new Date(ended_at) : null,
          duration_seconds: duration_seconds ? Number(duration_seconds) : null,
          remark: remark || null,
        },
      });

      // 2. Create Lead History
      await prisma.onlineLeadHistory.create({
        data: {
          vendor_id: lead.vendor_id,
          online_lead_id: lead.id,
          remark: remark || `Call completed with outcome status: ${status.status_name}`,
          created_by: Number(telecaller_id),
          follow_up_date: follow_up_date ? new Date(follow_up_date) : null,
          store_id: store_id ? Number(store_id) : null,
          store_preference_option: store_preference_option || null,
          online_lead_status_id: status.id,
        },
      });

      // 3. Update main OnlineLead for quick reference
      const updatedLead = await prisma.onlineLead.update({
        where: { id },
        data: {
          status: status.id,
          remark: remark || `Status changed to ${status.status_name}`,
          follow_up_date: follow_up_date ? new Date(follow_up_date) : null,
          store_id: store_id ? Number(store_id) : lead.store_id,
        },
      });

      return res.status(200).json({
        success: true,
        data: {
          lead: updatedLead,
          callLog,
        },
      });
    } catch (error: any) {
      console.error("[ONLINE LEAD CONTROLLER] logCallAndOutcome error:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to log call and outcome",
      });
    }
  };

  // 7. Store Assignment Logic & Logger
  assignStore = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = Number(req.params.id);
      const { to_store_id, assigned_to, remark, selected_by } = req.body;

      if (isNaN(id) || !to_store_id || !selected_by) {
        return res.status(400).json({
          success: false,
          error: "Required fields: to_store_id, selected_by",
        });
      }

      const lead = await prisma.onlineLead.findUnique({ where: { id } });
      if (!lead) {
        return res.status(404).json({ success: false, error: "Lead not found" });
      }

      // Run Store Assignment Logic
      // 1. Query active users for the target store
      const storeUsers = await prisma.userMaster.findMany({
        where: {
          franchise_id: Number(to_store_id),
          status: "active",
        },
        include: {
          user_type: true,
        },
      });

      let finalAssignedUserId: number | null = null;
      let assignmentMessage = "";

      const storeAdmins = storeUsers.filter((u) => {
        const role = u.user_type?.user_type?.toLowerCase() || "";
        return role === "store manager" || role === "store admin";
      });

      const storeCallers = storeUsers.filter((u) => {
        const role = u.user_type?.user_type?.toLowerCase() || "";
        return role === "telecaller" || role === "store caller";
      });

      if (storeAdmins.length > 0) {
        // Condition 2: Store Admin available -> Assign to active Store Admin
        finalAssignedUserId = storeAdmins[0].id;
        assignmentMessage = `Assigned to Store Admin: ${storeAdmins[0].user_name}`;
      } else if (storeCallers.length === 1) {
        // Condition 3: No Store Admin + exactly 1 caller -> Auto-assign to that caller
        finalAssignedUserId = storeCallers[0].id;
        assignmentMessage = `Assigned to single Store Caller: ${storeCallers[0].user_name}`;
      } else if (storeCallers.length > 1) {
        // Condition 4: No Store Admin + more than 1 caller
        if (assigned_to) {
          finalAssignedUserId = Number(assigned_to);
          const chosenUser = storeCallers.find((c) => c.id === finalAssignedUserId);
          assignmentMessage = `Assigned to chosen Store Caller: ${chosenUser?.user_name || finalAssignedUserId}`;
        } else {
          // If no caller is selected, return option selection response
          return res.status(200).json({
            success: true,
            requiresSelection: true,
            message: "There is no store admin and more than 1 caller available. Please select a caller.",
            callers: storeCallers.map((c) => ({ id: c.id, name: c.user_name })),
          });
        }
      } else {
        // Condition 5: No Store Admin + no caller
        assignmentMessage = "Store assigned; no active admin or caller found for auto-assignment";
      }

      // Check if store log is a preference (first log) or transfer
      const actionType = lead.store_id
        ? LeadStoreActionType.TRANSFERRED
        : LeadStoreActionType.ASSIGNED;

      // Update lead store parameters
      const updatedLead = await prisma.onlineLead.update({
        where: { id },
        data: {
          store_id: Number(to_store_id),
          final_assigned_leads: finalAssignedUserId,
        },
      });

      // Log store change
      const storeLog = await prisma.onlineLeadStoreLog.create({
        data: {
          vendor_id: lead.vendor_id,
          online_lead_id: lead.id,
          from_store_id: lead.store_id,
          to_store_id: Number(to_store_id),
          action_type: actionType,
          selected_by: Number(selected_by),
          assigned_to: finalAssignedUserId,
          remark: remark || assignmentMessage,
        },
      });

      // Also create history log (store transfer doesn't overwrite general call history logs)
      await prisma.onlineLeadHistory.create({
        data: {
          vendor_id: lead.vendor_id,
          online_lead_id: lead.id,
          remark: `Store assigned/transferred to Store ID: ${to_store_id}. ${assignmentMessage}`,
          created_by: Number(selected_by),
          store_id: Number(to_store_id),
          online_lead_status_id: lead.status || 1, // Keep current status
        },
      });

      return res.status(200).json({
        success: true,
        data: {
          lead: updatedLead,
          storeLog,
        },
      });
    } catch (error: any) {
      console.error("[ONLINE LEAD CONTROLLER] assignStore error:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to assign store",
      });
    }
  };

  // 8. Fetch Statuses
  fetchStatuses = async (req: Request, res: Response): Promise<Response> => {
    try {
      const vendorId = Number(req.query.vendor_id);

      if (isNaN(vendorId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid or missing vendor_id parameter",
        });
      }

      const statuses = await prisma.onlineLeadFollowupStatus.findMany({
        where: {
          vendor_id: vendorId,
          is_active: true,
        },
        orderBy: {
          status_name: "asc",
        },
      });

      return res.status(200).json({
        success: true,
        data: statuses,
      });
    } catch (error: any) {
      console.error("[ONLINE LEAD CONTROLLER] fetchStatuses error:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to fetch statuses",
      });
    }
  };

  // 9. Fetch Store Callers
  fetchStoreCallers = async (req: Request, res: Response): Promise<Response> => {
    try {
      const storeId = Number(req.params.storeId);

      if (isNaN(storeId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid storeId parameter",
        });
      }

      const storeUsers = await prisma.userMaster.findMany({
        where: {
          franchise_id: storeId,
          status: "active",
        },
        include: {
          user_type: true,
        },
      });

      const storeCallers = storeUsers.filter((u) => {
        const role = u.user_type?.user_type?.toLowerCase() || "";
        return role === "telecaller" || role === "store caller";
      });

      return res.status(200).json({
        success: true,
        data: storeCallers.map((c) => ({ id: c.id, name: c.user_name })),
      });
    } catch (error: any) {
      console.error("[ONLINE LEAD CONTROLLER] fetchStoreCallers error:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to fetch store callers",
      });
    }
  };

  // Fetch Telecallers for Vendor
  fetchTelecallers = async (req: Request, res: Response): Promise<Response> => {
    try {
      const vendorId = Number(req.query.vendor_id);
      if (isNaN(vendorId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid or missing vendor_id parameter",
        });
      }

      const users = await prisma.userMaster.findMany({
        where: {
          vendor_id: vendorId,
          status: "active",
          user_email: {
            not: "fsaghori777@gmail.com",
          },
          user_type: {
            user_type: {
              in: [
                "telecaller",
                "telecaller team lead",
                "telecaller-team-lead",
                "sales admin",
                "sales-admin",
                "sales executive",
                "sales-executive",
                "admin",
                "superadmin",
                "super-admin",
              ],
              mode: "insensitive",
            },
          },
        },
        select: {
          id: true,
          user_name: true,
        },
      });

      return res.status(200).json({
        success: true,
        data: users,
      });
    } catch (error: any) {
      console.error("[ONLINE LEAD CONTROLLER] fetchTelecallers error:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to fetch telecallers",
      });
    }
  };

  // 10. CRUD Follow-up Status
  createStatus = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { vendor_id, status_name, followup_required, created_by } = req.body;

      if (!vendor_id || !status_name || followup_required === undefined) {
        return res.status(400).json({
          success: false,
          error: "Required fields: vendor_id, status_name, followup_required",
        });
      }

      const status = await prisma.onlineLeadFollowupStatus.create({
        data: {
          vendor_id: Number(vendor_id),
          status_name,
          followup_required: Boolean(followup_required),
          is_active: true,
          created_by: created_by ? Number(created_by) : null,
        },
      });

      return res.status(201).json({
        success: true,
        data: status,
      });
    } catch (error: any) {
      console.error("[ONLINE LEAD CONTROLLER] createStatus error:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to create status",
      });
    }
  };

  updateStatus = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = Number(req.params.id);
      const { status_name, followup_required, is_active, updated_by } = req.body;

      if (isNaN(id)) {
        return res.status(400).json({
          success: false,
          error: "Invalid status ID parameter",
        });
      }

      const status = await prisma.onlineLeadFollowupStatus.update({
        where: { id },
        data: {
          status_name,
          followup_required: followup_required !== undefined ? Boolean(followup_required) : undefined,
          is_active: is_active !== undefined ? Boolean(is_active) : undefined,
          updated_by: updated_by ? Number(updated_by) : null,
        },
      });

      return res.status(200).json({
        success: true,
        data: status,
      });
    } catch (error: any) {
      console.error("[ONLINE LEAD CONTROLLER] updateStatus error:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to update status",
      });
    }
  };

  deleteStatus = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = Number(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({
          success: false,
          error: "Invalid status ID parameter",
        });
      }

      // Soft delete: toggle is_active to false
      const status = await prisma.onlineLeadFollowupStatus.update({
        where: { id },
        data: {
          is_active: false,
        },
      });

      return res.status(200).json({
        success: true,
        data: status,
      });
    } catch (error: any) {
      console.error("[ONLINE LEAD CONTROLLER] deleteStatus error:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to deactivate status",
      });
    }
  };
  // 10. Update Lead (Edit)
  updateLead = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = Number(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: "Invalid lead ID" });
      }

      const {
        leads_name,
        email,
        contact,
        alt_contact_no,
        site_address,
        remark,
        priority,
        source_id,
        site_type_id,
        refered_by,
        archetech_name,
        archetech_number,
        product_types,
        product_structures,
        updated_by,
      } = req.body;

      const updated = await prisma.onlineLead.update({
        where: { id },
        data: {
          ...(leads_name !== undefined && { leads_name }),
          ...(email !== undefined && { email: email || null }),
          ...(contact !== undefined && { contact: String(contact).replace(/\D/g, "") }),
          ...(alt_contact_no !== undefined && { alt_contact_no: alt_contact_no || null }),
          ...(site_address !== undefined && { site_address: site_address || null }),
          ...(remark !== undefined && { remark: remark || null }),
          ...(priority !== undefined && { priority: priority || null }),
          ...(source_id !== undefined && { source_id: source_id ? Number(source_id) : null }),
          ...(site_type_id !== undefined && { site_type_id: site_type_id ? Number(site_type_id) : null }),
          ...(refered_by !== undefined && { refered_by: refered_by || null }),
          ...(archetech_name !== undefined && { archetech_name: archetech_name || null }),
          ...(archetech_number !== undefined && { archetech_number: archetech_number || null }),
          ...(Array.isArray(product_types) && { product_types }),
          ...(Array.isArray(product_structures) && { product_structures }),
          ...(updated_by !== undefined && { updated_by: updated_by ? Number(updated_by) : null }),
          updated_at: new Date(),
        },
        include: {
          franchise: { select: { id: true, franchise_name: true } },
          followupStatus: true,
          sourceRelation: { select: { id: true, type: true } },
          siteTypeRelation: { select: { id: true, type: true } },
          assignedTo: { select: { id: true, user_name: true } },
          finalAssignedLeads: { select: { id: true, user_name: true } },
        },
      });

      return res.status(200).json({ success: true, data: updated });
    } catch (error: any) {
      console.error("[ONLINE LEAD CONTROLLER] updateLead error:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to update lead",
      });
    }
  };
}

export const onlineLeadController = new OnlineLeadController();
