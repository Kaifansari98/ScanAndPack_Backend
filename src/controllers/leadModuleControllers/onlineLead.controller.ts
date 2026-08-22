import { Request, Response } from "express";
import { prisma } from "../../prisma/client";
import { LeadEntryType, LeadCallType, LeadStoreActionType } from "../../../generated/prisma_client/client";
import { generateLeadCode } from "../../utils/generateLeadCode";
import ExcelJS from "exceljs";
import { Readable } from "stream";

// Helpers to get path params
const getParam = (param: any): string => {
  return typeof param === "string" ? param : "";
};

const mapOnlineLeadToFrontend = (lead: any) => {
  if (!lead) return null;
  return {
    ...lead,
    assignedTo: lead.UserMaster_online_leads_assign_toToUserMaster || null,
    finalAssignedLeads: lead.UserMaster_online_leads_final_assigned_leadsToUserMaster || null,
    createdBy: lead.UserMaster_online_leads_created_byToUserMaster || null,
    franchise: lead.FranchiseMaster || null,
    followupStatus: lead.online_lead_followup_status || null,
    sourceRelation: lead.SourceMaster || null,
    siteTypeRelation: lead.SiteTypeMaster || null,
    call_log: lead.online_lead_call_log ? lead.online_lead_call_log.map((c: any) => ({
      ...c,
      telecaller: c.UserMaster || null,
      status: c.online_lead_followup_status || null,
    })) : undefined,
    online_lead_history: lead.online_lead_history ? lead.online_lead_history.map((h: any) => ({
      ...h,
      createdBy: h.UserMaster || null,
      status: h.online_lead_followup_status || null,
      franchise: h.FranchiseMaster || null,
    })) : undefined,
    store_logs: lead.online_lead_store_log ? lead.online_lead_store_log.map((sl: any) => ({
      ...sl,
      fromFranchise: sl.FranchiseMaster_online_lead_store_log_from_store_idToFranchiseMaster || null,
      toFranchise: sl.FranchiseMaster_online_lead_store_log_to_store_idToFranchiseMaster || null,
      selectedBy: sl.UserMaster_online_lead_store_log_selected_byToUserMaster || null,
      assignedTo: sl.UserMaster_online_lead_store_log_assigned_toToUserMaster || null,
    })) : undefined,
  };
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
        store_id,
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
      let defaultStatus = await prisma.online_lead_followup_status.findFirst({
        where: {
          vendor_id: Number(vendor_id),
          is_active: true,
        },
      });

      const vendor = await prisma.vendorMaster.findUnique({
        where: { id: Number(vendor_id) },
        select: { is_year_wise_lead_code_enabled: true },
      });

      const lead = await prisma.$transaction(async (tx) => {
        const generatedCode = await generateLeadCode(tx, {
          franchiseId: store_id ? Number(store_id) : undefined,
          vendorId: Number(vendor_id),
        });

        return await tx.online_leads.create({
          data: {
            vendor_id: Number(vendor_id),
            leads_name,
            lead_code: generatedCode,
            email: email || null,
            contact,
            source,
            lead_entry_type: LeadEntryType.ONLINE,
            remark: remark ? remark.trim() : "-",
            status: defaultStatus?.id || null,
            store_id: store_id ? Number(store_id) : null,
            updated_at: new Date(),
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
      });

      // Create history entry
      if (defaultStatus) {
        await prisma.online_lead_history.create({
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

      // Find default Initial status (Pending)
      const walkInStatus = await prisma.online_lead_followup_status.findFirst({
        where: {
          vendor_id: Number(vendor_id),
          status_name: { equals: "Pending", mode: "insensitive" },
          is_active: true,
        },
      });

      if (!walkInStatus) {
        return res.status(400).json({
          success: false,
          error: "Please configure a 'Pending' follow-up status first.",
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

      const lead = await prisma.$transaction(async (tx) => {
        const generatedCode = await generateLeadCode(tx, {
          franchiseId: Number(store_id),
          vendorId: Number(vendor_id),
        });

        return await tx.online_leads.create({
          data: {
            vendor_id: Number(vendor_id),
            leads_name,
            lead_code: generatedCode,
            email: email || null,
            contact,
            source: "WALK_IN",
            lead_entry_type: LeadEntryType.WALK_IN,
            store_id: Number(store_id),
            assign_to: assignToId,
            status: walkInStatus.id,
            remark: remark ? remark.trim() : "-",
            created_by: Number(created_by),
            updated_at: new Date(),
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
      });

      // Create history
      await prisma.online_lead_history.create({
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
      await prisma.online_lead_store_log.create({
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
      const source = req.query.source as string || "";

      if (isNaN(vendorId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid or missing vendor_id parameter",
        });
      }

      const where: any = {
        vendor_id: vendorId,
        NOT: {
          online_lead_followup_status: {
            status_name: {
              in: ["Store Assigned", "Store Visit Done"],
              mode: "insensitive",
            },
          },
        },
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

      // Apply status, store and source filters
      if (statusId) {
        where.status = statusId;
      }
      if (storeId) {
        where.store_id = storeId;
      }
      if (source) {
        if (source === "WALK_IN") {
          where.lead_entry_type = "WALK_IN";
        } else if (source === "ONLINE") {
          where.lead_entry_type = "ONLINE";
        } else {
          where.source = source;
        }
      }

      const leads = await prisma.online_leads.findMany({
        where,
        include: {
          UserMaster_online_leads_assign_toToUserMaster: {
            select: {
              id: true,
              user_name: true,
              user_email: true,
            },
          },
          UserMaster_online_leads_final_assigned_leadsToUserMaster: {
            select: {
              id: true,
              user_name: true,
              user_email: true,
            },
          },
          UserMaster_online_leads_created_byToUserMaster: {
            select: {
              id: true,
              user_name: true,
            },
          },
          FranchiseMaster: {
            select: {
              id: true,
              franchise_name: true,
            },
          },
          online_lead_followup_status: true,
          SourceMaster: {
            select: {
              id: true,
              type: true,
            },
          },
          SiteTypeMaster: {
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
        data: leads.map(mapOnlineLeadToFrontend),
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

      const lead = await prisma.online_leads.findUnique({
        where: { id },
        include: {
          UserMaster_online_leads_assign_toToUserMaster: {
            select: {
              id: true,
              user_name: true,
              user_email: true,
            },
          },
          UserMaster_online_leads_final_assigned_leadsToUserMaster: {
            select: {
              id: true,
              user_name: true,
              user_email: true,
            },
          },
          UserMaster_online_leads_created_byToUserMaster: {
            select: {
              id: true,
              user_name: true,
            },
          },
          FranchiseMaster: {
            select: {
              id: true,
              franchise_name: true,
            },
          },
          online_lead_followup_status: true,
          SourceMaster: {
            select: {
              id: true,
              type: true,
            },
          },
          SiteTypeMaster: {
            select: {
              id: true,
              type: true,
            },
          },
          online_lead_call_log: {
            include: {
              UserMaster: {
                select: {
                  id: true,
                  user_name: true,
                },
              },
              online_lead_followup_status: true,
            },
            orderBy: {
              created_at: "desc",
            },
          },
          online_lead_history: {
            include: {
              UserMaster: {
                select: {
                  id: true,
                  user_name: true,
                },
              },
              online_lead_followup_status: true,
              FranchiseMaster: {
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
          online_lead_store_log: {
            include: {
              FranchiseMaster_online_lead_store_log_from_store_idToFranchiseMaster: true,
              FranchiseMaster_online_lead_store_log_to_store_idToFranchiseMaster: true,
              UserMaster_online_lead_store_log_selected_byToUserMaster: {
                select: {
                  id: true,
                  user_name: true,
                },
              },
              UserMaster_online_lead_store_log_assigned_toToUserMaster: {
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
        data: mapOnlineLeadToFrontend(lead),
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
      const { assign_to, sales_executive_id, remark, created_by } = req.body;

      if (isNaN(id) || !created_by) {
        return res.status(400).json({
          success: false,
          error: "Required fields: created_by",
        });
      }

      let callerName = "";
      if (assign_to) {
        const callerUser = await prisma.userMaster.findUnique({
          where: { id: Number(assign_to) },
        });
        if (!callerUser) {
          return res.status(404).json({
            success: false,
            error: "Caller user not found",
          });
        }
        callerName = callerUser.user_name;
      }

      let salesExecName = "";
      if (sales_executive_id) {
        const salesExecUser = await prisma.userMaster.findUnique({
          where: { id: Number(sales_executive_id) },
        });
        if (!salesExecUser) {
          return res.status(404).json({
            success: false,
            error: "Sales Executive user not found",
          });
        }
        salesExecName = salesExecUser.user_name;
      }

      // Update lead
      const lead = await prisma.online_leads.update({
        where: { id },
        data: {
          assign_to: assign_to ? Number(assign_to) : null,
          final_assigned_leads: sales_executive_id ? Number(sales_executive_id) : null,
        },
      });

      // Synchronize with LeadMaster if already converted
      const contact_no = lead.contact.replace(/\D/g, "");
      const existingLead = await prisma.leadMaster.findFirst({
        where: {
          vendor_id: lead.vendor_id,
          contact_no,
          is_deleted: false,
        },
      });

      if (existingLead) {
        // Sync Sales Executive to LeadMaster
        await prisma.leadMaster.update({
          where: { id: existingLead.id },
          data: {
            assign_to: sales_executive_id ? Number(sales_executive_id) : null,
          },
        });

        // Sync Caller to LeadUserMapping (type: "ISM")
        if (assign_to) {
          const callerId = Number(assign_to);
          const existingMapping = await prisma.leadUserMapping.findFirst({
            where: {
              lead_id: existingLead.id,
              type: "ISM",
            },
          });

          if (existingMapping) {
            await prisma.leadUserMapping.update({
              where: { id: existingMapping.id },
              data: {
                user_id: callerId,
                status: "active",
              },
            });
          } else {
            await prisma.leadUserMapping.create({
              data: {
                vendor_id: lead.vendor_id,
                account_id: existingLead.account_id ?? 0,
                lead_id: existingLead.id,
                user_id: callerId,
                type: "ISM",
                status: "active",
                created_by: Number(created_by),
              },
            });
          }
        } else {
          // If Caller is cleared, remove ISM mappings for this lead
          await prisma.leadUserMapping.deleteMany({
            where: {
              lead_id: existingLead.id,
              type: "ISM",
            },
          });
        }
      }

      // Prepare assignment history remark
      const descParts = [];
      if (callerName) descParts.push(`Caller: ${callerName}`);
      else if (assign_to === null) descParts.push("Caller: Unassigned");

      if (salesExecName) descParts.push(`Sales Executive: ${salesExecName}`);
      else if (sales_executive_id === null) descParts.push("Sales Executive: Unassigned");

      const finalRemark = remark || `Lead assignments updated (${descParts.join(", ")})`;

      // Create history
      await prisma.online_lead_history.create({
        data: {
          vendor_id: lead.vendor_id,
          online_lead_id: lead.id,
          remark: finalRemark,
          created_by: Number(created_by),
          online_lead_status_id: lead.status || 1,
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

      const lead = await prisma.online_leads.findUnique({ where: { id } });
      if (!lead) {
        return res.status(404).json({ success: false, error: "Lead not found" });
      }

      const status = await prisma.online_lead_followup_status.findUnique({
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

      const statusNameLower = status.status_name.toLowerCase();
      const shouldCreateDraft =
        statusNameLower === "store assigned" ||
        statusNameLower === "store visit done";

      let targetStoreId: number | null = lead.store_id;
      if (store_preference_option === "No Preference") {
        targetStoreId = null;
      } else if (store_preference_option === "Another Store" && store_id !== undefined) {
        targetStoreId = store_id ? Number(store_id) : null;
      } else if (store_id !== undefined) {
        targetStoreId = store_id ? Number(store_id) : null;
      }

      if (shouldCreateDraft && !targetStoreId) {
        return res.status(400).json({
          success: false,
          error: `Please assign a store to this lead before setting status to '${status.status_name}'`,
        });
      }

      const { updatedLead, callLog } = await prisma.$transaction(async (tx) => {
        // 1. Create Call Log
        const callLog = await tx.online_lead_call_log.create({
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
        await tx.online_lead_history.create({
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
        let targetStoreId: number | null = lead.store_id;
        if (store_preference_option === "No Preference") {
          targetStoreId = null;
        } else if (store_preference_option === "Another Store" && store_id !== undefined) {
          targetStoreId = store_id ? Number(store_id) : null;
        } else if (store_id !== undefined) {
          targetStoreId = store_id ? Number(store_id) : null;
        }

        const finalLeadCode = await this.updateLeadCodeForStore(
          tx,
          lead.id,
          targetStoreId,
          lead.vendor_id,
          lead.lead_code
        );

        const updatedLead = await tx.online_leads.update({
          where: { id },
          data: {
            status: status.id,
            // Only update remark if user entered an actual non-empty remark string
            ...(remark && remark.trim() !== "" && { remark: remark.trim() }),
            follow_up_date: follow_up_date ? new Date(follow_up_date) : null,
            store_id: targetStoreId,
            lead_code: finalLeadCode,
          },
        });

        // 4. Check if LeadMaster already exists with this contact number
        const contact_no = lead.contact.replace(/\D/g, "");
        const existingLead = await tx.leadMaster.findFirst({
          where: {
            vendor_id: lead.vendor_id,
            contact_no,
            is_deleted: false,
          },
        });

        // If status is "Store Assigned" or "Store Visit Done", auto-create/update a Draft Lead in the main CRM pipeline
        const statusNameLower = status.status_name.toLowerCase();
        const shouldCreateDraft =
          statusNameLower === "store assigned" ||
          statusNameLower === "store visit done";

        if (shouldCreateDraft) {
          if (existingLead) {
            // Update existing LeadMaster
            await tx.leadMaster.update({
              where: { id: existingLead.id },
              data: {
                franchise_id: targetStoreId,
                lead_code: finalLeadCode || existingLead.lead_code,
                is_draft: true, // Ensure it is marked as draft
                assign_to: lead.final_assigned_leads, // Carry over Sales Executive
              },
            });
          } else {
            // Find or create AccountMaster
            const matchConditions = [];
            if (contact_no) {
              matchConditions.push({ contact_no });
              matchConditions.push({ alt_contact_no: contact_no });
            }
            if (lead.alt_contact_no) {
              const alt_contact = lead.alt_contact_no.replace(/\D/g, "");
              matchConditions.push({ contact_no: alt_contact });
              matchConditions.push({ alt_contact_no: alt_contact });
            }
            if (lead.email) {
              matchConditions.push({ email: lead.email.trim() });
            }

            let account = null;
            if (matchConditions.length > 0) {
              account = await tx.accountMaster.findFirst({
                where: {
                  vendor_id: lead.vendor_id,
                  is_deleted: false,
                  OR: matchConditions,
                },
              });
            }

            if (!account) {
              account = await tx.accountMaster.create({
                data: {
                  name: lead.leads_name,
                  country_code: "91",
                  contact_no,
                  alt_contact_no: lead.alt_contact_no || null,
                  email: lead.email ? lead.email.trim() : "",
                  vendor_id: lead.vendor_id,
                  franchise_id: targetStoreId,
                  created_by: Number(telecaller_id),
                },
              });
            }

            // Fetch status ID for Type 1 (Draft/Open Leads stage) for this vendor
            const statusType = await tx.statusTypeMaster.findFirst({
              where: { vendor_id: lead.vendor_id, tag: "Type 1" },
              select: { id: true },
            });
            const mainPipelineStatusId = statusType?.id || 1;

            // Create LeadMaster as Draft
            const newLead = await tx.leadMaster.create({
              data: {
                lead_code: finalLeadCode || "",
                firstname: lead.firstname || lead.leads_name,
                lastname: lead.lastname || "",
                country_code: "91",
                contact_no,
                alt_contact_no: lead.alt_contact_no || null,
                email: lead.email ? lead.email.trim() : "",
                site_address: lead.site_address || null,
                site_type_id: lead.site_type_id || null,
                status_id: mainPipelineStatusId,
                source_id: lead.source_id || null,
                refered_by: lead.refered_by || null,
                archetech_name: lead.archetech_name || null,
                archetech_number: lead.archetech_number || null,
                vendor_id: lead.vendor_id,
                franchise_id: targetStoreId,
                created_by: Number(telecaller_id),
                priority: lead.priority || "Medium",
                account_id: account.id,
                is_draft: true, // Mark as draft so it appears in "Draft Leads"
                assign_to: lead.final_assigned_leads, // Carry over Sales Executive
              },
            });

            // Map product types from online lead to main pipeline
            if (Array.isArray(lead.product_types) && lead.product_types.length > 0) {
              const uniqueTypes: string[] = Array.from(
                new Set(
                  (lead.product_types as any[])
                    .map((s: any) => String(s || "").trim())
                    .filter(Boolean)
                )
              );
              for (const typeStr of uniqueTypes) {
                const foundType = await tx.productTypeMaster.findFirst({
                  where: {
                    vendor_id: lead.vendor_id,
                    type: { equals: typeStr, mode: "insensitive" },
                  },
                  select: { id: true },
                });
                if (foundType) {
                  await tx.leadProductMapping.create({
                    data: {
                      vendor_id: lead.vendor_id,
                      lead_id: newLead.id,
                      account_id: account.id,
                      product_type_id: foundType.id,
                      created_by: Number(telecaller_id),
                    },
                  });
                }
              }
            }

            // Map product structures from online lead to main pipeline
            if (Array.isArray(lead.product_structures) && lead.product_structures.length > 0) {
              const uniqueStructs: string[] = Array.from(
                new Set(
                  (lead.product_structures as any[])
                    .map((s: any) => String(s || "").trim())
                    .filter(Boolean)
                )
              );
              for (const structStr of uniqueStructs) {
                const foundStruct = await tx.productStructure.findFirst({
                  where: {
                    vendor_id: lead.vendor_id,
                    type: { equals: structStr, mode: "insensitive" },
                  },
                  select: { id: true },
                });
                if (foundStruct) {
                  await tx.leadProductStructureMapping.create({
                    data: {
                      vendor_id: lead.vendor_id,
                      lead_id: newLead.id,
                      account_id: account.id,
                      product_structure_id: foundStruct.id,
                      created_by: Number(telecaller_id),
                    },
                  });
                }
              }
            }

            // Create LeadUserMapping for assignee/creator
            await tx.leadUserMapping.create({
              data: {
                vendor_id: lead.vendor_id,
                account_id: account.id,
                lead_id: newLead.id,
                user_id: lead.assign_to || Number(telecaller_id), // Carry over Caller
                type: "ISM",
                status: "active",
                created_by: Number(telecaller_id),
              },
            });

            // Create Chat Room
            const chatRoom = await tx.leadChatRoom.create({
              data: {
                lead_id: newLead.id,
                vendor_id: lead.vendor_id,
              },
            });

            // Add members to Chat Room (admins + superadmins + caller)
            const superAdminUsers = await tx.userMaster.findMany({
              where: {
                vendor_id: lead.vendor_id,
                status: "active",
                user_type: { user_type: "super-admin" },
              },
              select: { id: true },
            });

            const adminUsers = targetStoreId
              ? await tx.userMaster.findMany({
                  where: {
                    vendor_id: lead.vendor_id,
                    franchise_id: targetStoreId,
                    status: "active",
                    user_type: { user_type: "admin" },
                  },
                  select: { id: true },
                })
              : [];

            const memberIds = new Set<number>([
              ...superAdminUsers.map((user: any) => user.id),
              ...adminUsers.map((user: any) => user.id),
              Number(telecaller_id),
            ]);

            if (memberIds.size > 0) {
              await tx.leadChatMember.createMany({
                data: Array.from(memberIds).map((user_id) => ({
                  chat_room_id: chatRoom.id,
                  user_id,
                  added_by: Number(telecaller_id),
                })),
                skipDuplicates: true,
              });
            }
          }
        } else {
          // If not creating a draft, but the lead is already converted, sync store/code updates to the LeadMaster record
          if (existingLead) {
            await tx.leadMaster.update({
              where: { id: existingLead.id },
              data: {
                franchise_id: targetStoreId,
                lead_code: finalLeadCode || existingLead.lead_code,
              },
            });
          }
        }

        return { updatedLead, callLog };
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

      const lead = await prisma.online_leads.findUnique({ where: { id } });
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

      const { updatedLead, storeLog } = await prisma.$transaction(async (tx) => {
        const generatedCode = await this.updateLeadCodeForStore(
          tx,
          lead.id,
          Number(to_store_id),
          lead.vendor_id,
          lead.lead_code
        );

        // Update lead store parameters
        const updatedLead = await tx.online_leads.update({
          where: { id },
          data: {
            store_id: Number(to_store_id),
            final_assigned_leads: finalAssignedUserId,
            lead_code: generatedCode,
          },
        });

        // Sync with LeadMaster if already converted
        const contact_no = lead.contact.replace(/\D/g, "");
        const existingLead = await tx.leadMaster.findFirst({
          where: {
            vendor_id: lead.vendor_id,
            contact_no,
            is_deleted: false,
          },
        });

        if (existingLead) {
          await tx.leadMaster.update({
            where: { id: existingLead.id },
            data: {
              franchise_id: Number(to_store_id),
              lead_code: generatedCode || existingLead.lead_code,
            },
          });
        }

        // Log store change
        const storeLog = await tx.online_lead_store_log.create({
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
        await tx.online_lead_history.create({
          data: {
            vendor_id: lead.vendor_id,
            online_lead_id: lead.id,
            remark: `Store assigned/transferred to Store ID: ${to_store_id}. ${assignmentMessage}`,
            created_by: Number(selected_by),
            store_id: Number(to_store_id),
            online_lead_status_id: lead.status || 1, // Keep current status
          },
        });

        return { updatedLead, storeLog };
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

      const statuses = await prisma.online_lead_followup_status.findMany({
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
          user_type: {
            select: {
              user_type: true,
            },
          },
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

      const status = await prisma.online_lead_followup_status.create({
        data: {
          vendor_id: Number(vendor_id),
          status_name,
          followup_required: Boolean(followup_required),
          is_active: true,
          created_by: created_by ? Number(created_by) : null,
          updated_at: new Date(),
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

      const status = await prisma.online_lead_followup_status.update({
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
      const status = await prisma.online_lead_followup_status.update({
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

      const updated = await prisma.online_leads.update({
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
          FranchiseMaster: { select: { id: true, franchise_name: true } },
          online_lead_followup_status: true,
          SourceMaster: { select: { id: true, type: true } },
          SiteTypeMaster: { select: { id: true, type: true } },
          UserMaster_online_leads_assign_toToUserMaster: { select: { id: true, user_name: true } },
          UserMaster_online_leads_final_assigned_leadsToUserMaster: { select: { id: true, user_name: true } },
        },
      });

      return res.status(200).json({ success: true, data: mapOnlineLeadToFrontend(updated) });
    } catch (error: any) {
      console.error("[ONLINE LEAD CONTROLLER] updateLead error:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to update lead",
      });
    }
  };

  // 12. Bulk Upload Leads from Excel/CSV
  bulkUploadLeads = async (req: Request, res: Response): Promise<Response> => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, error: "Excel file is required" });
      }

      const { vendor_id, created_by } = req.body;
      if (!vendor_id || !created_by) {
        return res.status(400).json({
          success: false,
          error: "Required fields: vendor_id, created_by",
        });
      }

      const isCsv = file.originalname.endsWith(".csv") || file.mimetype === "text/csv";
      const workbook = new ExcelJS.Workbook();
      if (isCsv) {
        const stream = Readable.from(file.buffer as any);
        await workbook.csv.read(stream as any);
      } else {
        await workbook.xlsx.load(file.buffer as any);
      }

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        return res.status(400).json({ success: false, error: "No sheets found in the file" });
      }

      const headers: string[] = [];
      const rows: Record<string, string>[] = [];

      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) {
          row.eachCell({ includeEmpty: true }, (cell) => {
            const val = cell.value;
            let strVal = "";
            if (val !== null && val !== undefined) {
              if (typeof val === "object" && "richText" in val && Array.isArray(val.richText)) {
                strVal = val.richText.map((t: any) => t.text).join("");
              } else if (typeof val === "object" && "text" in val) {
                strVal = String(val.text ?? "");
              } else {
                strVal = String(val);
              }
            }
            // Strip spaces, underscores, and lowercase
            headers.push(strVal.trim().toLowerCase().replace(/[\s_]+/g, ""));
          });
        } else {
          const rowData: Record<string, string> = {};
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const headerName = headers[colNumber - 1];
            if (headerName) {
              const val = cell.value;
              let strVal = "";
              if (val !== null && val !== undefined) {
                if (typeof val === "object" && "richText" in val && Array.isArray(val.richText)) {
                  strVal = val.richText.map((t: any) => t.text).join("");
                } else if (typeof val === "object" && "text" in val) {
                  strVal = String(val.text ?? "");
                } else {
                  strVal = String(val);
                }
              }
              rowData[headerName] = strVal.trim();
            }
          });
          rows.push(rowData);
        }
      });

      if (rows.length === 0) {
        return res.status(400).json({ success: false, error: "Excel sheet is empty" });
      }

      // Find default Initial status (Pending)
      const walkInStatus = await prisma.online_lead_followup_status.findFirst({
        where: {
          vendor_id: Number(vendor_id),
          status_name: { equals: "Pending", mode: "insensitive" },
          is_active: true,
        },
      });

      if (!walkInStatus) {
        return res.status(400).json({
          success: false,
          error: "Please configure a 'Pending' follow-up status first.",
        });
      }

      // Fallback franchise lookup removed; general vendor code prefix used by default
      const vendor = await prisma.vendorMaster.findUnique({
        where: { id: Number(vendor_id) },
        select: { vendor_code: true },
      });
      const vendorCode = vendor?.vendor_code || "FURNIX";

      const franchises = await prisma.franchiseMaster.findMany({
        where: { vendor_id: Number(vendor_id) },
        select: { id: true, franchise_name: true, franchise_code: true },
      });

      const keywordMappings = franchises.map(f => {
        const kws: string[] = [];
        const cleanName = f.franchise_name.toLowerCase()
          .replace("vloq", "")
          .replace("furnix", "")
          .replace("ho", "")
          .replace("b2b", "")
          .trim();
        if (cleanName.length > 2) kws.push(cleanName);

        const cleanCode = (f.franchise_code || "").toLowerCase()
          .replace("vloq", "")
          .replace("furnix", "")
          .replace("ho", "")
          .replace("b2b", "")
          .trim();
        if (cleanCode.length > 2) kws.push(cleanCode);

        return { id: f.id, keywords: kws };
      });

      let successCount = 0;
      let duplicateCount = 0;
      let invalidCount = 0;
      let failedCount = 0;

      const failedRows: { rowNumber: number; name: string; error: string }[] = [];
      const duplicateRows: { rowNumber: number; name: string; error: string }[] = [];
      const invalidRows: { rowNumber: number; name: string; error: string }[] = [];
      const createdLeads: any[] = [];

      const processedContactsInBatch = new Set<string>();

      const normalizeContactNumber = (num: string): string => {
        let cleaned = String(num).replace(/\D/g, "");
        if (cleaned.length === 12 && cleaned.startsWith("91")) {
          cleaned = cleaned.slice(2);
        } else if (cleaned.length === 11 && cleaned.startsWith("0")) {
          cleaned = cleaned.slice(1);
        }
        return cleaned;
      };

      // Fetch all existing contacts for this vendor
      const existingLeads = await prisma.online_leads.findMany({
        where: { vendor_id: Number(vendor_id) },
        select: { contact: true },
      });
      const existingContactsDb = new Set<string>();
      existingLeads.forEach(l => {
        if (l.contact) {
          existingContactsDb.add(normalizeContactNumber(l.contact));
        }
      });

      for (let i = 0; i < rows.length; i++) {
        const rowData = rows[i];
        const rowNum = i + 2; // Row numbers are 1-based, index 0 is row 2 (row 1 was headers)

        // Find keys in parsed headers mapping to fields (keys are already lowercased and stripped of spaces/underscores)
        const fullnameKey = Object.keys(rowData).find(k => ["fullname", "leadsname", "name"].includes(k));
        const platformKey = Object.keys(rowData).find(k => ["platform", "source", "leadsource"].includes(k));
        const adSetNameKey = Object.keys(rowData).find(k => ["adsetname", "adset_name", "adset"].includes(k));
        const firstnameKey = Object.keys(rowData).find(k => ["firstname"].includes(k));
        const lastnameKey = Object.keys(rowData).find(k => ["lastname"].includes(k));
        const emailKey = Object.keys(rowData).find(k => ["email", "emailid", "emailaddress"].includes(k));
        const contactKey = Object.keys(rowData).find(k => ["contact", "phone", "contactno", "phonenumber", "mobile", "mobileno", "mobilenumber"].includes(k));
        const altContactKey = Object.keys(rowData).find(k => ["altcontactno", "altcontact", "alternativecontact", "alternatenumber"].includes(k));
        const addressKey = Object.keys(rowData).find(k => ["siteaddress", "address"].includes(k));
        const priorityKey = Object.keys(rowData).find(k => ["priority"].includes(k));
        const remarkKey = Object.keys(rowData).find(k => ["remark", "remarks", "description", "notes"].includes(k));

        // Optional City, Budget, Property Type
        const cityKey = Object.keys(rowData).find(k => ["city", "cityname"].includes(k));
        const budgetKey = Object.keys(rowData).find(k => ["budget", "leadbudget"].includes(k));
        const propertyTypeKey = Object.keys(rowData).find(k => ["propertytype", "property"].includes(k));

        let firstname = firstnameKey ? rowData[firstnameKey] : "";
        let lastname = lastnameKey ? rowData[lastnameKey] : "";
        const email = emailKey ? rowData[emailKey] : "";
        const rawContact = contactKey ? rowData[contactKey] : "";
        const altContact = altContactKey ? rowData[altContactKey] : "";
        let siteAddress = addressKey ? rowData[addressKey] : "";
        let priority = priorityKey ? rowData[priorityKey] : "Medium";
        let remark = remarkKey ? rowData[remarkKey] : "";

        const city = cityKey ? rowData[cityKey] : "";
        const budget = budgetKey ? rowData[budgetKey] : "";
        const propertyType = propertyTypeKey ? rowData[propertyTypeKey] : "";
        const rawPlatform = platformKey ? rowData[platformKey] : "";
        const rawAdSetName = adSetNameKey ? rowData[adSetNameKey] : "";

        // Standardize platform/source mapping
        const cleanPlatform = rawPlatform ? String(rawPlatform).trim() : "";
        let source = "WALK_IN";
        let lead_entry_type: LeadEntryType = LeadEntryType.WALK_IN;

        // Map location from store/franchise column or ad_set_name to franchise
        let storeId: number | null = null;
        let leadFranchiseId: number | undefined = undefined;

        const storeKey = Object.keys(rowData).find(k => ["store", "storename", "assignedstore", "storecode", "franchise", "location"].includes(k));
        const rawStoreVal = storeKey ? rowData[storeKey].toLowerCase().trim() : "";

        if (rawStoreVal) {
          const exactFranchise = franchises.find(
            f => (f.franchise_code || "").toLowerCase() === rawStoreVal || f.franchise_name.toLowerCase() === rawStoreVal
          );
          if (exactFranchise) {
            storeId = exactFranchise.id;
            leadFranchiseId = exactFranchise.id;
          } else {
            const matched = keywordMappings.find(km => 
              km.keywords.some(kw => rawStoreVal.includes(kw) || kw.includes(rawStoreVal))
            );
            if (matched) {
              storeId = matched.id;
              leadFranchiseId = matched.id;
            }
          }
        }

        if (!storeId && rawAdSetName) {
          const adsetClean = rawAdSetName.toLowerCase();
          const matched = keywordMappings.find(km =>
            km.keywords.some(kw => adsetClean.includes(kw))
          );
          if (matched) {
            storeId = matched.id;
            leadFranchiseId = matched.id;
          }
        }

        if (cleanPlatform) {
          const platClean = cleanPlatform.toLowerCase();
          if (platClean === "fb" || platClean === "facebook") {
            source = "Facebook";
            lead_entry_type = LeadEntryType.ONLINE;
          } else if (platClean === "ig" || platClean === "instagram") {
            source = "Instagram";
            lead_entry_type = LeadEntryType.ONLINE;
          } else if (platClean === "whatsapp" || platClean === "wa") {
            source = "WhatsApp";
            lead_entry_type = LeadEntryType.ONLINE;
          } else {
            source = cleanPlatform;
            lead_entry_type = LeadEntryType.ONLINE;
          }
        }

        // Standardize Name (Full Name mapping check)
        let leads_name = "";
        const fullname = fullnameKey ? rowData[fullnameKey] : "";
        if (fullname) {
          leads_name = fullname;
          if (!firstname) {
            const parts = fullname.trim().split(/\s+/);
            firstname = parts[0] || "";
            lastname = parts.slice(1).join(" ") || "";
          }
        } else {
          leads_name = `${firstname} ${lastname}`.trim() || "Walk-In Customer";
        }

        // Normalize address and city
        if (city) {
          if (siteAddress) {
            siteAddress = `${siteAddress}, ${city}`;
          } else {
            siteAddress = city;
          }
        }

        // Append Budget & Property Type to remark
        const extraRemarks: string[] = [];
        if (budget) extraRemarks.push(`Budget: ${budget}`);
        if (propertyType) extraRemarks.push(`Property Type: ${propertyType}`);

        if (extraRemarks.length > 0) {
          const suffix = extraRemarks.join(" | ");
          if (remark) {
            remark = `${remark} (${suffix})`;
          } else {
            remark = suffix;
          }
        }

        // Default remark to "-" if not specified
        remark = remark ? remark.trim() : "-";

        // Standardize priority
        if (priority) {
          const pLower = priority.toLowerCase();
          if (pLower.includes("high")) priority = "High";
          else if (pLower.includes("low")) priority = "Low";
          else priority = "Medium";
        } else {
          priority = "Medium";
        }

        const contact = normalizeContactNumber(rawContact);
        if (!contact || contact.length < 10 || contact.length > 15) {
          invalidCount++;
          invalidRows.push({
            rowNumber: rowNum,
            name: leads_name,
            error: "Contact number must be between 10 and 15 digits",
          });
          continue;
        }

        // Check batch duplicate
        if (processedContactsInBatch.has(contact)) {
          duplicateCount++;
          duplicateRows.push({
            rowNumber: rowNum,
            name: leads_name,
            error: "Duplicate contact number in the uploaded sheet",
          });
          continue;
        }

        // Check DB duplicate
        if (existingContactsDb.has(contact)) {
          duplicateCount++;
          duplicateRows.push({
            rowNumber: rowNum,
            name: leads_name,
            error: "Contact number already exists in the database",
          });
          continue;
        }

        // Clean alt contact number
        const cleanAltContact = altContact ? normalizeContactNumber(altContact) : null;

        try {
          const lead = await prisma.$transaction(async (tx) => {
            // Generate code
            const generatedCode = await generateLeadCode(tx, {
              franchiseId: leadFranchiseId || undefined,
              vendorId: Number(vendor_id),
            });

            // Create OnlineLead
            return await tx.online_leads.create({
              data: {
                vendor_id: Number(vendor_id),
                leads_name,
                lead_code: generatedCode,
                email: email || null,
                contact,
                source: source,
                lead_entry_type: lead_entry_type,
                store_id: storeId || null,
                assign_to: null,
                status: walkInStatus.id,
                remark: remark,
                created_by: Number(created_by),
                updated_at: new Date(),
                firstname: firstname || null,
                lastname: lastname || null,
                alt_contact_no: cleanAltContact,
                site_address: siteAddress || null,
                priority,
                product_types: [],
                product_structures: [],
              },
            });
          });

          await prisma.online_lead_history.create({
            data: {
              vendor_id: Number(vendor_id),
              online_lead_id: lead.id,
              remark: remark && remark !== "-" ? `Bulk imported: ${remark}` : "Lead registered via bulk upload",
              created_by: Number(created_by),
              store_id: storeId || null,
              online_lead_status_id: walkInStatus.id,
            },
          });

          processedContactsInBatch.add(contact);
          existingContactsDb.add(contact);
          createdLeads.push(lead);
          successCount++;
        } catch (err: any) {
          let friendlyError = err.message || "Failed to save lead database entry";
          if (err.code === "P2002") {
            friendlyError = "Contact number already exists in the database (unique constraint)";
          }
          failedCount++;
          failedRows.push({
            rowNumber: rowNum,
            name: leads_name,
            error: friendlyError,
          });
        }
      }

      return res.status(200).json({
        success: true,
        data: {
          totalRows: rows.length,
          successCount,
          duplicateCount,
          invalidCount,
          failedCount,
          createdLeads,
          failedRows,
          duplicateRows,
          invalidRows,
        },
      });
    } catch (error: any) {
      console.error("[ONLINE LEAD CONTROLLER] bulkUploadLeads error:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to process bulk upload excel file",
      });
    }
  };

  // DELETE /online-leads/:id
  deleteLead = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: "Invalid lead ID" });
      }

      const lead = await prisma.online_leads.findUnique({
        where: { id },
      });

      if (!lead) {
        return res.status(404).json({ success: false, error: "Lead not found" });
      }

      await prisma.online_leads.delete({
        where: { id },
      });

      return res.status(200).json({ success: true, message: "Lead deleted successfully" });
    } catch (error: any) {
      console.error("[ONLINE LEAD CONTROLLER] deleteLead error:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to delete lead",
      });
    }
  };

  // POST /online-leads/delete-bulk
  deleteBulkLeads = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { vendor_id } = req.body;
      if (!vendor_id) {
        return res.status(400).json({ success: false, error: "vendor_id is required" });
      }

      // 1. Find all history records related to bulk upload for this vendor
      const bulkHistory = await prisma.online_lead_history.findMany({
        where: {
          vendor_id: Number(vendor_id),
          OR: [
            { remark: { startsWith: "Bulk imported:" } },
            { remark: "Lead registered via bulk upload" }
          ]
        },
        select: {
          online_lead_id: true
        }
      });

      const leadIds = bulkHistory
        .map(h => h.online_lead_id)
        .filter((id): id is number => id !== null);

      let deletedCount = 0;

      if (leadIds.length > 0) {
        await prisma.$transaction(async (tx) => {
          // Delete child records first to satisfy foreign key constraints
          await tx.online_lead_history.deleteMany({
            where: { online_lead_id: { in: leadIds } }
          });
          await tx.online_lead_call_log.deleteMany({
            where: { online_lead_id: { in: leadIds } }
          });
          await tx.online_lead_store_log.deleteMany({
            where: { online_lead_id: { in: leadIds } }
          });
          
          // Delete parent online leads
          const deleteResult = await tx.online_leads.deleteMany({
            where: { id: { in: leadIds } }
          });

          deletedCount = deleteResult.count;
        });
      }

      return res.status(200).json({
        success: true,
        message: `Successfully cleaned up ${deletedCount} bulk upload leads.`,
        count: deletedCount,
      });
    } catch (error: any) {
      console.error("[ONLINE LEAD CONTROLLER] deleteBulkLeads error:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to cleanup bulk upload leads",
      });
    }
  };

  private async updateLeadCodeForStore(
    tx: any,
    leadId: number,
    toStoreId: number | null,
    vendorId: number,
    currentLeadCode: string | null | undefined
  ): Promise<string | null | undefined> {
    let storePrefix = "SH";
    if (toStoreId) {
      const franchise = await tx.franchiseMaster.findUnique({
        where: { id: toStoreId },
        select: { city_id: true },
      });

      if (franchise && franchise.city_id) {
        const city = await tx.cityMaster.findUnique({
          where: { id: franchise.city_id },
          select: { name: true },
        });

        if (city && city.name) {
          const citySegment = city.name.replace(/[^A-Za-z]/g, "").toUpperCase();
          if (citySegment) {
            storePrefix = `SH${citySegment}`;
          }
        }
      }
    }

    const needsNewCode = !currentLeadCode ||
                         (storePrefix === "SH" && !currentLeadCode.startsWith("SH-")) ||
                         (storePrefix !== "SH" && !currentLeadCode.startsWith(`${storePrefix}-`));

    if (needsNewCode) {
      return await generateLeadCode(tx, {
        franchiseId: toStoreId || undefined,
        vendorId: vendorId,
      });
    }

    return currentLeadCode;
  }
}

export const onlineLeadController = new OnlineLeadController();
