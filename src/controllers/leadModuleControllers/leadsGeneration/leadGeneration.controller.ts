import { Request, Response } from "express";
import {
  createLeadService,
  getClientRequiredCompletionDate,
  getLeadLogsWithDocuments,
  getLeadsByVendor,
  getLeadsByVendorAndUser,
  getLeadProductStructureInstances,
  deleteLeadProductStructureInstance,
  updateLeadProductStructureInstance,
  createLeadProductStructureInstance,
  getSiteSupervisorByVendor,
  getHeadSiteSupervisorByVendor,
  softDeleteLead,
  updateLeadService,
  verifyUserTokenService,
  isContactOrEmailExists,
  uploadMoreSitePhotosService,
  checkSiteSupervisorAssigned,
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
import { NotificationService } from "../../../services/notification/notification.service";
import { NotificationType } from "../../../prisma/generated";
import { resolveLeadStagePath } from "../../../services/leadModuleServices/leadsGeneration/leadActivityStatus.service";
import {
  sendLeadCreatedEmail,
  sendLeadAssignedEmail,
} from "../../../services/email/brevoEmail.service";
import { generateSignedUrl } from "../../../utils/wasabiClient";
import { cadbidIntegrationWithFurnixcrmService } from "../../../services/cadbid-integration-with-furnixcrm/CadbidIntegrationWithFurnixcrm.service";

const resolveClientBaseUrl = (req: Request): string => {
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin.trim().length > 0) {
    return origin.replace(/\/$/, "");
  }

  const referer = req.headers.referer;
  if (typeof referer === "string" && referer.trim().length > 0) {
    try {
      return new URL(referer).origin;
    } catch {
      return "http://localhost:3000";
    }
  }

  return "http://localhost:3000";
};

const getParam = (param: string | string[] | undefined): string | undefined =>
  Array.isArray(param) ? param[0] : param;

const getSingleBodyValue = (
  value: string | string[] | undefined,
): string | undefined => {
  if (Array.isArray(value)) return value[0];
  return value;
};

// ─── Stage Config (same as frontend STAGES) ───────────────────────────────────

const STAGE_CONFIGS = [
  { id: "ism", tags: ["Type 2", "Type 3", "Type 4"], onlyApproved: false },
  { id: "bookingDone", tags: ["Type 8", "Type 32"], onlyApproved: false },
  { id: "finalMeasurement", tags: ["Type 9", "Type 10"], onlyApproved: false },
  { id: "clientDoc", tags: ["Type 11", "Type 12"], onlyApproved: false },
  { id: "clientApproval", tags: ["Type 13"], onlyApproved: false },
  { id: "techCheck", tags: ["Type 11", "Type 12"], onlyApproved: true },
  {
    id: "production",
    tags: ["Type 15", "Type 16", "Type 17"],
    onlyApproved: false,
  },
  { id: "siteReadiness", tags: ["Type 19"], onlyApproved: false },
  { id: "dispatch", tags: ["Type 21"], onlyApproved: false },
  {
    id: "underInstallation",
    tags: ["Type 25", "Type 26"],
    onlyApproved: false,
  },
  {
    id: "finalHandover",
    tags: ["Type 27", "Type 28", "Type 29", "Type 30", "Type 31"],
    onlyApproved: false,
  },
] as const;

// ─── Types ─────────────────────────────────────────────────────────────────────

interface FlatDoc {
  id: number;
  doc_og_name: string;
  doc_sys_name: string;
  doc_type_id: number;
  doc_type_tag: string;
  doc_type_type: string;
  doc_title: string | null;
  stage: string | null;
  tech_check_status: string | null;
  product_structure_instance_id: number | null;
  instance_title: string | null;
  instance_type: string | null; // ✅ NEW — ProductStructure.type (original name)
  created_at: Date;
  signed_url: string;
}

// One card in UI
interface DocGroup {
  title: string;
  totalDocs: number;
  docs: FlatDoc[];
}

// One instance section (header + its cards)
interface InstanceGroup {
  instanceId: number | null;
  instanceTitle: string | null; // user-defined  e.g. "Kitchen - 1"
  instanceType: string | null; // original name e.g. "Kitchen"
  docGroups: DocGroup[];
}

interface StageResult {
  stageId: string;
  totalFiles: number;
  instanceGroups: InstanceGroup[];
}

// ─── Helper: filter docs for one stage ────────────────────────────────────────

function filterDocsForStage(
  docs: FlatDoc[],
  stage: (typeof STAGE_CONFIGS)[number],
  instanceId: number | null,
): FlatDoc[] {
  return docs.filter((doc) => {
    if (!stage.tags.includes(doc.doc_type_tag as never)) return false;

    if (stage.onlyApproved) {
      const isApproved = doc.tech_check_status === "APPROVED";
      if (instanceId)
        return isApproved && doc.product_structure_instance_id === instanceId;
      return isApproved;
    }

    if (stage.id === "production" && instanceId) {
      return doc.product_structure_instance_id === instanceId;
    }

    return true;
  });
}

function groupByInstance(docs: FlatDoc[]): InstanceGroup[] {
  // ── Step 1: collect unique instances in insertion order ──────────────────
  const instanceMap: Record<string, InstanceGroup> = {};
  const instanceOrder: string[] = [];

  for (const doc of docs) {
    const key =
      doc.product_structure_instance_id != null
        ? String(doc.product_structure_instance_id)
        : "__lead__";

    if (!instanceMap[key]) {
      instanceMap[key] = {
        instanceId: doc.product_structure_instance_id ?? null,
        instanceTitle: doc.instance_title ?? null,
        instanceType: doc.instance_type ?? null,
        docGroups: [],
      };
      instanceOrder.push(key);
    }
  }

  // ── Step 2: for each instance, group its docs by doc_title ───────────────
  for (const instanceKey of instanceOrder) {
    const instanceDocs = docs.filter((doc) => {
      const k =
        doc.product_structure_instance_id != null
          ? String(doc.product_structure_instance_id)
          : "__lead__";
      return k === instanceKey;
    });

    const docGroupMap: Record<string, DocGroup> = {};
    const docGroupOrder: string[] = [];

    for (const doc of instanceDocs) {
      const docTitle = doc.doc_title ?? doc.doc_type_type ?? "Other";
      if (!docGroupMap[docTitle]) {
        docGroupMap[docTitle] = { title: docTitle, totalDocs: 0, docs: [] };
        docGroupOrder.push(docTitle);
      }
      docGroupMap[docTitle].docs.push(doc);
      docGroupMap[docTitle].totalDocs += 1;
    }

    instanceMap[instanceKey].docGroups = docGroupOrder.map(
      (k) => docGroupMap[k],
    );
  }

  // ── Step 3: sort — instance docs first (by instanceId asc), lead-level last
  return instanceOrder
    .map((k) => instanceMap[k])
    .sort((a, b) => {
      if (a.instanceId === null && b.instanceId === null) return 0;
      if (a.instanceId === null) return 1;
      if (b.instanceId === null) return -1;
      return a.instanceId - b.instanceId;
    });
}

// ─── Controller ───────────────────────────────────────────────────────────────

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
      const files = (req.files as Express.Multer.File[]) || [];
      const { vendor_id, is_draft } = req.body;
      const draftMode = String(is_draft) === "true";
      let productStructureInstances = req.body.product_structure_instances;

      if (typeof productStructureInstances === "string") {
        try {
          productStructureInstances = JSON.parse(productStructureInstances);
        } catch (parseError) {
          logger.warn("Invalid product_structure_instances payload", {
            error: (parseError as Error).message,
          });
          productStructureInstances = undefined;
        }
      }

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
          `Open status (Type 1) not found for vendor ${vendor_id}`,
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
        franchise_id: Number(req.body.franchise_id),
        created_by: Number(req.body.created_by),
        priority: getSingleBodyValue(req.body.priority)?.trim() || undefined,
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
        product_structure_instances: Array.isArray(productStructureInstances)
          ? productStructureInstances
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
        files,
      );

      if (!result.draft) {
        try {
          const leadName =
            `${result.lead.firstname} ${result.lead.lastname}`.trim();
          const senderId = value.assigned_by ?? value.created_by;

          const [assignedUser, createdByUser] = await Promise.all([
            value.assign_to
              ? prisma.userMaster.findUnique({
                  where: { id: value.assign_to },
                  select: { user_email: true, user_name: true },
                })
              : Promise.resolve(null),
            prisma.userMaster.findUnique({
              where: { id: value.created_by },
              select: {
                user_name: true,
                user_type: { select: { user_type: true } },
              },
            }),
          ]);

          const creatorRole =
            createdByUser?.user_type?.user_type?.toLowerCase();
          const isAdminCreator =
            creatorRole === "admin" || creatorRole === "super-admin";
          const isSalesExecutiveCreator = creatorRole === "sales-executive";
          const isCreatorAssignee =
            Boolean(value.assign_to) && value.assign_to === value.created_by;

          const clientBaseUrl = resolveClientBaseUrl(req);
          const leadUrl = `${clientBaseUrl}/dashboard/leads/details/${result.lead.id}?accountId=${result.lead.account_id}`;
          const createdOn = result.lead.created_at
            ? new Date(result.lead.created_at).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })
            : new Date().toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              });
          const createdByName =
            createdByUser?.user_name ?? assignedUser?.user_name ?? "System";
          const leadCode =
            (result.lead as any).lead_code ??
            `LEAD-${String(result.lead.id).padStart(4, "0")}`;
          const contactDetails = `${result.lead.country_code ?? ""} ${
            result.lead.contact_no ?? ""
          }`.trim();

          const productTypeIds = Array.isArray(value.product_types)
            ? value.product_types
            : [];
          const productStructureIds = Array.isArray(value.product_structures)
            ? value.product_structures
            : [];
          const [productTypes, productStructures] = await Promise.all([
            productTypeIds.length
              ? prisma.productTypeMaster.findMany({
                  where: {
                    vendor_id: value.vendor_id,
                    id: { in: productTypeIds },
                  },
                  select: { type: true },
                })
              : Promise.resolve([]),
            productStructureIds.length
              ? prisma.productStructure.findMany({
                  where: {
                    vendor_id: value.vendor_id,
                    id: { in: productStructureIds },
                  },
                  select: { type: true },
                })
              : Promise.resolve([]),
          ]);
          const furnitureType =
            productTypes.map((item) => item.type).join(", ") || "—";
          const furnitureStructure =
            productStructures.map((item) => item.type).join(", ") || "—";

          if (
            value.assign_to &&
            !(isSalesExecutiveCreator && isCreatorAssignee)
          ) {
            await NotificationService.createAndSend({
              vendor_id: value.vendor_id,
              user_id: value.assign_to,
              sender_id: senderId,
              type: NotificationType.LEAD_ASSIGNED,
              title: "New lead assigned",
              message: `Lead ${leadName} has been assigned to you.`,
              entity_type: "lead",
              entity_id: result.lead.id,
              redirect_url: resolveLeadStagePath(result.lead.id, "Type 1", result.lead.account_id),
            });
          }

          const emailPayload = {
            vendor_id: value.vendor_id,
            leadCode,
            leadName,
            contact: contactDetails || "—",
            furnitureType,
            furnitureStructure,
            createdDate: createdOn,
            createdBy: createdByName,
            leadUrl,
          };

          if (isAdminCreator && value.assign_to && !isCreatorAssignee) {
            const assigneeEmail = assignedUser?.user_email?.trim();
            if (assigneeEmail) {
              await sendLeadAssignedEmail({
                ...emailPayload,
                toEmail: assigneeEmail,
                toName: assignedUser?.user_name ?? undefined,
              });
            } else {
              logger.warn(
                "Lead assignment email skipped: missing assignee email",
                {
                  lead_id: result.lead.id,
                  assign_to: value.assign_to,
                },
              );
            }
          } else {
            const adminUsers = await prisma.userMaster.findMany({
              where: {
                vendor_id: value.vendor_id,
                status: "active",
                user_type: {
                  user_type: {
                    in: ["admin", "super-admin"],
                    mode: "insensitive",
                  },
                },
                ...(value.franchise_id ? { franchise_id: value.franchise_id } : {}),
              },
              select: { id: true, user_email: true, user_name: true },
            });

            const recipients = adminUsers.filter(
              (user) => user.id !== value.created_by && user.user_email,
            );

            if (recipients.length === 0) {
              logger.warn("Lead created email skipped: no admin recipients", {
                lead_id: result.lead.id,
                created_by: value.created_by,
              });
            } else {
              const redirectUrl = resolveLeadStagePath(result.lead.id, "Type 1", result.lead.account_id);

              await Promise.allSettled([
                ...recipients.map((recipient) =>
                  sendLeadCreatedEmail({
                    ...emailPayload,
                    toEmail: recipient.user_email!,
                    toName: recipient.user_name ?? undefined,
                  }),
                ),
                ...recipients.map((recipient) =>
                  NotificationService.createAndSend({
                    vendor_id: value.vendor_id,
                    user_id: recipient.id,
                    sender_id: value.created_by ?? null,
                    type: NotificationType.LEAD_ASSIGNED,
                    title: "New lead created",
                    message: `Lead ${leadName} has been created.`,
                    entity_type: "lead",
                    entity_id: result.lead.id,
                    redirect_url: redirectUrl,
                  }),
                ),
              ]);
            }
          }
        } catch (notificationError: any) {
          logger.warn("⚠️ Failed to create lead assignment notification", {
            error: notificationError?.message,
            lead_id: result.lead.id,
            assign_to: value.assign_to,
          });
        }
      }

      let cadbidSync:
        | {
            success: boolean;
            status?: number;
            response?: unknown;
            error?: string;
            skipped?: boolean;
            reason?: string;
          }
        | undefined;

      const backendEnvironment = String(
        process.env.BACKEND_ENVIRONMENT || "",
      ).toUpperCase();
      const shouldSyncCadbid =
        backendEnvironment === "LOCAL" || backendEnvironment === "STAGING";

      if (!result.draft && shouldSyncCadbid) {
        try {
          const cadbidResult =
            await cadbidIntegrationWithFurnixcrmService.syncLeadToCadbid(
              value.vendor_id,
              result.lead.id,
            );

          cadbidSync = {
            success: true,
            status: cadbidResult.status,
            response: cadbidResult.response,
          };
        } catch (cadbidError: any) {
          logger.warn("Cadbid sync failed after lead creation", {
            lead_id: result.lead.id,
            vendor_id: value.vendor_id,
            error: cadbidError?.message,
          });

          cadbidSync = {
            success: false,
            error: cadbidError?.message || "Cadbid sync failed",
          };
        }
      } else if (!result.draft) {
        cadbidSync = {
          success: false,
          skipped: true,
          reason:
            "Cadbid sync is enabled only when BACKEND_ENVIRONMENT is LOCAL or STAGING",
        };
      }

      return res.status(201).json({
        success: true,
        message: "Lead created successfully",
        data: {
          ...result,
          documentsUploaded: files.length,
          cadbidSync,
        },
      });
    } catch (error: any) {
      logger.error("[ERROR] createLead failed", {
        error: error.message,
        stack: error.stack,
      });
      console.error("[ERROR] createLead:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || "Internal server error",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  /**
   * Upload more site photos for an existing lead
   */
  async uploadMoreSitePhotos(req: Request, res: Response): Promise<Response> {
    logger.info("[CONTROLLER] uploadMoreSitePhotos called");

    try {
      const files = (req.files as Express.Multer.File[]) || [];
      const { vendor_id, lead_id, created_by } = req.body;

      if (!vendor_id || !lead_id || !created_by) {
        return res.status(400).json({
          success: false,
          error: "vendor_id, lead_id, and created_by are required",
        });
      }

      if (files.length === 0) {
        return res.status(400).json({
          success: false,
          error: "At least one file must be uploaded",
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

      const uploadedDocs = await uploadMoreSitePhotosService(
        {
          vendor_id: Number(vendor_id),
          lead_id: Number(lead_id),
          created_by: Number(created_by),
        },
        files,
      );

      return res.status(200).json({
        success: true,
        message: "Additional site photos uploaded successfully",
        count: uploadedDocs.length,
        data: uploadedDocs,
      });
    } catch (error: any) {
      logger.error("[ERROR] uploadMoreSitePhotos failed", {
        error: error.message,
        stack: error.stack,
      });
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
      const vendorId = Number(getParam(req.params.vendorId));
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
    res: Response,
  ): Promise<Response> => {
    try {
      const vendorId = Number(getParam(req.params.vendorId));
      const userId = Number(getParam(req.params.userId));

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
        `[CONTROLLER] Fetching leads for vendor ${vendorId} and user ${userId}`,
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
        `[CONTROLLER] Successfully fetched ${result.leads.length} leads for ${result.userInfo.role}`,
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
      const leadId = Number(getParam(req.params.leadId));
      const userId = Number(getParam(req.params.userId));
      const vendorId = Number(getParam(req.params.vendorId));

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
        `[CONTROLLER] Fetching lead ${leadId} for user ${userId} in vendor ${vendorId}`,
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
        `[CONTROLLER] Successfully fetched lead ${leadId} for ${result.userInfo.role}`,
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

  fetchLeadProductStructureInstances = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const leadId = Number(req.params.leadId);
      const vendorId = Number(req.params.vendorId);

      if (!leadId || Number.isNaN(leadId)) {
        return res
          .status(400)
          .json(ApiResponse.error("Invalid lead ID provided", 400));
      }

      if (!vendorId || Number.isNaN(vendorId)) {
        return res
          .status(400)
          .json(ApiResponse.error("Invalid vendor ID provided", 400));
      }

      const instances = await getLeadProductStructureInstances(
        leadId,
        vendorId,
      );

      return res
        .status(200)
        .json(
          ApiResponse.success(
            instances,
            "Lead product structure instances fetched successfully",
            200,
          ),
        );
    } catch (error: any) {
      console.error(
        "[CONTROLLER] fetchLeadProductStructureInstances error:",
        error,
      );
      return res
        .status(500)
        .json(
          ApiResponse.error("Failed to fetch product structure instances", 500),
        );
    }
  };

  deleteLeadProductStructureInstance = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const leadId = Number(req.params.leadId);
      const vendorId = Number(req.params.vendorId);
      const instanceId = Number(req.params.instanceId);
      const deletedBy = req.body?.updated_by
        ? Number(req.body.updated_by)
        : null;

      if (!leadId || Number.isNaN(leadId)) {
        return res
          .status(400)
          .json(ApiResponse.error("Invalid lead ID provided", 400));
      }

      if (!vendorId || Number.isNaN(vendorId)) {
        return res
          .status(400)
          .json(ApiResponse.error("Invalid vendor ID provided", 400));
      }

      if (!instanceId || Number.isNaN(instanceId)) {
        return res
          .status(400)
          .json(ApiResponse.error("Invalid instance ID provided", 400));
      }

      await deleteLeadProductStructureInstance(
        leadId,
        vendorId,
        instanceId,
        deletedBy,
      );

      return res
        .status(200)
        .json(
          ApiResponse.success(
            null,
            "Lead product structure instance deleted successfully",
            200,
          ),
        );
    } catch (error: any) {
      const message = error?.message || "Failed to delete instance";
      if (message === "Instance not found") {
        return res.status(404).json(ApiResponse.notFound(message));
      }
      console.error(
        "[CONTROLLER] deleteLeadProductStructureInstance error:",
        error,
      );
      return res
        .status(500)
        .json(ApiResponse.error("Failed to delete instance", 500));
    }
  };

  updateLeadProductStructureInstance = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const leadId = Number(req.params.leadId);
      const vendorId = Number(req.params.vendorId);
      const instanceId = Number(req.params.instanceId);
      const productStructureId = Number(req.body.product_structure_id);
      const title = String(req.body.title || "").trim();
      const description =
        req.body.description !== undefined ? String(req.body.description) : "";
      const updatedBy = req.body.updated_by
        ? Number(req.body.updated_by)
        : null;

      if (!leadId || Number.isNaN(leadId)) {
        return res
          .status(400)
          .json(ApiResponse.error("Invalid lead ID provided", 400));
      }

      if (!vendorId || Number.isNaN(vendorId)) {
        return res
          .status(400)
          .json(ApiResponse.error("Invalid vendor ID provided", 400));
      }

      if (!instanceId || Number.isNaN(instanceId)) {
        return res
          .status(400)
          .json(ApiResponse.error("Invalid instance ID provided", 400));
      }

      if (!productStructureId || Number.isNaN(productStructureId)) {
        return res
          .status(400)
          .json(
            ApiResponse.error("Invalid product structure ID provided", 400),
          );
      }

      if (!title) {
        return res
          .status(400)
          .json(ApiResponse.error("Title is required", 400));
      }

      const updated = await updateLeadProductStructureInstance({
        leadId,
        vendorId,
        instanceId,
        product_structure_id: productStructureId,
        title,
        description,
        updated_by: updatedBy,
      });

      return res
        .status(200)
        .json(
          ApiResponse.success(
            updated,
            "Lead product structure instance updated successfully",
            200,
          ),
        );
    } catch (error: any) {
      const message = error?.message || "Failed to update instance";
      if (message.includes("Instance not found")) {
        return res.status(404).json(ApiResponse.notFound("Instance not found"));
      }
      if (message.includes("Product structure not found")) {
        return res
          .status(404)
          .json(ApiResponse.notFound("Product structure not found"));
      }
      console.error(
        "[CONTROLLER] updateLeadProductStructureInstance error:",
        error,
      );
      return res
        .status(500)
        .json(ApiResponse.error("Failed to update instance", 500));
    }
  };

  createLeadProductStructureInstance = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const leadId = Number(req.params.leadId);
      const vendorId = Number(req.params.vendorId);
      const productStructureId = Number(req.body.product_structure_id);
      const title = String(req.body.title || "").trim();
      const description =
        req.body.description !== undefined ? String(req.body.description) : "";
      const createdBy = Number(req.body.created_by);

      if (!leadId || Number.isNaN(leadId)) {
        return res
          .status(400)
          .json(ApiResponse.error("Invalid lead ID provided", 400));
      }

      if (!vendorId || Number.isNaN(vendorId)) {
        return res
          .status(400)
          .json(ApiResponse.error("Invalid vendor ID provided", 400));
      }

      if (!productStructureId || Number.isNaN(productStructureId)) {
        return res
          .status(400)
          .json(
            ApiResponse.error("Invalid product structure ID provided", 400),
          );
      }

      if (!title) {
        return res
          .status(400)
          .json(ApiResponse.error("Title is required", 400));
      }

      if (!createdBy || Number.isNaN(createdBy)) {
        return res
          .status(400)
          .json(ApiResponse.error("Invalid created_by provided", 400));
      }

      const created = await createLeadProductStructureInstance({
        leadId,
        vendorId,
        product_structure_id: productStructureId,
        title,
        description,
        created_by: createdBy,
      });

      return res
        .status(201)
        .json(
          ApiResponse.success(
            created,
            "Lead product structure instance created successfully",
            201,
          ),
        );
    } catch (error: any) {
      const message = error?.message || "Failed to create instance";
      if (message.includes("Lead not found")) {
        return res.status(404).json(ApiResponse.notFound("Lead not found"));
      }
      if (message.includes("Product structure not found")) {
        return res
          .status(404)
          .json(ApiResponse.notFound("Product structure not found"));
      }
      if (message.includes("Product type not found")) {
        return res
          .status(400)
          .json(ApiResponse.error("Product type not found", 400));
      }
      console.error(
        "[CONTROLLER] createLeadProductStructureInstance error:",
        error,
      );
      return res
        .status(500)
        .json(ApiResponse.error("Failed to create instance", 500));
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
      const leadId = Number(getParam(req.params.leadId));
      const updatedBy = Number(getParam(req.params.userId));

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

      // Remove product-related fields from edit payload
      const sanitizedBody = { ...req.body };
      // delete sanitizedBody.product_types;
      // delete sanitizedBody.product_structures;
      // delete sanitizedBody.product_structure_instances;
      // Never allow franchise changes via update
      delete sanitizedBody.franchise_id;

      // Merge updated_by into request body before validation
      const payloadWithUpdatedBy = { ...sanitizedBody, updated_by: updatedBy };

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
                    (e: any) => `${e.field}: ${e.message}`,
                  )
                : undefined,
            ),
          );
        return;
      }

      console.log(
        "[DEBUG] Controller received update request for lead ID:",
        leadId,
      );
      console.log("[DEBUG] Update payload:", sanitizedBody);

      // Call service to update lead
      const result = await updateLeadService(
        leadId,
        {
          ...sanitizedBody,
          updated_by: updatedBy,
        },
        resolveClientBaseUrl(req),
      );

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
          },
          "Lead updated successfully",
          200,
        ),
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
            500,
          ),
        );
    }
  }

  /**
   * Update lead product type only
   */
  async updateLeadProductType(req: Request, res: Response): Promise<void> {
    try {
      const leadId = Number(getParam(req.params.leadId));
      const updatedBy = Number(getParam(req.params.userId));
      const productTypeId = Number(req.body.product_type_id);
      const productTypeName = req.body.product_type;

      if (!updatedBy || isNaN(updatedBy)) {
        res
          .status(400)
          .json(ApiResponse.error("Invalid user ID provided", 400));
        return;
      }

      if (!leadId || isNaN(leadId)) {
        res
          .status(400)
          .json(ApiResponse.error("Invalid lead ID provided", 400));
        return;
      }

      if ((!productTypeId || isNaN(productTypeId)) && !productTypeName) {
        res
          .status(400)
          .json(
            ApiResponse.error(
              "product_type_id or product_type is required",
              400,
            ),
          );
        return;
      }

      const lead = await prisma.leadMaster.findFirst({
        where: { id: leadId, is_deleted: false },
        select: { id: true, vendor_id: true, account_id: true },
      });

      if (!lead) {
        res.status(404).json(ApiResponse.error("Lead not found", 404));
        return;
      }

      let resolvedProductTypeId = productTypeId;

      if (!resolvedProductTypeId || isNaN(resolvedProductTypeId)) {
        const productType = await prisma.productTypeMaster.findFirst({
          where: {
            vendor_id: lead.vendor_id,
            type: String(productTypeName),
          },
          select: { id: true },
        });

        if (!productType) {
          res
            .status(404)
            .json(ApiResponse.error("Product type not found", 404));
          return;
        }

        resolvedProductTypeId = productType.id;
      }

      let mapping = await prisma.leadProductMapping.findFirst({
        where: {
          lead_id: leadId,
          vendor_id: lead.vendor_id,
        },
        select: { id: true, product_type_id: true },
      });

      if (!mapping) {
        // No mapping yet — create one (first-time product type assignment)
        mapping = await prisma.leadProductMapping.create({
          data: {
            lead_id: leadId,
            vendor_id: lead.vendor_id,
            account_id: lead.account_id!,
            product_type_id: resolvedProductTypeId,
            created_by: updatedBy,
          },
          select: { id: true, product_type_id: true },
        });
      } else {
        await prisma.leadProductMapping.update({
          where: { id: mapping.id },
          data: {
            product_type_id: resolvedProductTypeId,
          },
        });
      }

      await prisma.leadProductStructureInstance.updateMany({
        where: {
          lead_id: leadId,
          vendor_id: lead.vendor_id,
        },
        data: {
          product_type_id: resolvedProductTypeId,
        },
      });

      if (mapping.product_type_id !== resolvedProductTypeId) {
        const [oldType, newType] = await Promise.all([
          mapping.product_type_id
            ? prisma.productTypeMaster.findFirst({
                where: {
                  id: mapping.product_type_id,
                  vendor_id: lead.vendor_id,
                },
                select: { type: true },
              })
            : Promise.resolve(null),
          prisma.productTypeMaster.findFirst({
            where: {
              id: resolvedProductTypeId,
              vendor_id: lead.vendor_id,
            },
            select: { type: true },
          }),
        ]);

        const oldLabel = oldType?.type || "Unknown";
        const newLabel = newType?.type || "Unknown";
        const actionMessage = `Product Type has been updated from "${oldLabel}" to "${newLabel}".`;

        await prisma.leadDetailedLogs.create({
          data: {
            vendor_id: lead.vendor_id,
            lead_id: leadId,
            account_id: lead.account_id!,
            action: actionMessage,
            action_type: "UPDATE",
            created_by: updatedBy,
            created_at: new Date(),
          },
        });
      }

      res.status(200).json(
        ApiResponse.success(
          {
            lead: {
              id: leadId,
            },
            product_type_id: resolvedProductTypeId,
          },
          "Product type updated successfully",
          200,
        ),
      );
    } catch (error: any) {
      console.error("[ERROR] Failed to update product type:", error.message);
      res.status(500).json(ApiResponse.error(error.message, 500));
    }
  }

  /**
   * Fetch all sales executives for a specific vendor
   */
  async fetchSalesExecutivesByVendor(
    req: Request,
    res: Response,
  ): Promise<Response> {
    try {
      const vendorId = Number(getParam(req.params.vendorId));
      const franchiseId = req.query.franchise_id
        ? Number(req.query.franchise_id)
        : undefined;
      const assigneeUserType = req.query.assignee_user_type
        ? String(req.query.assignee_user_type)
        : undefined;
      const requiredPrivilegeCode = req.query.required_privilege_code
        ? String(req.query.required_privilege_code)
        : undefined;

      // Validate vendorId
      if (isNaN(vendorId) || vendorId <= 0) {
        return res
          .status(400)
          .json(ApiResponse.error("Invalid vendor ID provided", 400));
      }
      if (
        franchiseId !== undefined &&
        (isNaN(franchiseId) || franchiseId <= 0)
      ) {
        return res
          .status(400)
          .json(ApiResponse.error("Invalid franchise ID provided", 400));
      }

      console.log(
        `[CONTROLLER] Fetching sales executives for vendor ID: ${vendorId}`,
      );

      const salesExecutives = await getSalesExecutivesByVendor(
        vendorId,
        franchiseId,
        {
          assigneeUserType,
          requiredPrivilegeCode,
        },
      );

      // Check if any sales executives were found
      if (salesExecutives.length === 0) {
        return res
          .status(200)
          .json(
            ApiResponse.success(
              [],
              "No sales executives found for this vendor",
              200,
            ),
          );
      }

      console.log(
        `[CONTROLLER] Found ${salesExecutives.length} sales executives`,
      );

      return res.status(200).json(
        ApiResponse.success(
          {
            sales_executives: salesExecutives,
            count: salesExecutives.length,
          },
          "Sales executives fetched successfully",
          200,
        ),
      );
    } catch (error: any) {
      console.error("[CONTROLLER] fetchSalesExecutivesByVendor error:", error);

      return res
        .status(500)
        .json(
          ApiResponse.error(
            "Failed to fetch sales executives",
            500,
            process.env.NODE_ENV === "development" ? error.message : undefined,
          ),
        );
    }
  }

  /**
   * Fetch all Site Supervisors for a specific vendor
   */
  async fetchSiteSupervisorsByVendor(
    req: Request,
    res: Response,
  ): Promise<Response> {
    try {
      const vendorId = Number(getParam(req.params.vendorId));

      // Validate vendorId
      if (isNaN(vendorId) || vendorId <= 0) {
        return res
          .status(400)
          .json(ApiResponse.error("Invalid vendor ID provided", 400));
      }

      console.log(
        `[CONTROLLER] Fetching Site Supervisors for vendor ID: ${vendorId}`,
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
              200,
            ),
          );
      }

      console.log(
        `[CONTROLLER] Found ${siteSupervisors.length} Site Supervisors`,
      );

      return res.status(200).json(
        ApiResponse.success(
          {
            site_supervisors: siteSupervisors,
            count: siteSupervisors.length,
          },
          "site supervisors fetched successfully",
          200,
        ),
      );
    } catch (error: any) {
      console.error("[CONTROLLER] fetchSiteSupervisorsByVendor error:", error);

      return res
        .status(500)
        .json(
          ApiResponse.error(
            "Failed to fetch Site Supervisors",
            500,
            process.env.NODE_ENV === "development" ? error.message : undefined,
          ),
        );
    }
  }

  /**
   * Fetch all Head Site Supervisors for a specific vendor
   */
  async fetchHeadSiteSupervisorsByVendor(
    req: Request,
    res: Response,
  ): Promise<Response> {
    try {
      const vendorId = Number(getParam(req.params.vendorId));

      // Validate vendorId
      if (isNaN(vendorId) || vendorId <= 0) {
        return res
          .status(400)
          .json(ApiResponse.error("Invalid vendor ID provided", 400));
      }

      console.log(
        `[CONTROLLER] Fetching Head Site Supervisors for vendor ID: ${vendorId}`,
      );

      const headSiteSupervisors = await getHeadSiteSupervisorByVendor(vendorId);

      if (headSiteSupervisors.length === 0) {
        return res
          .status(200)
          .json(
            ApiResponse.success(
              [],
              "No head site supervisors found for this vendor",
              200,
            ),
          );
      }

      console.log(
        `[CONTROLLER] Found ${headSiteSupervisors.length} Head Site Supervisors`,
      );

      return res.status(200).json(
        ApiResponse.success(
          {
            head_site_supervisors: headSiteSupervisors,
            count: headSiteSupervisors.length,
          },
          "Head site supervisors fetched successfully",
          200,
        ),
      );
    } catch (error: any) {
      console.error(
        "[CONTROLLER] fetchHeadSiteSupervisorsByVendor error:",
        error,
      );

      return res
        .status(500)
        .json(
          ApiResponse.error(
            "Failed to fetch Head Site Supervisors",
            500,
            process.env.NODE_ENV === "development" ? error.message : undefined,
          ),
        );
    }
  }

  /**
   * Fetch a specific sales executive by ID within a vendor
   */
  async fetchSalesExecutiveById(
    req: Request,
    res: Response,
  ): Promise<Response> {
    try {
      const vendorId = Number(getParam(req.params.vendorId));
      const userId = Number(getParam(req.params.userId));

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
        `[CONTROLLER] Fetching sales executive ID: ${userId} for vendor: ${vendorId}`,
      );

      const salesExecutive = await getSalesExecutiveById(vendorId, userId);

      if (!salesExecutive) {
        return res
          .status(404)
          .json(
            ApiResponse.error(
              "Sales executive not found or not authorized for this vendor",
              404,
            ),
          );
      }

      console.log(
        `[CONTROLLER] Sales executive found: ${salesExecutive.user_name}`,
      );

      return res
        .status(200)
        .json(
          ApiResponse.success(
            salesExecutive,
            "Sales executive fetched successfully",
            200,
          ),
        );
    } catch (error: any) {
      console.error("[CONTROLLER] fetchSalesExecutiveById error:", error);

      return res
        .status(500)
        .json(
          ApiResponse.error(
            "Failed to fetch sales executive",
            500,
            process.env.NODE_ENV === "development" ? error.message : undefined,
          ),
        );
    }
  }

  /**
   * Assign a lead to a sales executive
   * Only accessible to admin and super-admin users
   */
  async assignLead(req: Request, res: Response): Promise<void> {
    try {
      const leadId = Number(getParam(req.params.leadId));
      const vendorId = Number(getParam(req.params.vendorId));

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
                    (e: any) => `${e.field}: ${e.message}`,
                  )
                : undefined,
            ),
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
              400,
            ),
          );
        return;
      }

      console.log(`[CONTROLLER] Payload validation successful`);
      console.log(
        `[CONTROLLER] Assigning lead to user ${assignmentPayload.assign_to} by user ${assignmentPayload.assign_by}`,
      );

      // Call service to assign lead
      const result = await assignLeadToUser(
        leadId,
        vendorId,
        assignmentPayload,
        resolveClientBaseUrl(req),
      );

      console.log(`[CONTROLLER] Lead assignment successful`);
      console.log(
        `[CONTROLLER] Lead ${result.lead.id} assigned to ${result.assignedTo.user_name}`,
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
          200,
        ),
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
              403,
            ),
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
              400,
            ),
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
              404,
            ),
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
            process.env.NODE_ENV === "development" ? error.message : undefined,
          ),
        );
    }
  }

  /**
   * Get lead assignment history (optional feature)
   * Shows who assigned leads to whom and when
   */
  async getLeadAssignmentHistory(
    req: Request,
    res: Response,
  ): Promise<Response> {
    try {
      const leadId = Number(getParam(req.params.leadId));
      const vendorId = Number(getParam(req.params.vendorId));

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
        `[CONTROLLER] Fetching assignment history for lead ${leadId}`,
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
            200,
          ),
        );
    } catch (error: any) {
      console.error("[CONTROLLER] getLeadAssignmentHistory error:", error);

      return res
        .status(500)
        .json(
          ApiResponse.error(
            "Failed to fetch lead assignment history",
            500,
            process.env.NODE_ENV === "development" ? error.message : undefined,
          ),
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

  async rescheduleInitialSiteMeasurementTask(
    req: Request,
    res: Response,
  ): Promise<Response> {
    try {
      const leadId = Number(req.params.leadId);
      const taskId = Number(req.params.taskId);
      const due_date = getSingleBodyValue(req.body.due_date);
      const remark = getSingleBodyValue(req.body.remark);
      const updated_by = Number(getSingleBodyValue(req.body.updated_by));

      if (!leadId || !taskId || !due_date || !remark || !updated_by) {
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
            !due_date && {
              field: "due_date",
              message: "due_date is required",
            },
            !remark && {
              field: "remark",
              message: "remark is required",
            },
            !updated_by && {
              field: "updated_by",
              message: "updated_by is required",
            },
          ].filter(Boolean),
        });
      }

      const task = await prisma.userLeadTask.findFirst({
        where: { id: taskId, lead_id: leadId },
        select: {
          id: true,
          task_type: true,
        },
      });

      if (!task) {
        return res.status(404).json({
          success: false,
          error: "Task not found",
        });
      }

      if (task.task_type !== "Initial Site Measurement") {
        return res.status(400).json({
          success: false,
          error:
            "Only Initial Site Measurement tasks can be rescheduled from this endpoint",
        });
      }

      const result = await editTaskISMService({
        lead_id: leadId,
        task_id: taskId,
        due_date,
        remark,
        updated_by,
      });

      return res.status(200).json({
        success: true,
        message: "Initial Site Measurement task rescheduled successfully",
        data: result,
      });
    } catch (error: any) {
      logger.error("[ERROR] rescheduleInitialSiteMeasurementTask:", {
        err: error,
      });
      return res.status(500).json({
        success: false,
        error: "Internal server error",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  verifyUserTokenController = async (req: Request, res: Response) => {
    const token = getParam(req.params.token);
    if (!token) {
      return res.status(400).json({
        success: false,
        error: "token is required",
      });
    }
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
      const history_type = req.query.history_type as
        | "Lead"
        | "Task"
        | "FollowUp"
        | undefined;

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
        history_type,
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

      if (existingDoc.account_id) {
        const detailedLog = await prisma.leadDetailedLogs.create({
          data: {
            vendor_id: Number(vendorId),
            lead_id: existingDoc.lead_id!,
            account_id: existingDoc.account_id,
            action: `Document "${existingDoc.doc_og_name}" was deleted.`,
            action_type: "DELETE",
            created_by: Number(deleted_by),
          },
        });

        await prisma.leadDocumentLogs.create({
          data: {
            vendor_id: Number(vendorId),
            lead_id: existingDoc.lead_id!,
            account_id: existingDoc.account_id,
            doc_id: Number(documentId),
            lead_logs_id: detailedLog.id,
            created_by: Number(deleted_by),
          },
        });
      }

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
    res: Response,
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
        Number(leadId),
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
        error,
      );
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error.",
      });
    }
  }

  checkContactNumberExists = async (req: Request, res: Response) => {
    try {
      const vendor_id = Number(req.params.vendorId);
      const { phone_number, alt_phone_number, email } = req.body || {};

      if (!vendor_id) {
        return res
          .status(400)
          .json(ApiResponse.error("vendorId is required", 400));
      }

      const result = await isContactOrEmailExists(vendor_id, {
        phone_number,
        alt_phone_number,
        email,
      });

      return res
        .status(200)
        .json(ApiResponse.success(result, "Contact/email lookup completed"));
    } catch (error: any) {
      logger.error("[CONTROLLER] checkContactNumberExists error", error);
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error"));
    }
  };

  
  getAllLeadDocuments = async (req: Request, res: Response) => {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);
      const instanceId =
        req.query.instance_id && !isNaN(Number(req.query.instance_id))
          ? Number(req.query.instance_id)
          : null;

      if (!vendorId || !leadId) {
        return res
          .status(400)
          .json(ApiResponse.error("vendorId and leadId are required", 400));
      }

      // ── 1. Fetch all docs ────────────────────────────────────────────────────
      const documents = await prisma.leadDocuments.findMany({
        where: {
          vendor_id: vendorId,
          lead_id: leadId,
          is_deleted: false,
          paymentInfo: { none: {} },
        },
        include: {
          documentType: {
            select: {
              id: true,
              type: true,
              tag: true,
              doc_title: true,
              stage: true,
            },
          },
          productStructureInstance: {
            select: {
              id: true,
              title: true,
              productStructure: {
                // ✅ nested include for original name
                select: { id: true, type: true },
              },
            },
          },
        },
        orderBy: { created_at: "asc" },
      });

      // ── 2. Generate signed URLs + flatten ────────────────────────────────────
      const flatDocs: FlatDoc[] = await Promise.all(
        documents.map(async (doc) => ({
          id: doc.id,
          doc_og_name: doc.doc_og_name,
          doc_sys_name: doc.doc_sys_name,
          doc_type_id: doc.doc_type_id,
          doc_type_tag: doc.documentType.tag,
          doc_type_type: doc.documentType.type,
          doc_title: doc.documentType.doc_title,
          stage: doc.documentType.stage,
          tech_check_status: doc.tech_check_status,
          created_at: doc.created_at,
          product_structure_instance_id:
            doc.product_structure_instance_id ?? null,
          instance_title: doc.productStructureInstance?.title ?? null,
          instance_type:
            doc.productStructureInstance?.productStructure?.type ?? null, // ✅ NEW
          signed_url: await generateSignedUrl(doc.doc_sys_name),
        })),
      );

      // ── 3. Per stage: filter → group by instance → group by doc_title ────────
      const result: StageResult[] = STAGE_CONFIGS.map((stage) => {
        const filtered = filterDocsForStage(flatDocs, stage, instanceId);
        const instanceGroups = groupByInstance(filtered);

        return {
          stageId: stage.id,
          totalFiles: filtered.length,
          instanceGroups,
        };
      });

      return res
        .status(200)
        .json(
          ApiResponse.success(
            result,
            "All lead documents fetched successfully",
          ),
        );
    } catch (error: any) {
      logger.error("[CONTROLLER] getAllLeadDocuments error", error);
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error"));
    }
  };

  checkSiteSupervisorAssigned = async (req: Request, res: Response) => {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);

      if (!vendorId || !leadId) {
        return res
          .status(400)
          .json(ApiResponse.error("vendorId and leadId are required", 400));
      }

      const result = await checkSiteSupervisorAssigned(vendorId, leadId);
      return res
        .status(200)
        .json(ApiResponse.success(result, "Site supervisor check completed"));
    } catch (error: any) {
      logger.error("[CONTROLLER] checkSiteSupervisorAssigned error", error);
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error"));
    }
  };

  fetchFollowUpUsers = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);
      const franchiseId = req.query.franchise_id
        ? Number(req.query.franchise_id)
        : null;

      if (!vendorId || !leadId) {
        return res
          .status(400)
          .json(ApiResponse.error("vendorId and leadId are required", 400));
      }

      // Admins filtered by vendor + optional franchise_id
      const adminWhere: any = {
        vendor_id: vendorId,
        status: "active",
        user_type: { user_type: { in: ["admin", "super-admin"] } },
      };
      if (franchiseId) {
        adminWhere.franchise_id = franchiseId;
      }

      const [admins, mappings] = await Promise.all([
        prisma.userMaster.findMany({
          where: adminWhere,
          select: { id: true, user_name: true },
        }),
        prisma.leadUserMapping.findMany({
          where: { lead_id: leadId, vendor_id: vendorId, status: "active" },
          select: {
            user: { select: { id: true, user_name: true } },
          },
        }),
      ]);

      const seen = new Set<number>();
      const users: { id: number; user_name: string | null }[] = [];

      for (const a of admins) {
        if (!seen.has(a.id)) {
          seen.add(a.id);
          users.push(a);
        }
      }
      for (const m of mappings) {
        if (m.user && !seen.has(m.user.id)) {
          seen.add(m.user.id);
          users.push(m.user);
        }
      }

      return res
        .status(200)
        .json(
          ApiResponse.success(
            { users, count: users.length },
            "Follow-up users fetched successfully",
          ),
        );
    } catch (error: any) {
      logger.error("[CONTROLLER] fetchFollowUpUsers error", error);
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error"));
    }
  };
}

// Export a single instance of the controller
export const leadController = new LeadController();
