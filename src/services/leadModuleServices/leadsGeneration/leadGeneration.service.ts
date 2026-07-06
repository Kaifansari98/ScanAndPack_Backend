import { prisma } from "../../../prisma/client";
import { createLeadLog } from "../../../utils/leadDetailedLog";
import {
  CreateLeadDTO,
  SiteSupervisorData,
  UpdateLeadDTO,
} from "../../../types/leadModule.types";
import fs from "fs";
import { SalesExecutiveData } from "../../../types/leadModule.types";
import wasabi, {
  uploadToWasabiLeadSitePhoto,
} from "../../../utils/wasabiClient";
import {
  AssignLeadPayload,
  LeadAssignmentResult,
} from "../../../types/leadModule.types";
import {
  validateAdminUser,
  validateSalesExecutiveUser,
  getUserRole,
  isLeadComplete,
} from "../../../validations/leadValidation";
import { generateSignedUrl } from "../../../utils/wasabiClient";
import logger from "../../../utils/logger";
import { cache } from "../../../utils/cache";
import Joi from "joi";
import { generateLeadCode } from "../../../utils/generateLeadCode";
import { logDbError } from "../../../utils/prismaErrorLogger";
import { NotificationService } from "../../notification/notification.service";
import { getFranchiseAdminRecipients } from "../../notification/adminRecipients.service";
import { NotificationType, Prisma } from "../../../prisma/generated";
import { resolveLeadStagePath } from "./leadActivityStatus.service";
import {
  sendLeadAssignedEmail,
  sendLeadCreatedEmail,
  type LeadCreatedEmailPayload,
} from "../../email/brevoEmail.service";
import { sendBrevoEmail } from "../../email/brevoEmail.service";
import { createTaskHistoryLog } from "../../task/taskHistory.service";

type TxClient = Prisma.TransactionClient | typeof prisma;

const buildSortedNumberSignature = (values: number[]) =>
  [...values].sort((a, b) => a - b).join(",");

const toLeadLookupPayload = (lead: {
  id: number;
  lead_code: string | null;
  firstname: string | null;
  lastname: string | null;
}) => ({
  lead_id: lead.id,
  lead_code: lead.lead_code,
  lead_name: `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim(),
});

const findSimilarLeadByContactAndProducts = async (
  db: TxClient,
  vendor_id: number,
  payload: {
    contact_no: string;
    product_types: number[];
  },
) => {
  const { contact_no, product_types } = payload;

  if (!contact_no || product_types.length === 0) {
    return null;
  }

  const expectedProductTypeSignature = buildSortedNumberSignature(product_types);

  const existingLeads = await db.leadMaster.findMany({
    where: {
      vendor_id,
      contact_no,
      is_deleted: false,
    },
    select: {
      id: true,
      lead_code: true,
      firstname: true,
      lastname: true,
      productMappings: {
        select: {
          product_type_id: true,
        },
      },
    },
  });

  return (
    existingLeads.find((lead) => {
      const leadProductTypeSignature = buildSortedNumberSignature(
        lead.productMappings.map((mapping) => mapping.product_type_id),
      );

      return leadProductTypeSignature === expectedProductTypeSignature;
    }) ?? null
  );
};

type EditTaskISMInput = {
  lead_id: number;
  task_id: number;
  task_type?: string;
  due_date?: string | Date;
  remark?: string;
  assignee_user_id?: number;
  updated_by: number;
  status?: string;
  closed_at?: string | Date;
  closed_by?: number;
};

type AssignDesignerInput = {
  lead_id: number;
  account_id: number;
  vendor_id: number;
  assign_to_user_id: number;
  created_by: number;
};

type ToggleLeadBlockInput = {
  vendor_id: number;
  lead_id: number;
  updated_by: number;
};

const editTaskISMSchema = Joi.object({
  lead_id: Joi.number().integer().positive().required(),
  task_id: Joi.number().integer().positive().required(),
  task_type: Joi.string().trim(),
  due_date: Joi.alternatives().try(Joi.string().isoDate(), Joi.date()),
  remark: Joi.string().allow("", null),
  assignee_user_id: Joi.number().integer().positive(),
  updated_by: Joi.number().integer().positive().required(),
  status: Joi.string().trim(),
  closed_at: Joi.alternatives().try(Joi.string().isoDate(), Joi.date()),
  closed_by: Joi.number().integer().positive(),
});

export const createLeadService = async (
  payload: CreateLeadDTO & { is_draft?: boolean },
  files: Express.Multer.File[],
) => {
  logger.debug("[SERVICE] createLeadService called", {
    fileCount: files.length,
  });

  // Debug file information
  if (files && files.length > 0) {
    logger.info(`Processing ${files.length} document(s)`);
    files.forEach((file, index) => {
      console.log(`[DEBUG] File ${index + 1}:`, {
        originalname: file.originalname,
        filename: file.filename,
        size: file.size,
        mimetype: file.mimetype,
        path: (file as any).path,
        destination: (file as any).destination,
        key: (file as any).key,
        location: (file as any).location,
      });

      // Check if file actually exists
      const diskPath = (file as any).path as string | undefined;
      if (diskPath && fs.existsSync(diskPath)) {
        console.log(`[DEBUG] ✅ File ${index + 1} exists at:`, diskPath);
        const stats = fs.statSync(diskPath);
        console.log(`[DEBUG] File size on disk:`, stats.size, "bytes");
      }
    });
  }

  const {
    firstname,
    lastname,
    country_code,
    contact_no,
    alt_contact_no,
    email,
    site_address,
    site_map_link,
    site_type_id,
    status_id,
    source_id,
    archetech_name,
    architect_id,
    archetech_number,
    designer_remark,
    vendor_id,
    franchise_id,
    created_by,
    priority,
    assign_to,
    assigned_by,
    product_types = [],
    product_structures = [],
    product_structure_instances = [],
    initial_site_measurement_date,
  } = payload;

  const transactionResult = await prisma.$transaction(
    async (tx) => {
      try {
        // 🔍 optional input snapshot
        logger.debug("[SERVICE] createLead input", {
          vendor_id,
          franchise_id,
          created_by,
          priority,
          product_types,
          product_structures,
          fileCount: files.length,
        });

        // Validate franchise belongs to vendor
        const franchise = await tx.franchiseMaster.findFirst({
          where: {
            id: franchise_id,
            vendor_id,
          },
          select: { id: true },
        });

        if (!franchise) {
          throw new Error("Invalid franchise_id for the given vendor_id.");
        }

        if (!payload.is_draft) {
          const similarLead = await findSimilarLeadByContactAndProducts(
            tx,
            vendor_id,
            {
              contact_no,
              product_types,
            },
          );

          if (similarLead) {
            throw Object.assign(
              new Error(
                "Similar lead already exists in the CRM, Hence it cannot be created.",
              ),
              {
                statusCode: 409,
                lead: toLeadLookupPayload(similarLead),
              },
            );
          }
        }

        // 1. AccountMaster (reuse if same phone/email exists for this vendor)
        const matchConditions: Array<Record<string, string>> = [];
        const normalizedEmail = email?.trim();

        if (contact_no) {
          matchConditions.push({ contact_no });
          matchConditions.push({ alt_contact_no: contact_no });
        }
        if (alt_contact_no) {
          matchConditions.push({ contact_no: alt_contact_no });
          matchConditions.push({ alt_contact_no });
        }
        if (normalizedEmail) {
          matchConditions.push({ email: normalizedEmail });
        }

        const existingAccount =
          matchConditions.length > 0
            ? await tx.accountMaster.findFirst({
              where: {
                vendor_id,
                is_deleted: false,
                OR: matchConditions,
              },
            })
            : null;

        const account =
          existingAccount ??
          (await tx.accountMaster.create({
            data: {
              name: `${firstname} ${lastname}`,
              country_code,
              contact_no,
              alt_contact_no,
              email: normalizedEmail,
              vendor_id,
              franchise_id,
              created_by,
            },
          }));

        // 2) ⬅️ NEW: generate lead_code for this franchise
        const lead_code = await generateLeadCode(tx, {
          franchiseId: franchise_id,
          vendorId: vendor_id,
        });

        // 3) Create Lead with the generated code
        const leadCreateData: any = {
          lead_code,
          firstname,
          lastname,
          country_code,
          contact_no,
          alt_contact_no,
          email: email ?? "",
          site_address,
          site_map_link,
          site_type_id,
          status_id,
          source_id,
          archetech_name,
          architect_id: architect_id ? Number(architect_id) : null,
          archetech_number,
          designer_remark,
          vendor_id,
          franchise_id,
          created_by,
          priority: priority?.trim() || null,
          account_id: account.id, // Add account_id reference
          assign_to,
          assigned_by,
          initial_site_measurement_date,
          is_draft: !!payload.is_draft,
        };

        const lead = await tx.leadMaster.create({
          data: leadCreateData,
        });

        /* ✅ NEW: LeadUserMapping writes
      - The creator is always mapped with type="ISM", status="active"
      - Admin and super-admin also seed the initial assignee mapping
      */
        const creator = await tx.userMaster.findUnique({
          where: { id: created_by },
          include: { user_type: true }, // joins UserTypeMaster
        });

        const creatorRole = creator?.user_type?.user_type?.toLowerCase(); // e.g., "admin" or "sales-executive"
        const shouldMapInitialAssignee =
          (creatorRole === "admin" || creatorRole === "super-admin") &&
          Boolean(assign_to);

        // Base fields common to all LeadUserMapping rows
        const mappingBase = {
          vendor_id,
          account_id: account.id,
          lead_id: lead.id,
          type: "ISM" as const,
          status: "active" as const,
          created_by, // actor creating the mapping
        };

        // Always insert mapping for the creator
        await tx.leadUserMapping.create({
          data: { ...mappingBase, user_id: created_by },
        });

        // If creator is admin/super-admin -> also map the assignee (when provided)
        if (shouldMapInitialAssignee && assign_to) {
          await tx.leadUserMapping.create({
            data: { ...mappingBase, user_id: assign_to },
          });
        }

        // ✅ Create lead chat room and seed members (all admins + creator + assigned user)
        const chatRoom = await tx.leadChatRoom.create({
          data: {
            lead_id: lead.id,
            vendor_id,
          },
        });

        const [superAdminUsers, adminUsers] = await Promise.all([
          tx.userMaster.findMany({
            where: {
              vendor_id,
              status: "active",
              user_type: { user_type: "super-admin" },
            },
            select: { id: true },
          }),
          franchise_id
            ? tx.userMaster.findMany({
              where: {
                vendor_id,
                franchise_id,
                status: "active",
                user_type: { user_type: "admin" },
              },
              select: { id: true },
            })
            : Promise.resolve([]),
        ]);

        const memberIds = new Set<number>([
          ...superAdminUsers.map((user) => user.id),
          ...adminUsers.map((user) => user.id),
        ]);
        memberIds.add(created_by);

        if (shouldMapInitialAssignee && assign_to) {
          memberIds.add(assign_to);
        }

        if (memberIds.size > 0) {
          await tx.leadChatMember.createMany({
            data: Array.from(memberIds).map((user_id) => ({
              chat_room_id: chatRoom.id,
              user_id,
              added_by: created_by,
            })),
            skipDuplicates: true,
          });
        }

        // 🧹 Invalidate Performance Snapshot Cache for creator
        await cache.del(`performance:snapshot:${vendor_id}:${created_by}`);

        if (payload.is_draft) {
          logger.info(
            "📝 Draft lead detected — skipping mappings, logs & uploads",
          );
          return { lead, account, draft: true };
        }

        // If creator is sales-executive -> nothing more to do (only his own mapping above)
        // Any other/unknown role falls back to just the creator row

        // 3. Validate and create mappings for product types using IDs
        for (const productTypeId of product_types) {
          logger.debug("Processing product type", { productTypeId });

          // Validate that the product type exists and belongs to the vendor
          const productType = await tx.productTypeMaster.findFirst({
            where: {
              id: productTypeId,
              vendor_id,
            },
          });

          if (!productType) {
            throw new Error(
              `Product type with ID ${productTypeId} not found for vendor ${vendor_id}`,
            );
          }

          await tx.leadProductMapping.create({
            data: {
              vendor_id,
              lead_id: lead.id,
              account_id: account.id,
              product_type_id: productTypeId,
              created_by,
            },
          });
          logger.info("✅ Product mapping created", { productTypeId });
        }

        // 4. Validate and create mappings for product structures using IDs
        for (const productStructureId of product_structures) {
          logger.debug("Processing product structure", { productStructureId });

          // Validate that the product structure exists and belongs to the vendor
          const structure = await tx.productStructure.findFirst({
            where: {
              id: productStructureId,
              vendor_id,
            },
          });

          if (!structure) {
            throw new Error(
              `Product structure with ID ${productStructureId} not found for vendor ${vendor_id}`,
            );
          }

          await tx.leadProductStructureMapping.create({
            data: {
              vendor_id,
              lead_id: lead.id,
              account_id: account.id,
              product_structure_id: productStructureId,
              created_by,
            },
          });
          logger.info("✅ Product structure mapping created", {
            productStructureId,
          });
        }

        // 5. Create product structure instances
        const instanceProductTypeId = product_types[0];
        const instanceSource: {
          product_structure_id: number;
          title?: string;
          description?: string;
        }[] =
          product_structure_instances.length > 0
            ? product_structure_instances
            : product_structures.map((product_structure_id) => ({
              product_structure_id,
            }));

        if (!instanceProductTypeId) {
          logger.warn(
            "⚠️ Skipping structure instances: product_types is empty",
            { lead_id: lead.id },
          );
        } else {
          const structureIds = Array.from(
            new Set(
              instanceSource.map((instance) => instance.product_structure_id),
            ),
          );
          const structures = await tx.productStructure.findMany({
            where: {
              id: { in: structureIds },
              vendor_id,
            },
          });
          const structureMap = new Map(
            structures.map((structure) => [structure.id, structure]),
          );

          if (structureMap.size !== structureIds.length) {
            const missingIds = structureIds.filter(
              (id) => !structureMap.has(id),
            );
            throw new Error(
              `Product structure with ID(s) ${missingIds.join(
                ", ",
              )} not found for vendor ${vendor_id}`,
            );
          }

          let nextIndex = 0;
          for (const instance of instanceSource) {
            const structure = structureMap.get(instance.product_structure_id);
            if (!structure) continue;

            nextIndex += 1;

            await tx.leadProductStructureInstance.create({
              data: {
                vendor_id,
                lead_id: lead.id,
                account_id: account.id,
                product_type_id: instanceProductTypeId,
                product_structure_id: instance.product_structure_id,
                quantity_index: nextIndex,
                title: instance.title?.trim() || structure.type,
                description: instance.description?.trim() || null,
                created_by,
              },
            });
          }
        }

        // 6. LeadStatusLogs entry
        await tx.leadStatusLogs.create({
          data: {
            lead_id: lead.id,
            account_id: account.id,
            vendor_id,
            status_id, // from openStatus.id earlier
            created_by,
            created_at: new Date(),
          },
        });
        logger.info("✅ LeadStatusLogs entry created for initial stage", {
          lead_id: lead.id,
          status_id,
        });

        // 7. LeadDetailedLogs entry
        await createLeadLog(tx, {
          vendor_id,
          lead_id: lead.id,
          account_id: account.id,
          action: "Lead has been created successfully",
          action_type: "CREATE",
          created_by,
          created_at: new Date(),
        });
        logger.info("✅ LeadDetailedLogs entry created for lead creation", {
          lead_id: lead.id,
        });

        // 8. Return final result
        return {
          lead,
          account,
          draft: !!payload.is_draft,
        };
      } catch (err) {
        logDbError(err, "createLeadService.transaction", {
          vendor_id,
          created_by,
        });
        throw err; // IMPORTANT
      }
    },
    { timeout: 15000 },
  );

  if (transactionResult.draft) {
    return {
      ...transactionResult,
      documentsProcessed: 0,
      uploadedFiles: [],
    };
  }

  let uploadedFiles: any[] = [];

  if (files && files.length > 0) {
    logger.info(`Uploading ${files.length} document(s) to Wasabi`);

    const docTypeRecord = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id, tag: "Type 1" },
    });

    if (!docTypeRecord) {
      throw new Error(
        `Document type "Type 1" not found for vendor ${vendor_id}`,
      );
    }

    for (const file of files) {
      const diskPath = file.path;
      const fileExists = diskPath ? fs.existsSync(diskPath) : false;
      console.log(`[DEBUG] File path: ${diskPath}, disk exists: ${fileExists}`);

      logger.info("[FILE CHECK]", {
        name: file.originalname,
        size: file.size,
        path: file.path,
      });

      const s3Key = await uploadToWasabiLeadSitePhoto(
        file.path,
        vendor_id,
        transactionResult.lead.id,
        file.originalname,
        file.mimetype,
      );

      await fs.promises.unlink(file.path);

      const document = await prisma.leadDocuments.create({
        data: {
          doc_og_name: file.originalname,
          doc_sys_name: s3Key,
          doc_type_id: docTypeRecord.id,
          vendor_id,
          lead_id: transactionResult.lead.id,
          account_id: transactionResult.account.id,
          created_by,
        },
      });

      uploadedFiles.push({
        id: document.id,
        type: 1,
        originalName: file.originalname,
        s3Key,
        size: file.size,
      });
    }

    console.log(
      "[DEBUG] Files uploaded to Wasabi and saved:",
      uploadedFiles.length,
    );
  } else {
    logger.info("No documents to process - files are optional");
  }

  return {
    ...transactionResult,
    documentsProcessed: files ? files.length : 0,
    uploadedFiles,
  };
};

export const uploadMoreSitePhotosService = async (
  payload: { vendor_id: number; lead_id: number; created_by: number },
  files: Express.Multer.File[],
) => {
  const { vendor_id, lead_id, created_by } = payload;

  if (!vendor_id || !lead_id || !created_by) {
    throw new Error("vendor_id, lead_id, and created_by are required");
  }

  if (!files || files.length === 0) {
    throw new Error("At least one file must be uploaded");
  }

  const lead = await prisma.leadMaster.findFirst({
    where: {
      id: lead_id,
      vendor_id,
      is_deleted: false,
    },
    select: {
      id: true,
      account_id: true,
    },
  });

  if (!lead) {
    throw new Error(`Lead ${lead_id} not found for vendor ${vendor_id}`);
  }

  const docTypeRecord = await prisma.documentTypeMaster.findFirst({
    where: { vendor_id, tag: "Type 1" },
  });

  if (!docTypeRecord) {
    throw new Error(`Document type "Type 1" not found for vendor ${vendor_id}`);
  }

  const uploadedDocsData: {
    originalName: string;
    s3Key: string;
  }[] = [];

  for (const file of files) {
    const s3Key = await uploadToWasabiLeadSitePhoto(
      file.path,
      vendor_id,
      lead.id,
      file.originalname,
      file.mimetype,
    );

    await fs.promises.unlink(file.path);

    uploadedDocsData.push({
      originalName: file.originalname,
      s3Key,
    });
  }

  return prisma.$transaction(async (tx) => {
    const uploadedDocs = [];

    for (const uploaded of uploadedDocsData) {
      const document = await tx.leadDocuments.create({
        data: {
          doc_og_name: uploaded.originalName,
          doc_sys_name: uploaded.s3Key,
          doc_type_id: docTypeRecord.id,
          vendor_id,
          lead_id: lead.id,
          account_id: lead.account_id,
          created_by,
        },
      });

      uploadedDocs.push(document);
    }

    const detailedLog = await createLeadLog(tx, {
      vendor_id,
      lead_id: lead.id,
      account_id: lead.account_id!,
      action: `Additional site photos uploaded (${uploadedDocs.length})`,
      action_type: "CREATE",
      created_by,
      created_at: new Date(),
    });

    await tx.leadDocumentLogs.createMany({
      data: uploadedDocs.map((doc) => ({
        vendor_id,
        lead_id: lead.id,
        account_id: lead.account_id!,
        doc_id: doc.id,
        lead_logs_id: detailedLog.id,
        created_by,
        created_at: new Date(),
      })),
    });

    return uploadedDocs;
  });
};

export const getLeadsByVendor = async (vendorId: number) => {
  return prisma.leadMaster.findMany({
    where: {
      vendor_id: vendorId,
      is_deleted: false,
      account: {
        is_deleted: false,
      },
    },
    include: {
      account: true,
      leadProductStructureMapping: {
        include: { productStructure: true },
      },
      productMappings: {
        include: { productType: true },
      },
      documents: true,
      source: true,
      siteType: true,
      createdBy: true,
    },
    orderBy: { created_at: "desc" },
  });
};

/**
 * Get leads by vendor and user with role-based filtering
 * @param vendorId - Vendor ID
 * @param userId - User ID
 * @returns Promise<Lead[]>
 */
export const getLeadsByVendorAndUser = async (
  vendorId: number,
  userId: number,
) => {
  try {
    console.log(
      `[SERVICE] Fetching leads for vendor ${vendorId} and user ${userId}`,
    );

    // First, get user role information
    const userInfo = await getUserRole(userId, vendorId);

    if (!userInfo.isValid) {
      throw new Error("User not found or inactive");
    }

    console.log(`[SERVICE] User role: ${userInfo.userType}`);

    const userType = userInfo.userType ?? "";

    let whereCondition: any = {
      vendor_id: vendorId,
      is_deleted: false,
      account: {
        is_deleted: false,
      },
    };

    // Role-based filtering
    if (userType === "sales-executive") {
      // Sales executives can only see leads they created OR leads assigned to them
      whereCondition.OR = [
        { created_by: userId }, // Leads created by them
        { assign_to: userId }, // Leads assigned to them
      ];

      console.log(
        `[SERVICE] Applied sales-executive filter for user ${userId}`,
      );
    } else if (["admin", "super-admin", "auditor"].includes(userType)) {
      // Admins and super-admins can see all leads for their vendor
      // No additional filtering needed beyond vendor_id
      console.log(
        `[SERVICE] Admin/Super-admin access - showing all vendor leads`,
      );
    } else {
      // Other roles (if any) - restrict to only their created leads
      whereCondition.created_by = userId;
      console.log(
        `[SERVICE] Restricted access for role ${userType} - only created leads`,
      );
    }

    const leads = await prisma.leadMaster.findMany({
      where: whereCondition,
      include: {
        leadProductStructureMapping: {
          select: { productStructure: { select: { id: true, type: true } } },
        },
        productMappings: {
          select: { productType: { select: { id: true, type: true } } },
        },
        documents: {
          where: {
            documentType: { tag: "Type 1", vendor_id: vendorId },
          },
          select: {
            id: true,
            doc_sys_name: true, // stored S3/Wasabi key
            documentType: { select: { id: true, type: true, tag: true } },
          },
        },
        source: true,
        siteType: true,
        statusType: true,
        createdBy: {
          select: {
            id: true,
            user_name: true,
            user_email: true,
            user_contact: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            user_name: true,
            user_email: true,
            user_contact: true,
          },
        },
        assignedBy: {
          select: {
            id: true,
            user_name: true,
            user_email: true,
            user_contact: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
    });

    // ✅ Add signed URLs
    const leadsWithSignedDocs = await Promise.all(
      leads.map(async (lead) => {
        const signedDocs = await Promise.all(
          lead.documents.map(async (doc) => {
            if (!doc.doc_sys_name) return doc;

            try {
              const signedUrl = await generateSignedUrl(
                doc.doc_sys_name,
                3600,
                "inline",
              ); // 1h
              return { ...doc, signedUrl };
            } catch (err) {
              console.error(`[ERROR] Failed to sign doc ${doc.id}:`, err);
              return { ...doc, signedUrl: null };
            }
          }),
        );

        return { ...lead, documents: signedDocs };
      }),
    );

    return {
      leads: leadsWithSignedDocs,
      userInfo: {
        role: userType,
        canViewAllLeads: ["admin", "super-admin", "auditor"].includes(userType),
        userData: userInfo.userData,
      },
    };
  } catch (error: any) {
    console.error("[SERVICE] Error fetching leads:", error);
    throw error;
  }
};

// Service function to get a single lead by ID with role-based access control
export const getLeadById = async (
  leadId: number,
  userId: number,
  vendorId: number,
) => {
  try {
    console.log(
      `[SERVICE] Fetching lead ${leadId} for user ${userId} in vendor ${vendorId}`,
    );

    // 1️⃣ Get user role info
    const userInfo = await getUserRole(userId, vendorId);
    if (!userInfo.isValid) throw new Error("User not found or inactive");
    const userType = userInfo.userType?.toLowerCase() ?? "";
    const customViewPrivilegeCode = "leads.open_leads.details_of_lead.view";
    const customViewPrivilege =
      userType === "custom"
        ? await prisma.userPrivilegeMapping.findFirst({
          where: {
            user_id: userId,
            vendor_id: vendorId,
            is_allowed: true,
            privilege: {
              code: customViewPrivilegeCode,
              is_active: true,
            },
          },
          select: { id: true },
        })
        : null;

    // 2️⃣ Base condition (vendor-scoped)
    let whereCondition: any = {
      id: leadId,
      vendor_id: vendorId,
      is_deleted: false,
    };

    // 3️⃣ Access control
    if (
      userType === "sales-executive" ||
      userType === "site-supervisor" ||
      userType === "head-site-supervisor" ||
      userType === "tech-check" ||
      userType === "backend" ||
      userType === "factory" ||
      userType === "pre-prod" ||
      (userType === "custom" && !!customViewPrivilege)
    ) {
      console.log("[SERVICE] Sales Executive – vendor scoped access granted");
    } else if (["admin", "super-admin", "auditor"].includes(userType)) {
      console.log("[SERVICE] Admin/Super-admin full access");
    } else {
      console.log("[SERVICE] Limited role – assigned/created leads access");
      whereCondition.AND = [
        ...(Array.isArray(whereCondition.AND) ? whereCondition.AND : []),
        {
          OR: [{ created_by: userId }, { assign_to: userId }],
        },
      ];
    }

    // 4️⃣ Fetch the lead
    const lead = await prisma.leadMaster.findFirst({
      where: whereCondition,
      include: {
        account: {
          select: { id: true, name: true, email: true, contact_no: true },
        },
        siteType: true,
        source: true,
        statusType: true,
        productMappings: { include: { productType: true } },
        leadProductStructureMapping: { include: { productStructure: true } },
        documents: {
          where: { deleted_at: null, documentType: { tag: "Type 1" } },
        },
        createdBy: {
          select: { id: true, user_name: true, user_email: true },
        },
        assignedTo: {
          select: { id: true, user_name: true, user_email: true },
        },
        assignedBy: {
          select: { id: true, user_name: true, user_email: true },
        },
      },
    });

    if (!lead) {
      throw new Error(`Lead ${leadId} not found for vendor ${vendorId}`);
    }

    const isSmallOrderRequestLead =
      (lead as any).is_small_order_request === true;
    const linkedSmallOrderRequest =
      isSmallOrderRequestLead && lead.lead_code
        ? await prisma.smallOrderRequest.findFirst({
          where: {
            vendor_id: vendorId,
            so_code: {
              equals: lead.lead_code.trim(),
              mode: "insensitive",
            },
          },
          select: {
            id: true,
            is_request_resolved: true,
            request_source: true,
            request_type_id: true,
            requestType: {
              select: {
                id: true,
                type: true,
                type_key: true,
              },
            },
            documents: {
              select: {
                id: true,
                document_id: true,
                created_at: true,
                document: {
                  select: {
                    doc_og_name: true,
                    doc_sys_name: true,
                  },
                },
              },
            },
          },
        })
        : null;

    const linkedSmallOrderRequestWithDocs = linkedSmallOrderRequest
      ? {
        ...linkedSmallOrderRequest,
        documents: await Promise.all(
          linkedSmallOrderRequest.documents.map(async (doc) => ({
            id: doc.id,
            document_id: doc.document_id,
            original_name: doc.document?.doc_og_name ?? "",
            signed_url: doc.document?.doc_sys_name
              ? await generateSignedUrl(doc.document.doc_sys_name, 3600, "inline")
              : null,
            created_at: doc.created_at,
          })),
        ),
      }
      : null;

    const pendingFastProductionRequest = await prisma.fastProductionRequestBatch.findFirst({
      where: {
        vendor_id: vendorId,
        lead_id: lead.id,
        status: "pending_approvals",
      },
      select: {
        id: true,
      },
    });

    // ✅ Auto-unmark draft if completed
    if (lead.is_draft && isLeadComplete(lead)) {
      await prisma.leadMaster.update({
        where: { id: lead.id },
        data: { is_draft: false },
      });
      lead.is_draft = false;
    }

    const latestActivityStatus = await prisma.leadActivityStatusLog.findFirst({
      where: {
        lead_id: lead.id,
        vendor_id: vendorId,
      },
      orderBy: { created_at: "desc" },
      select: {
        user_id: true,
        activity_status: true,
        activity_status_remark: true,
        created_by: true,
        created_at: true,
        createdBy: { select: { user_name: true } },
      },
    });

    const activityStatusPayload =
      latestActivityStatus && latestActivityStatus.activity_status !== "onGoing"
        ? {
          user_id: latestActivityStatus.user_id,
          activity_status: latestActivityStatus.activity_status,
          activity_status_remark: latestActivityStatus.activity_status_remark,
          created_by: latestActivityStatus.created_by,
          created_by_name: latestActivityStatus.createdBy?.user_name ?? null,
          created_at: latestActivityStatus.created_at,
        }
        : null;

    const oldestSiteSupervisorMapping = await prisma.leadUserMapping.findFirst({
      where: {
        lead_id: lead.id,
        vendor_id: vendorId,
        status: "active",
        user: {
          user_type: {
            user_type: {
              equals: "site-supervisor",
              mode: "insensitive",
            },
          },
        },
      },
      orderBy: { created_at: "asc" },
      select: {
        id: true,
        user_id: true,
        created_at: true,
        user: { select: { id: true, user_name: true } },
      },
    });

    const oldestIsmMapping = await prisma.leadUserMapping.findFirst({
      where: {
        lead_id: lead.id,
        vendor_id: vendorId,
        status: "active",
        type: "ISM",
      },
      orderBy: { created_at: "asc" },
      select: {
        id: true,
        user_id: true,
        created_at: true,
        user: { select: { id: true, user_name: true } },
      },
    });

    const oldestDesignerMapping = await prisma.leadUserMapping.findFirst({
      where: {
        lead_id: lead.id,
        vendor_id: vendorId,
        status: "active",
        type: "designer",
      },
      orderBy: { created_at: "asc" },
      select: {
        id: true,
        user_id: true,
        created_at: true,
        user: { select: { id: true, user_name: true } },
      },
    });

    // 5️⃣ Add signed URLs
    const documentsWithUrls = await Promise.all(
      lead.documents.map(async (doc) => {
        const signedUrl = doc.doc_sys_name
          ? await generateSignedUrl(doc.doc_sys_name, 3600, "inline")
          : null;
        return { ...doc, signedUrl };
      }),
    );

    return {
      lead: {
        ...lead,
        has_pending_fast_production_request: !!pendingFastProductionRequest,
        fast_production_request: !!pendingFastProductionRequest,
        smallOrderRequest:
          linkedSmallOrderRequestWithDocs && isSmallOrderRequestLead
            ? linkedSmallOrderRequestWithDocs
            : null,
        documents: documentsWithUrls,
        latest_activity_status: activityStatusPayload,
        assigned_site_supervisor_from_mapping: oldestSiteSupervisorMapping
          ? {
            user_id: oldestSiteSupervisorMapping.user_id,
            user_name: oldestSiteSupervisorMapping.user?.user_name ?? null,
            created_at: oldestSiteSupervisorMapping.created_at,
          }
          : null,
        assigned_ism_user_from_mapping: oldestIsmMapping
          ? {
            user_id: oldestIsmMapping.user_id,
            user_name: oldestIsmMapping.user?.user_name ?? null,
            created_at: oldestIsmMapping.created_at,
          }
          : null,
        assigned_designer_from_mapping: oldestDesignerMapping
          ? {
            user_id: oldestDesignerMapping.user_id,
            user_name: oldestDesignerMapping.user?.user_name ?? null,
            created_at: oldestDesignerMapping.created_at,
          }
          : null,
      },
      userInfo: {
        role: userType,
        canViewAllLeads: ["admin", "super-admin", "auditor"].includes(userType),
        userData: userInfo.userData,
      },
    };
  } catch (error: any) {
    console.error("[SERVICE] Error fetching lead:", error);
    throw error;
  }
};

export const assignDesignerToLead = async (
  data: AssignDesignerInput,
) => {
  const requiredPrivilegeCode = "leads.designing_stage.designs.upload";

  return prisma.$transaction(async (tx) => {
    const lead = await tx.leadMaster.findFirst({
      where: {
        id: data.lead_id,
        account_id: data.account_id,
        vendor_id: data.vendor_id,
        is_deleted: false,
      },
      select: {
        id: true,
        account_id: true,
        vendor_id: true,
        franchise_id: true,
      },
    });

    if (!lead) {
      throw new Error("Lead not found");
    }

    const vendor = await tx.vendorMaster.findUnique({
      where: { id: data.vendor_id },
      select: { is_this_vendor_is_custom_usertype_only: true },
    });

    if (vendor?.is_this_vendor_is_custom_usertype_only !== true) {
      throw new Error("Designer assignment is available only for custom-user-type vendors");
    }

    const designerUser = await tx.userMaster.findFirst({
      where: {
        id: data.assign_to_user_id,
        vendor_id: data.vendor_id,
        status: "active",
        ...(lead.franchise_id ? { franchise_id: lead.franchise_id } : {}),
        user_type: {
          user_type: {
            equals: "custom",
            mode: "insensitive",
          },
        },
        userPrivilegeMappings: {
          some: {
            is_allowed: true,
            privilege: {
              code: requiredPrivilegeCode,
              is_active: true,
            },
          },
        },
      },
      select: {
        id: true,
        user_name: true,
      },
    });

    if (!designerUser) {
      throw new Error("Selected user is not eligible for design uploads");
    }

    const existingActiveDesignerMapping = await tx.leadUserMapping.findFirst({
      where: {
        lead_id: data.lead_id,
        vendor_id: data.vendor_id,
        status: "active",
        type: "designer",
      },
      select: {
        id: true,
        user_id: true,
      },
    });

    if (existingActiveDesignerMapping?.user_id === designerUser.id) {
      return {
        mappingId: existingActiveDesignerMapping.id,
        user: designerUser,
      };
    }

    await tx.leadUserMapping.updateMany({
      where: {
        lead_id: data.lead_id,
        vendor_id: data.vendor_id,
        type: "designer",
        status: "active",
      },
      data: {
        status: "inactive",
        updated_by: data.created_by,
      },
    });

    const mapping = await tx.leadUserMapping.create({
      data: {
        account_id: data.account_id,
        lead_id: data.lead_id,
        vendor_id: data.vendor_id,
        user_id: designerUser.id,
        type: "designer",
        status: "active",
        created_by: data.created_by,
      },
    });

    let chatRoom = await tx.leadChatRoom.findFirst({
      where: {
        lead_id: data.lead_id,
        vendor_id: data.vendor_id,
      },
      select: { id: true },
    });

    if (!chatRoom) {
      chatRoom = await tx.leadChatRoom.create({
        data: {
          lead_id: data.lead_id,
          vendor_id: data.vendor_id,
        },
        select: { id: true },
      });
    }

    const existingMember = await tx.leadChatMember.findFirst({
      where: {
        chat_room_id: chatRoom.id,
        user_id: designerUser.id,
      },
      select: { id: true },
    });

    if (!existingMember) {
      await tx.leadChatMember.create({
        data: {
          chat_room_id: chatRoom.id,
          user_id: designerUser.id,
          added_by: data.created_by,
        },
      });
    }

    await createLeadLog(tx, {
      vendor_id: data.vendor_id,
      lead_id: data.lead_id,
      account_id: data.account_id,
      action: `Designer assigned to ${designerUser.user_name}.`,
      action_type: "UPDATE",
      created_by: data.created_by,
      created_at: new Date(),
    });

    return {
      mappingId: mapping.id,
      user: designerUser,
    };
  });
};

export const getLeadProductStructureInstances = async (
  leadId: number,
  vendorId: number,
) => {
  try {
    return await prisma.leadProductStructureInstance.findMany({
      where: {
        lead_id: leadId,
        vendor_id: vendorId,
      },
      include: {
        productStructure: true,
        productType: true,
        subProductStructure: true,
        productItemCode: {
          include: {
            productStructure: {
              include: {
                productType: true,
              },
            },
            subProductStructure: true,
          },
        },
      },
      orderBy: [{ product_structure_id: "asc" }, { quantity_index: "asc" }],
    });
  } catch (error: any) {
    console.error(
      "[SERVICE] Error fetching lead product structure instances:",
      error,
    );
    throw new Error(
      `Failed to fetch lead product structure instances: ${error.message}`,
    );
  }
};

export const deleteLeadProductStructureInstance = async (
  leadId: number,
  vendorId: number,
  instanceId: number,
  deletedBy?: number | null,
) => {
  try {
    const existing = await prisma.leadProductStructureInstance.findFirst({
      where: {
        id: instanceId,
        lead_id: leadId,
        vendor_id: vendorId,
      },
    });

    if (!existing) {
      throw new Error("Instance not found");
    }

    await prisma.leadProductStructureInstance.delete({
      where: { id: existing.id },
    });

    await createLeadLog(prisma, {
      vendor_id: vendorId,
      lead_id: leadId,
      account_id: existing.account_id,
      action: `Product structure instance deleted : ${existing.title}`,
      action_type: "DELETE",
      created_by: deletedBy ?? existing.updated_by ?? existing.created_by,
      created_at: new Date(),
    });

    return { count: 1 };
  } catch (error: any) {
    console.error(
      "[SERVICE] Error deleting lead product structure instance:",
      error,
    );
    throw new Error(
      `Failed to delete lead product structure instance: ${error.message}`,
    );
  }
};

export const clearLeadProductStructures = async (
  leadId: number,
  vendorId: number,
  deletedBy?: number | null,
) => {
  try {
    const instancesCount = await prisma.leadProductStructureInstance.deleteMany({
      where: {
        lead_id: leadId,
        vendor_id: vendorId,
      },
    });

    const mappingsCount = await prisma.leadProductStructureMapping.deleteMany({
      where: {
        lead_id: leadId,
        vendor_id: vendorId,
      },
    });

    if (instancesCount.count > 0 || mappingsCount.count > 0) {
      const lead = await prisma.leadMaster.findFirst({
        where: { id: leadId, vendor_id: vendorId },
        select: { account_id: true }
      });
      
      if (lead) {
        await createLeadLog(prisma, {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: lead.account_id!,
          action: `All Product structure mappings and instances cleared.`,
          action_type: "DELETE",
          created_by: deletedBy ?? 0,
          created_at: new Date(),
        });
      }
    }

    return { instancesDeleted: instancesCount.count, mappingsDeleted: mappingsCount.count };
  } catch (error: any) {
    console.error(
      "[SERVICE] Error clearing lead product structures:",
      error,
    );
    throw new Error(
      `Failed to clear lead product structures: ${error.message}`,
    );
  }
};

export const updateLeadProductStructureInstance = async ({
  leadId,
  vendorId,
  instanceId,
  product_structure_id,
  title,
  description,
  pre_prod_remark,
  updated_by,
}: {
  leadId: number;
  vendorId: number;
  instanceId: number;
  product_structure_id: number;
  title: string;
  description?: string | null;
  pre_prod_remark?: string | null;
  updated_by?: number | null;
}) => {
  try {
    const existing = await prisma.leadProductStructureInstance.findFirst({
      where: {
        id: instanceId,
        lead_id: leadId,
        vendor_id: vendorId,
      },
    });

    if (!existing) {
      throw new Error("Instance not found");
    }

    const structure = await prisma.productStructure.findFirst({
      where: {
        id: product_structure_id,
        vendor_id: vendorId,
      },
    });

    if (!structure) {
      throw new Error("Product structure not found");
    }

    let nextQuantityIndex = existing.quantity_index;
    if (existing.product_structure_id !== product_structure_id) {
      const maxIndex = await prisma.leadProductStructureInstance.aggregate({
        where: {
          lead_id: leadId,
          vendor_id: vendorId,
          product_structure_id,
        },
        _max: { quantity_index: true },
      });
      nextQuantityIndex = (maxIndex._max.quantity_index || 0) + 1;
    }

    const updated = await prisma.leadProductStructureInstance.update({
      where: { id: existing.id },
      data: {
        product_structure_id,
        quantity_index: nextQuantityIndex,
        title: title.trim(),
        description: description?.trim() || null,
        ...(pre_prod_remark !== undefined
          ? {
            pre_prod_remark:
              pre_prod_remark == null ? null : pre_prod_remark.trim() || null,
          }
          : {}),
        updated_by: updated_by ?? null,
      },
    });

    await createLeadLog(prisma, {
      vendor_id: vendorId,
      lead_id: leadId,
      account_id: existing.account_id,
      action: `Product structure instance updated for ${updated.title}`,
      action_type: "UPDATE",
      created_by: updated_by ?? existing.updated_by ?? existing.created_by,
      created_at: new Date(),
    });

    return updated;
  } catch (error: any) {
    console.error(
      "[SERVICE] Error updating lead product structure instance:",
      error,
    );
    throw new Error(
      `Failed to update lead product structure instance: ${error.message}`,
    );
  }
};

export const createLeadProductStructureInstance = async ({
  leadId,
  vendorId,
  product_structure_id,
  title,
  description,
  created_by,
  sub_product_structure_id,
  product_item_code_id,
  quantity,
  isLargeScaleProjectInstance,
}: {
  leadId: number;
  vendorId: number;
  product_structure_id: number;
  title: string;
  description?: string | null;
  created_by: number;
  sub_product_structure_id?: number | null;
  product_item_code_id?: number | null;
  quantity?: number | null;
  isLargeScaleProjectInstance?: boolean;
}) => {
  try {
    const lead = await prisma.leadMaster.findFirst({
      where: {
        id: leadId,
        vendor_id: vendorId,
        is_deleted: false,
      },
      select: { account_id: true },
    });

    if (!lead?.account_id) {
      throw new Error("Lead not found");
    }

    const structure = await prisma.productStructure.findFirst({
      where: {
        id: product_structure_id,
        vendor_id: vendorId,
      },
    });

    if (!structure) {
      throw new Error("Product structure not found");
    }

    const leadProductType = await prisma.leadProductMapping.findFirst({
      where: {
        lead_id: leadId,
        vendor_id: vendorId,
      },
      select: { product_type_id: true },
    });

    let resolvedProductTypeId = leadProductType?.product_type_id || null;
    let resolvedStructureId = product_structure_id;
    let resolvedSubStructureId = sub_product_structure_id ?? null;
    let resolvedItemCodeId = product_item_code_id ?? null;
    let resolvedTitle = title.trim();
    let resolvedDescription = description?.trim() || null;
    let resolvedIsLargeScale = Boolean(isLargeScaleProjectInstance);

    if (resolvedItemCodeId) {
      const itemCode = await prisma.productItemCode.findFirst({
        where: {
          id: resolvedItemCodeId,
          vendor_id: vendorId,
          status: "active",
        },
        include: {
          productStructure: true,
          subProductStructure: true,
        },
      });

      if (!itemCode) {
        throw new Error("Product item code not found");
      }

      if (itemCode.product_structure_id !== product_structure_id) {
        throw new Error("Product structure does not match selected item code");
      }

      if (
        resolvedSubStructureId &&
        itemCode.sub_product_structure_id &&
        itemCode.sub_product_structure_id !== resolvedSubStructureId
      ) {
        throw new Error("Sub product structure does not match selected item code");
      }

      resolvedStructureId = itemCode.product_structure_id;
      resolvedSubStructureId = itemCode.sub_product_structure_id ?? null;
      resolvedTitle = resolvedTitle || itemCode.item_code;
      resolvedDescription = resolvedDescription || itemCode.description || null;
      resolvedIsLargeScale = true;
      resolvedProductTypeId =
        itemCode.productStructure.product_type_id || resolvedProductTypeId;
    }

    if (resolvedSubStructureId) {
      const subStructure = await prisma.productSubStructure.findFirst({
        where: {
          id: resolvedSubStructureId,
          vendor_id: vendorId,
          status: "active",
        },
      });

      if (!subStructure) {
        throw new Error("Sub product structure not found");
      }

      if (subStructure.product_structure_id !== resolvedStructureId) {
        throw new Error("Sub product structure does not match selected product structure");
      }
    }

    if (!resolvedProductTypeId) {
      resolvedProductTypeId = structure.product_type_id ?? null;
    }

    if (!resolvedProductTypeId) {
      throw new Error("Product type not found");
    }

    const productTypeMaster = await prisma.productTypeMaster.findFirst({
      where: {
        id: resolvedProductTypeId,
        vendor_id: vendorId,
      },
      select: { type: true },
    });

    const isKitchenType = String(productTypeMaster?.type || "")
      .toLowerCase()
      .includes("kitchen");

    if (!resolvedItemCodeId && !isKitchenType) {
      const existingMappings =
        await prisma.leadProductStructureMapping.findMany({
          where: {
            lead_id: leadId,
            vendor_id: vendorId,
          },
          select: { product_structure_id: true },
        });

      if (existingMappings.length > 0) {
        const existingInstanceStructureIds =
          await prisma.leadProductStructureInstance.findMany({
            where: {
              lead_id: leadId,
              vendor_id: vendorId,
            },
            select: { product_structure_id: true },
          });

        const existingInstanceSet = new Set(
          existingInstanceStructureIds.map((row) => row.product_structure_id),
        );

        for (const mapping of existingMappings) {
          if (existingInstanceSet.has(mapping.product_structure_id)) continue;
          const mappingStructure = await prisma.productStructure.findFirst({
            where: {
              id: mapping.product_structure_id,
              vendor_id: vendorId,
            },
          });

          if (!mappingStructure) continue;

          await prisma.leadProductStructureInstance.create({
            data: {
              vendor_id: vendorId,
              lead_id: leadId,
              account_id: lead.account_id,
              product_type_id: resolvedProductTypeId,
              product_structure_id: mapping.product_structure_id,
              quantity_index: 1,
              title: mappingStructure.type,
              description: null,
              created_by,
            },
          });
        }
      }
    }

    const existingMapping = await prisma.leadProductStructureMapping.findFirst({
      where: {
        lead_id: leadId,
        vendor_id: vendorId,
        product_structure_id: resolvedStructureId,
      },
    });

    if (!existingMapping) {
      await prisma.leadProductStructureMapping.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: lead.account_id,
          product_structure_id: resolvedStructureId,
          created_by,
        },
      });
    }

    const maxIndex = await prisma.leadProductStructureInstance.aggregate({
      where: {
        lead_id: leadId,
        vendor_id: vendorId,
        product_structure_id: resolvedStructureId,
      },
      _max: { quantity_index: true },
    });

    const quantityIndex = (maxIndex._max.quantity_index || 0) + 1;

    const instance = await prisma.leadProductStructureInstance.create({
      data: {
        vendor_id: vendorId,
        lead_id: leadId,
        account_id: lead.account_id,
        product_type_id: resolvedProductTypeId,
        product_structure_id: resolvedStructureId,
        sub_product_structure_id: resolvedSubStructureId,
        product_item_code_id: resolvedItemCodeId,
        quantity_index: quantityIndex,
        quantity: quantity ?? null,
        title: resolvedTitle,
        description: resolvedDescription,
        isLargeScaleProjectInstance: resolvedIsLargeScale,
        created_by,
      },
    });

    await createLeadLog(prisma, {
      vendor_id: vendorId,
      lead_id: leadId,
      account_id: lead.account_id,
      action: `Product structure instance added : ${instance.title}`,
      action_type: "UPDATE",
      created_by,
      created_at: new Date(),
    });

    return instance;
  } catch (error: any) {
    console.error(
      "[SERVICE] Error creating lead product structure instance:",
      error,
    );
    throw new Error(
      `Failed to create lead product structure instance: ${error.message}`,
    );
  }
};

export const softDeleteLead = async (leadId: number, deletedBy: number) => {
  // 1. Fetch the lead with its account
  const lead = await prisma.leadMaster.findUnique({
    where: { id: leadId },
    include: { account: true },
  });

  if (!lead) {
    throw new Error("Lead not found");
  }

  if (lead.is_deleted) {
    throw new Error("Lead already deleted");
  }

  // 2. Start transaction for lead + account deletion
  return prisma.$transaction(async (tx) => {
    // Soft delete lead
    const deletedLead = await tx.leadMaster.update({
      where: { id: leadId },
      data: {
        is_deleted: true,
        deleted_by: deletedBy,
        deleted_at: new Date(),
      },
    });

    // If lead has an account, soft delete it too
    if (lead.account) {
      await tx.accountMaster.update({
        where: { id: lead.account.id },
        data: {
          is_deleted: true,
          deleted_by: deletedBy,
          deleted_at: new Date(),
        },
      });
    }

    // Fetch all users mapped to this lead (active mappings only)
    const mappings = await tx.leadUserMapping.findMany({
      where: {
        lead_id: leadId,
        status: "active",
      },
      select: { user_id: true, vendor_id: true },
    });

    // 2️⃣ Soft delete LeadUserMapping (set status = inactive)
    await tx.leadUserMapping.updateMany({
      where: {
        lead_id: leadId,
        status: "active",
      },
      data: {
        status: "inactive",
        updated_by: deletedBy,
        updated_at: new Date(),
      },
    });

    // 3️⃣ Add log entry in LeadDetailedLogs
    await createLeadLog(tx, {
      vendor_id: lead.vendor_id,
      lead_id: lead.id,
      account_id: lead.account_id!,
      action: "Lead has been deleted successfully",
      action_type: "DELETE",
      created_by: deletedBy,
      created_at: new Date(),
    });

    logger.info("✅ LeadDetailedLogs entry created for lead deletion", {
      lead_id: lead.id,
      deleted_by: deletedBy,
    });

    // 🧹 Clear Performance Snapshot cache for all mapped users
    for (const mapping of mappings) {
      await cache.del(
        `performance:snapshot:${mapping.vendor_id}:${mapping.user_id}`,
      );
    }

    // 🧹 Also clear for the user who deleted
    await cache.del(`performance:snapshot:${lead.vendor_id}:${deletedBy}`);

    return deletedLead;
  });
};

export const updateLeadService = async (
  leadId: number,
  payload: UpdateLeadDTO,
  clientBaseUrl?: string,
) => {
  let leadCreatedEmailPayload: LeadCreatedEmailPayload | null = null;
  let leadFranchiseId: number | null = null;
  let leadStageTag: string | null = null;
  const {
    firstname,
    lastname,
    country_code,
    contact_no,
    alt_contact_no,
    email,
    site_address,
    site_map_link,
    site_type_id,
    source_id,
    priority,
    archetech_name,
    architect_id,
    archetech_number,
    designer_remark,
    updated_by,
    initial_site_measurement_date,
  } = payload;

  const result = await prisma.$transaction(async (tx) => {
    // 1. Check if lead exists and get current data
    const existingLead = await tx.leadMaster.findFirst({
      where: {
        id: leadId,
        is_deleted: false,
      },
      include: {
        account: true,
      },
    });

    if (!existingLead) {
      throw new Error(`Lead with ID ${leadId} not found or has been deleted`);
    }

    const vendor_id = existingLead.vendor_id;

    // 2. Build dynamic update data for AccountMaster
    const accountUpdateData: any = {
      updated_by,
      updated_at: new Date(),
    };

    // Only update account fields if lead contact info is being updated
    if (firstname !== undefined || lastname !== undefined) {
      accountUpdateData.name = `${firstname || existingLead.firstname} ${lastname || existingLead.lastname
        }`;
    }
    if (country_code !== undefined)
      accountUpdateData.country_code = country_code;
    if (contact_no !== undefined) accountUpdateData.contact_no = contact_no;
    if (alt_contact_no !== undefined)
      accountUpdateData.alt_contact_no = alt_contact_no;
    if (email !== undefined) accountUpdateData.email = email;

    const updatedAccount = await tx.accountMaster.update({
      where: { id: existingLead.account_id! },
      data: accountUpdateData,
    });

    // 7. Build dynamic update data for LeadMaster
    const leadUpdateData: any = {
      updated_by,
      updated_at: new Date(),
    };

    if (initial_site_measurement_date !== undefined) {
      const dateValue = new Date(initial_site_measurement_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0); // normalize to start of day

      if (dateValue < today) {
        throw new Error(
          `Invalid initial_site_measurement_date: ${initial_site_measurement_date}. Date must be today or a future date.`,
        );
      }

      leadUpdateData.initial_site_measurement_date = dateValue;
    }

    // ✅ Add site_map_link update
    if (site_map_link !== undefined) {
      leadUpdateData.site_map_link = site_map_link;
    }

    // Only include fields that are actually being updated
    if (firstname !== undefined) leadUpdateData.firstname = firstname;
    if (lastname !== undefined) leadUpdateData.lastname = lastname;
    if (country_code !== undefined) leadUpdateData.country_code = country_code;
    if (contact_no !== undefined) leadUpdateData.contact_no = contact_no;
    if (alt_contact_no !== undefined)
      leadUpdateData.alt_contact_no = alt_contact_no;
    if (email !== undefined) leadUpdateData.email = email;
    if (site_address !== undefined) leadUpdateData.site_address = site_address;
    if (site_type_id !== undefined) leadUpdateData.site_type_id = site_type_id;
    if (source_id !== undefined) leadUpdateData.source_id = source_id;
    if (priority !== undefined) {
      leadUpdateData.priority = priority?.trim() || null;
    }
    if (archetech_name !== undefined)
      leadUpdateData.archetech_name = archetech_name;
    if (architect_id !== undefined)
      leadUpdateData.architect_id = architect_id ? Number(architect_id) : null;
    if (archetech_number !== undefined)
      leadUpdateData.archetech_number = archetech_number;
    if (designer_remark !== undefined)
      leadUpdateData.designer_remark = designer_remark;

    const updatedLead = await tx.leadMaster.update({
      where: { id: leadId },
      data: leadUpdateData,
    });

    // ✅ Auto-unmark draft if completed and prepare email payload
    if (existingLead.is_draft) {
      const hydratedLead = await tx.leadMaster.findFirst({
        where: { id: leadId },
        include: {
          productMappings: { include: { productType: true } },
          leadProductStructureMapping: { include: { productStructure: true } },
          assignedTo: { select: { user_email: true, user_name: true } },
          createdBy: { select: { user_name: true } },
          statusType: { select: { tag: true } },
        },
      });

      if (hydratedLead && isLeadComplete(hydratedLead)) {
        await tx.leadMaster.update({
          where: { id: leadId },
          data: { is_draft: false },
        });

        const assigneeEmail = hydratedLead.assignedTo?.user_email?.trim();
        if (hydratedLead.assign_to && assigneeEmail) {
          const leadName = `${hydratedLead.firstname ?? ""} ${hydratedLead.lastname ?? ""
            }`.trim();
          const leadCode =
            (hydratedLead as any).lead_code ??
            `LEAD-${String(hydratedLead.id).padStart(4, "0")}`;
          const contactDetails = `${hydratedLead.country_code ?? ""} ${hydratedLead.contact_no ?? ""
            }`.trim();
          const furnitureType =
            hydratedLead.productMappings
              ?.map((item) => item.productType?.type)
              .filter(Boolean)
              .join(", ") || "—";
          const furnitureStructure =
            hydratedLead.leadProductStructureMapping
              ?.map((item) => item.productStructure?.type)
              .filter(Boolean)
              .join(", ") || "—";
          const createdDate = hydratedLead.created_at
            ? new Date(hydratedLead.created_at).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
            : new Date().toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            });
          const createdByName = hydratedLead.createdBy?.user_name ?? "System";
          const baseUrl = clientBaseUrl;
          const leadUrl = `${baseUrl}/dashboard/leads/details/${hydratedLead.id}?accountId=${hydratedLead.account_id}`;

          leadCreatedEmailPayload = {
            vendor_id: hydratedLead.vendor_id,
            toEmail: assigneeEmail,
            toName: hydratedLead.assignedTo?.user_name ?? undefined,
            leadCode,
            leadName: leadName || "—",
            contact: contactDetails || "—",
            furnitureType,
            furnitureStructure,
            createdDate,
            createdBy: createdByName,
            leadUrl,
          };
          leadFranchiseId = hydratedLead.franchise_id ?? null;
          leadStageTag = hydratedLead.statusType?.tag ?? null;
        }
      }
    }

    const normalizeLogValue = (value: unknown): string | null => {
      if (value === null || value === undefined) return null;
      if (value instanceof Date) {
        return value.toISOString().split("T")[0];
      }

      const stringValue = String(value).trim();
      return stringValue.length > 0 ? stringValue : null;
    };

    const [oldSiteType, newSiteType, oldSource, newSource] =
      await Promise.all([
        existingLead.site_type_id
          ? tx.siteTypeMaster.findFirst({
            where: {
              id: existingLead.site_type_id,
              vendor_id,
            },
            select: { type: true },
          })
          : Promise.resolve(null),
        updatedLead.site_type_id
          ? tx.siteTypeMaster.findFirst({
            where: {
              id: updatedLead.site_type_id,
              vendor_id,
            },
            select: { type: true },
          })
          : Promise.resolve(null),
        existingLead.source_id
          ? tx.sourceMaster.findFirst({
            where: {
              id: existingLead.source_id,
              vendor_id,
            },
            select: { type: true },
          })
          : Promise.resolve(null),
        updatedLead.source_id
          ? tx.sourceMaster.findFirst({
            where: {
              id: updatedLead.source_id,
              vendor_id,
            },
            select: { type: true },
          })
          : Promise.resolve(null),
      ]);

    const logEntries: string[] = [];
    const pushChangeLog = (label: string, oldVal: unknown, newVal: unknown) => {
      if (newVal === undefined) return;

      const previousValue = normalizeLogValue(oldVal);
      const nextValue = normalizeLogValue(newVal);

      if (previousValue === nextValue) return;

      if (!previousValue && nextValue) {
        logEntries.push(`${label} has been added as "${nextValue}".`);
        return;
      }

      if (previousValue && !nextValue) {
        logEntries.push(`${label} has been cleared from "${previousValue}".`);
        return;
      }

      logEntries.push(
        `${label} has been updated from "${previousValue}" to "${nextValue}".`,
      );
    };

    pushChangeLog("First Name", existingLead.firstname, updatedLead.firstname);
    pushChangeLog("Last Name", existingLead.lastname, updatedLead.lastname);
    pushChangeLog(
      "Country Code",
      existingLead.country_code,
      updatedLead.country_code,
    );
    pushChangeLog("Email", existingLead.email, updatedLead.email);
    pushChangeLog(
      "Contact Number",
      existingLead.contact_no,
      updatedLead.contact_no,
    );
    pushChangeLog(
      "Alternate Contact Number",
      existingLead.alt_contact_no,
      updatedLead.alt_contact_no,
    );
    pushChangeLog(
      "Site Type",
      oldSiteType?.type ?? existingLead.site_type_id,
      newSiteType?.type ?? updatedLead.site_type_id,
    );
    pushChangeLog(
      "Source",
      oldSource?.type ?? existingLead.source_id,
      newSource?.type ?? updatedLead.source_id,
    );
    pushChangeLog("Priority", existingLead.priority, updatedLead.priority);
    pushChangeLog(
      "Site Address",
      existingLead.site_address,
      updatedLead.site_address,
    );
    pushChangeLog(
      "Site Map Link",
      existingLead.site_map_link,
      updatedLead.site_map_link,
    );
    pushChangeLog(
      "Architect Name",
      existingLead.archetech_name,
      updatedLead.archetech_name,
    );
    pushChangeLog(
      "Designer Remark",
      existingLead.designer_remark,
      updatedLead.designer_remark,
    );
    pushChangeLog(
      "Initial Site Measurement Date",
      existingLead.initial_site_measurement_date,
      updatedLead.initial_site_measurement_date,
    );

    for (const actionMessage of logEntries) {
      await createLeadLog(tx, {
        vendor_id,
        lead_id: updatedLead.id,
        account_id: updatedAccount.id,
        action: actionMessage,
        action_type: "UPDATE",
        created_by: updated_by,
        created_at: new Date(),
      });
    }

    if (logEntries.length > 0) {
      logger.info("✅ LeadDetailedLogs entry created for lead update", {
        lead_id: updatedLead.id,
        actionMessages: logEntries,
      });
    }

    console.log("[INFO] Lead updated successfully:", {
      leadId,
      accountId: updatedAccount.id,
    });

    return {
      lead: updatedLead,
      account: updatedAccount,
    };
  });

  if (leadCreatedEmailPayload) {
    const payload: LeadCreatedEmailPayload = leadCreatedEmailPayload;
    try {
      await sendLeadCreatedEmail(payload);

      // Also notify franchise-filtered admins (mirrors createLead behaviour)
      const { recipients: adminUsers, isSuperAdminFallback } = await getFranchiseAdminRecipients({
        vendorId: payload.vendor_id,
        franchiseId: leadFranchiseId,
        excludeUserId: updated_by ?? null,
      });

      const adminRecipients = adminUsers.filter((u) => u.user_email);

      if (adminRecipients.length > 0) {
        const redirectUrl = resolveLeadStagePath(
          leadId,
          leadStageTag,
          result.lead.account_id,
        );

        await Promise.allSettled([
          ...adminRecipients.map((admin) =>
            sendLeadCreatedEmail({
              ...payload,
              allowSuperAdmin: isSuperAdminFallback,
              toEmail: admin.user_email!,
              toName: admin.user_name ?? undefined,
            }),
          ),
          ...adminRecipients.map((admin) =>
            NotificationService.createAndSend({
              vendor_id: result.lead.vendor_id,
              user_id: admin.id,
              sender_id: updated_by ?? null,
              type: NotificationType.LEAD_ASSIGNED,
              title: "New lead created",
              message: `Lead ${payload.leadName || payload.leadCode || `#${leadId}`} has been created.`,
              entity_type: "lead",
              entity_id: leadId,
              redirect_url: redirectUrl,
            }),
          ),
        ]);
      }
    } catch (emailError: any) {
      logger.warn(
        "⚠️ Failed to send lead created email after draft completion",
        {
          error: emailError?.message,
        },
      );
    }
  }

  return result;
};

const setLeadBlockedState = async (
  payload: ToggleLeadBlockInput,
  isBlocked: boolean,
) => {
  const { vendor_id, lead_id, updated_by } = payload;

  return prisma.$transaction(async (tx) => {
    const existingLead = await tx.leadMaster.findFirst({
      where: {
        id: lead_id,
        vendor_id,
        is_deleted: false,
      },
      select: {
        id: true,
        vendor_id: true,
        account_id: true,
        is_blocked: true,
      },
    });

    if (!existingLead || !existingLead.account_id) {
      throw new Error(`Lead with ID ${lead_id} not found`);
    }

    const blockedAt = isBlocked ? new Date() : null;

    const updatedLead = await tx.leadMaster.update({
      where: { id: lead_id },
      data: {
        is_blocked: isBlocked,
        lead_blocked_at: blockedAt,
        updated_by,
        updated_at: new Date(),
      },
      select: {
        id: true,
        vendor_id: true,
        is_blocked: true,
        lead_blocked_at: true,
        updated_by: true,
        updated_at: true,
      },
    });

    await createLeadLog(tx, {
      vendor_id,
      lead_id,
      account_id: existingLead.account_id,
      action: isBlocked ? "Lead blocked" : "Lead unblocked",
      action_type: "UPDATE",
      created_by: updated_by,
      history_type: "Lead",
    });

    return updatedLead;
  });
};

export const blockLeadService = async (payload: ToggleLeadBlockInput) =>
  setLeadBlockedState(payload, true);

export const unblockLeadService = async (payload: ToggleLeadBlockInput) =>
  setLeadBlockedState(payload, false);

export const getLeadBlockStatus = async (vendorId: number, leadId: number) => {
  const lead = await prisma.leadMaster.findFirst({
    where: {
      id: leadId,
      vendor_id: vendorId,
      is_deleted: false,
    },
    select: {
      id: true,
      vendor_id: true,
      is_blocked: true,
      lead_blocked_at: true,
    },
  });

  if (!lead) {
    throw new Error(`Lead with ID ${leadId} not found`);
  }

  return lead;
};

export const isContactOrEmailExists = async (
  vendor_id: number,
  payload: { phone_number?: string; alt_phone_number?: string; email?: string },
) => {
  const { phone_number, alt_phone_number, email } = payload;
  const provided = [phone_number, alt_phone_number, email].filter(
    (v) => v !== undefined && v !== null && String(v).trim() !== "",
  );

  if (provided.length !== 1) {
    throw Object.assign(
      new Error(
        "Provide exactly one of phone_number, alt_phone_number, or email",
      ),
      { statusCode: 400 },
    );
  }

  let whereClause: any = { vendor_id, is_deleted: false };
  if (phone_number) whereClause.contact_no = phone_number;
  if (alt_phone_number) whereClause.alt_contact_no = alt_phone_number;
  if (email) whereClause.email = email;

  const existingLead = await prisma.leadMaster.findFirst({
    where: whereClause,
    select: {
      id: true,
      lead_code: true,
      firstname: true,
      lastname: true,
    },
  });

  return {
    exists: Boolean(existingLead),
    checked_field: phone_number
      ? "phone_number"
      : alt_phone_number
        ? "alt_phone_number"
        : "email",
    lead: existingLead
      ? {
        lead_id: existingLead.id,
        lead_code: existingLead.lead_code,
        lead_name: `${existingLead.firstname ?? ""} ${existingLead.lastname ?? ""
          }`.trim(),
      }
      : null,
  };
};

export const isSimilarLeadExists = async (
  vendor_id: number,
  payload: {
    phone_number?: string;
    product_types?: number[];
  },
) => {
  const phone_number = payload.phone_number?.trim() || "";
  const product_types = (payload.product_types || []).filter((value) =>
    Number.isFinite(value),
  );

  if (!phone_number) {
    throw Object.assign(new Error("phone_number is required"), {
      statusCode: 400,
    });
  }

  if (product_types.length === 0) {
    throw Object.assign(new Error("At least one product_type is required"), {
      statusCode: 400,
    });
  }

  const existingLead = await findSimilarLeadByContactAndProducts(prisma, vendor_id, {
    contact_no: phone_number,
    product_types,
  });

  return {
    exists: Boolean(existingLead),
    lead: existingLead ? toLeadLookupPayload(existingLead) : null,
  };
};

export const getSalesExecutivesByVendor = async (
  vendorId: number,
  franchiseId?: number,
  options?: {
    assigneeUserType?: string;
    requiredPrivilegeCode?: string;
    taskType?: string;
  },
): Promise<SalesExecutiveData[]> => {
  try {
    console.log(
      `[SERVICE] Fetching sales executives for vendor ID: ${vendorId}`,
    );

    const normalizedTaskType = options?.taskType?.trim().toLowerCase();

    if (normalizedTaskType === "followup") {
      const allUsers = await prisma.userMaster.findMany({
        where: {
          vendor_id: vendorId,
          status: "active",
          ...(franchiseId !== undefined ? { franchise_id: franchiseId } : {}),
        },
        include: {
          user_type: true,
          documents: true,
        },
        orderBy: {
          created_at: "desc",
        },
      });

      console.log(`[SERVICE] Found ${allUsers.length} eligible users for followup task`);

      return allUsers.map((user) => ({
        id: user.id,
        vendor_id: user.vendor_id,
        user_name: user.user_name,
        user_contact: user.user_contact,
        user_email: user.user_email,
        user_timezone: user.user_timezone,
        status: user.status,
        created_at: user.created_at,
        updated_at: user.updated_at,
        user_type: {
          id: user.user_type.id,
          user_type: user.user_type.user_type,
        },
        documents: user.documents.map((doc) => ({
          id: doc.id,
          document_name: doc.document_name,
          document_number: doc.document_number,
          filename: doc.filename,
        })),
      }));
    }

    const normalizedAssigneeUserType =
      options?.assigneeUserType?.trim().toLowerCase() ?? null;

    if (normalizedAssigneeUserType === "custom") {
      const customUsers = await prisma.userMaster.findMany({
        where: {
          vendor_id: vendorId,
          status: "active",
          ...(franchiseId !== undefined ? { franchise_id: franchiseId } : {}),
          OR: [
            {
              user_type: {
                user_type: { in: ["super-admin"] },
              },
            },
            {
              user_type: {
                user_type: { equals: "custom", mode: "insensitive" },
              },
              ...(options?.requiredPrivilegeCode
                ? {
                    userPrivilegeMappings: {
                      some: {
                        is_allowed: true,
                        privilege: {
                          code: options.requiredPrivilegeCode,
                          is_active: true,
                        },
                      },
                    },
                  }
                : {}),
            },
          ],
        },
        include: {
          user_type: true,
          documents: true,
        },
        orderBy: {
          created_at: "desc",
        },
      });

      console.log(`[SERVICE] Found ${customUsers.length} eligible custom users`);

      return customUsers.map((user) => ({
        id: user.id,
        vendor_id: user.vendor_id,
        user_name: user.user_name,
        user_contact: user.user_contact,
        user_email: user.user_email,
        user_timezone: user.user_timezone,
        status: user.status,
        created_at: user.created_at,
        updated_at: user.updated_at,
        user_type: {
          id: user.user_type.id,
          user_type: user.user_type.user_type,
        },
        documents: user.documents.map((doc) => ({
          id: doc.id,
          document_name: doc.document_name,
          document_number: doc.document_number,
          filename: doc.filename,
        })),
      }));
    }

    // Fetch all users with sales-executive role for the specified vendor
    const salesExecutives = await prisma.userMaster.findMany({
      where: {
        vendor_id: vendorId,
        user_type: {
          user_type: { in: ["sales-executive"] },
        },
        // Optionally filter only active users
        status: "active",
        ...(franchiseId !== undefined ? { franchise_id: franchiseId } : {}),
      },
      include: {
        user_type: true,
        documents: true,
      },
      orderBy: {
        created_at: "desc",
      },
    });

    console.log(`[SERVICE] Found ${salesExecutives.length} sales executives`);

    // Transform the data to match our interface
    const transformedData: SalesExecutiveData[] = salesExecutives.map(
      (executive) => ({
        id: executive.id,
        vendor_id: executive.vendor_id,
        user_name: executive.user_name,
        user_contact: executive.user_contact,
        user_email: executive.user_email,
        user_timezone: executive.user_timezone,
        status: executive.status,
        created_at: executive.created_at,
        updated_at: executive.updated_at,
        user_type: {
          id: executive.user_type.id,
          user_type: executive.user_type.user_type,
        },
        documents: executive.documents.map((doc) => ({
          id: doc.id,
          document_name: doc.document_name,
          document_number: doc.document_number,
          filename: doc.filename,
        })),
      }),
    );

    return transformedData;
  } catch (error: any) {
    console.error("[SERVICE] Error fetching sales executives:", error);
    throw new Error(`Failed to fetch sales executives: ${error.message}`);
  }
};

export const getSiteSupervisorByVendor = async (
  vendorId: number,
): Promise<SiteSupervisorData[]> => {
  try {
    console.log(
      `[SERVICE] Fetching Site Supervisor for vendor ID: ${vendorId}`,
    );

    // First, find the user type ID for 'site-supervisor'
    const SiteSupervisorType = await prisma.userTypeMaster.findFirst({
      where: {
        user_type: {
          equals: "site-supervisor",
          mode: "insensitive", // Case insensitive search
        },
      },
    });

    if (!SiteSupervisorType) {
      console.log("[SERVICE] Site Supervisor user type not found");
      return [];
    }

    console.log(
      `[SERVICE] Found Site Supervisor type ID: ${SiteSupervisorType.id}`,
    );

    // Fetch all users with sales-executive role for the specified vendor
    const siteSupervisor = await prisma.userMaster.findMany({
      where: {
        vendor_id: vendorId,
        user_type_id: SiteSupervisorType.id,
        // Optionally filter only active users
        status: "active",
      },
      include: {
        user_type: true,
        documents: true,
      },
      orderBy: {
        created_at: "desc",
      },
    });

    console.log(`[SERVICE] Found ${siteSupervisor.length} Site Supervisors`);

    // Transform the data to match our interface
    const transformedData: SalesExecutiveData[] = siteSupervisor.map(
      (supervisor) => ({
        id: supervisor.id,
        vendor_id: supervisor.vendor_id,
        user_name: supervisor.user_name,
        user_contact: supervisor.user_contact,
        user_email: supervisor.user_email,
        user_timezone: supervisor.user_timezone,
        status: supervisor.status,
        created_at: supervisor.created_at,
        updated_at: supervisor.updated_at,
        user_type: {
          id: supervisor.user_type.id,
          user_type: supervisor.user_type.user_type,
        },
        documents: supervisor.documents.map((doc) => ({
          id: doc.id,
          document_name: doc.document_name,
          document_number: doc.document_number,
          filename: doc.filename,
        })),
      }),
    );

    return transformedData;
  } catch (error: any) {
    console.error("[SERVICE] Error fetching Site Supervisors:", error);
    throw new Error(`Failed to fetch Site Supervisors: ${error.message}`);
  }
};

export const getHeadSiteSupervisorByVendor = async (
  vendorId: number,
): Promise<SiteSupervisorData[]> => {
  try {
    console.log(
      `[SERVICE] Fetching Head Site Supervisor for vendor ID: ${vendorId}`,
    );

    // First, find the user type ID for 'head-site-supervisor'
    const headSiteSupervisorType = await prisma.userTypeMaster.findFirst({
      where: {
        user_type: {
          equals: "head-site-supervisor",
          mode: "insensitive", // Case insensitive search
        },
      },
    });

    if (!headSiteSupervisorType) {
      console.log("[SERVICE] Head Site Supervisor user type not found");
      return [];
    }

    console.log(
      `[SERVICE] Found Head Site Supervisor type ID: ${headSiteSupervisorType.id}`,
    );

    const headSiteSupervisors = await prisma.userMaster.findMany({
      where: {
        vendor_id: vendorId,
        user_type_id: headSiteSupervisorType.id,
        status: "active",
      },
      include: {
        user_type: true,
        documents: true,
      },
      orderBy: {
        created_at: "desc",
      },
    });

    console.log(
      `[SERVICE] Found ${headSiteSupervisors.length} Head Site Supervisors`,
    );

    const transformedData: SiteSupervisorData[] = headSiteSupervisors.map(
      (supervisor) => ({
        id: supervisor.id,
        vendor_id: supervisor.vendor_id,
        franchise_id: supervisor.franchise_id,
        user_name: supervisor.user_name,
        user_contact: supervisor.user_contact,
        user_email: supervisor.user_email,
        user_timezone: supervisor.user_timezone,
        status: supervisor.status,
        created_at: supervisor.created_at,
        updated_at: supervisor.updated_at,
        user_type: {
          id: supervisor.user_type.id,
          user_type: supervisor.user_type.user_type,
        },
        documents: supervisor.documents.map((doc) => ({
          id: doc.id,
          document_name: doc.document_name,
          document_number: doc.document_number,
          filename: doc.filename,
        })),
      }),
    );

    return transformedData;
  } catch (error: any) {
    console.error("[SERVICE] Error fetching Head Site Supervisors:", error);
    throw new Error(`Failed to fetch Head Site Supervisors: ${error.message}`);
  }
};

/**
 * Get a specific sales executive by ID within a vendor
 * @param vendorId - The vendor ID
 * @param userId - The user ID of the sales executive
 * @returns Promise<SalesExecutiveData | null>
 */
export const getSalesExecutiveById = async (
  vendorId: number,
  userId: number,
): Promise<SalesExecutiveData | null> => {
  try {
    console.log(
      `[SERVICE] Fetching sales executive ID: ${userId} for vendor: ${vendorId}`,
    );

    // First, find the user type ID for 'sales-executive'
    const salesExecutiveType = await prisma.userTypeMaster.findFirst({
      where: {
        user_type: {
          equals: "sales-executive",
          mode: "insensitive",
        },
      },
    });

    if (!salesExecutiveType) {
      console.log("[SERVICE] Sales executive user type not found");
      return null;
    }

    // Fetch the specific sales executive
    const salesExecutive = await prisma.userMaster.findFirst({
      where: {
        id: userId,
        vendor_id: vendorId,
        user_type_id: salesExecutiveType.id,
      },
      include: {
        user_type: true,
        documents: true,
      },
    });

    if (!salesExecutive) {
      console.log(`[SERVICE] Sales executive not found with ID: ${userId}`);
      return null;
    }

    // Transform the data
    const transformedData: SalesExecutiveData = {
      id: salesExecutive.id,
      vendor_id: salesExecutive.vendor_id,
      user_name: salesExecutive.user_name,
      user_contact: salesExecutive.user_contact,
      user_email: salesExecutive.user_email,
      user_timezone: salesExecutive.user_timezone,
      status: salesExecutive.status,
      created_at: salesExecutive.created_at,
      updated_at: salesExecutive.updated_at,
      user_type: {
        id: salesExecutive.user_type.id,
        user_type: salesExecutive.user_type.user_type,
      },
      documents: salesExecutive.documents.map((doc) => ({
        id: doc.id,
        document_name: doc.document_name,
        document_number: doc.document_number,
        filename: doc.filename,
      })),
    };

    return transformedData;
  } catch (error: any) {
    console.error("[SERVICE] Error fetching sales executive by ID:", error);
    throw new Error(`Failed to fetch sales executive: ${error.message}`);
  }
};

/**
 * Assign lead to a sales executive
 * @param leadId - Lead ID to assign
 * @param vendorId - Vendor ID
 * @param payload - Assignment payload with assign_to and assign_by
 * @returns Promise<LeadAssignmentResult>
 */
export const assignLeadToUser = async (
  leadId: number,
  vendorId: number,
  payload: AssignLeadPayload,
  clientBaseUrl?: string,
): Promise<LeadAssignmentResult> => {
  try {
    console.log(`[SERVICE] Starting lead assignment process`);
    console.log(`[SERVICE] Lead ID: ${leadId}, Vendor ID: ${vendorId}`);
    console.log(
      `[SERVICE] Assign to: ${payload.assign_to}, Assign by: ${payload.assign_by}`,
    );

    // Step 1: Validate admin user (assign_by)
    const adminUser = await validateAdminUser(payload.assign_by, vendorId);
    if (!adminUser) {
      throw new Error("Invalid admin user or insufficient permissions");
    }

    // Step 2: Validate sales executive user (assign_to)
    const salesExecutiveUser = await validateSalesExecutiveUser(
      payload.assign_to,
      vendorId,
    );
    if (!salesExecutiveUser) {
      throw new Error("Invalid sales executive user or user is not active");
    }

    // Step 3: Validate lead ownership
    const lead = await prisma.leadMaster.findUnique({
      where: { id: leadId },
      include: { account: true },
    });

    if (!lead || lead.vendor_id !== vendorId) {
      throw new Error("Lead not found or doesn't belong to this vendor");
    }

    // Step 4: Check if lead is already assigned to the same user
    const previousAssignee =
      lead.assign_to !== null
        ? await prisma.userMaster.findUnique({
          where: { id: lead.assign_to },
          select: { user_name: true },
        })
        : null;

    if (lead.assign_to === payload.assign_to) {
      throw new Error(
        `Lead is already assigned to ${salesExecutiveUser.user_name}`,
      );
    }

    // Step 5: Update the lead assignment
    const updatedLead = await prisma.leadMaster.update({
      where: { id: leadId },
      data: {
        assign_to: payload.assign_to,
        assigned_by: payload.assign_by,
        updated_by: payload.assign_by,
        updated_at: new Date(),
      },
      select: {
        id: true,
        firstname: true,
        lastname: true,
        contact_no: true,
        email: true,
        assign_to: true,
        assigned_by: true,
        updated_at: true,
      },
    });

    // -------------------------------------------
    // 6️⃣ LeadUserMapping Updates
    // -------------------------------------------

    const oldAssignee = lead.assign_to;

    // If lead was previously assigned, deactivate their mapping
    if (oldAssignee) {
      await prisma.leadUserMapping.updateMany({
        where: {
          lead_id: leadId,
          user_id: oldAssignee,
          status: "active",
        },
        data: {
          status: "inactive",
          updated_by: payload.assign_by,
          updated_at: new Date(),
        },
      });
    }

    // Insert new mapping for the new assignee
    await prisma.leadUserMapping.create({
      data: {
        vendor_id: vendorId,
        lead_id: leadId,
        account_id: lead.account?.id!,
        user_id: payload.assign_to,
        type: "ISM",
        status: "active",
        created_by: payload.assign_by,
      },
    });

    // Invalidate old assignee snapshot
    if (oldAssignee) {
      await cache.del(`performance:snapshot:${vendorId}:${oldAssignee}`);
    }

    // Invalidate new assignee snapshot
    await cache.del(`performance:snapshot:${vendorId}:${payload.assign_to}`);

    // Invalidate admin user’s snapshot (assign_by)
    await cache.del(`performance:snapshot:${vendorId}:${payload.assign_by}`);

    console.log(`[SERVICE] Lead assignment successful`);
    console.log(
      `[SERVICE] Lead ${leadId} assigned to ${salesExecutiveUser.user_name} by ${adminUser.user_name}`,
    );

    // Step 6: Insert LeadDetailedLogs entry (Audit Trail)
    const oldAssigneeName = previousAssignee?.user_name ?? "Unassigned";
    const newAssigneeName = salesExecutiveUser.user_name;

    const actionMessage =
      oldAssigneeName === "Unassigned"
        ? `Lead has been assigned to ${newAssigneeName}.`
        : `Lead has been reassigned from ${oldAssigneeName} to ${newAssigneeName}.`;

    await createLeadLog(prisma, {
      vendor_id: vendorId,
      lead_id: lead.id,
      account_id: lead.account?.id!,
      action: actionMessage,
      action_type: "UPDATE",
      created_by: payload.assign_by,
      created_at: new Date(),
    });

    logger.info("✅ LeadDetailedLogs entry created for lead assignment", {
      lead_id: lead.id,
      actionMessage,
    });

    try {
      const leadName = `${lead.firstname} ${lead.lastname}`.trim();
      const title =
        oldAssigneeName === "Unassigned"
          ? "New lead assigned"
          : "Lead reassigned";
      const message =
        oldAssigneeName === "Unassigned"
          ? `Lead ${leadName} has been assigned to you.`
          : `Lead ${leadName} has been reassigned to you.`;

      await NotificationService.createAndSend({
        vendor_id: vendorId,
        user_id: payload.assign_to,
        sender_id: payload.assign_by,
        type: NotificationType.LEAD_ASSIGNED,
        title,
        message,
        entity_type: "lead",
        entity_id: lead.id,
        redirect_url: `/dashboard/leads/details/${lead.id}?accountId=${lead.account_id}`,
      });
    } catch (notificationError: any) {
      logger.warn("⚠️ Failed to create lead assignment notification", {
        error: notificationError?.message,
        lead_id: lead.id,
        assign_to: payload.assign_to,
      });
    }

    // Step 7: Prepare response data
    const result: LeadAssignmentResult = {
      lead: updatedLead,
      assignedTo: {
        id: salesExecutiveUser.id,
        user_name: salesExecutiveUser.user_name,
        user_contact: "",
        user_email: "",
      },
      assignedBy: {
        id: adminUser.id,
        user_name: adminUser.user_name,
        user_contact: "",
        user_email: "",
      },
    };

    // Optionally fetch full user details
    const [assignedToDetails, assignedByDetails] = await Promise.all([
      prisma.userMaster.findUnique({
        where: { id: payload.assign_to },
        select: { user_contact: true, user_email: true },
      }),
      prisma.userMaster.findUnique({
        where: { id: payload.assign_by },
        select: { user_contact: true, user_email: true },
      }),
    ]);

    if (assignedToDetails) {
      result.assignedTo.user_contact = assignedToDetails.user_contact;
      result.assignedTo.user_email = assignedToDetails.user_email;
    }

    if (assignedByDetails) {
      result.assignedBy.user_contact = assignedByDetails.user_contact;
      result.assignedBy.user_email = assignedByDetails.user_email;
    }

    try {
      const assigneeEmail = assignedToDetails?.user_email?.trim();
      if (!assigneeEmail) {
        logger.warn("Lead assignment email skipped: missing assignee email", {
          lead_id: lead.id,
          assign_to: payload.assign_to,
        });
      } else {
        const leadDetails = await prisma.leadMaster.findUnique({
          where: { id: leadId },
          select: {
            id: true,
            vendor_id: true,
            lead_code: true,
            firstname: true,
            lastname: true,
            country_code: true,
            contact_no: true,
            created_at: true,
            account_id: true,
            productMappings: {
              select: { productType: { select: { type: true } } },
            },
            leadProductStructureMapping: {
              select: { productStructure: { select: { type: true } } },
            },
          },
        });

        if (leadDetails) {
          const leadName = `${leadDetails.firstname ?? ""} ${leadDetails.lastname ?? ""
            }`.trim();
          const leadCode =
            leadDetails.lead_code ??
            `LEAD-${String(leadDetails.id).padStart(4, "0")}`;
          const contactDetails = `${leadDetails.country_code ?? ""} ${leadDetails.contact_no ?? ""
            }`.trim();
          const furnitureType =
            leadDetails.productMappings
              ?.map((item) => item.productType?.type)
              .filter(Boolean)
              .join(", ") || "—";
          const furnitureStructure =
            leadDetails.leadProductStructureMapping
              ?.map((item) => item.productStructure?.type)
              .filter(Boolean)
              .join(", ") || "—";
          const createdDate = leadDetails.created_at
            ? new Date(leadDetails.created_at).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
            : "—";
          const createdByName = adminUser.user_name ?? "Admin";
          const baseUrl = clientBaseUrl || "http://localhost:3000";
          const leadUrl = `${baseUrl}/dashboard/leads/details/${leadDetails.id}?accountId=${leadDetails.account_id}`;

          await sendLeadAssignedEmail({
            vendor_id: leadDetails.vendor_id,
            toEmail: assigneeEmail,
            toName: salesExecutiveUser.user_name,
            leadCode,
            leadName: leadName || "—",
            contact: contactDetails || "—",
            furnitureType,
            furnitureStructure,
            createdDate,
            createdBy: createdByName,
            leadUrl,
          });
        }
      }
    } catch (emailError: any) {
      logger.warn("⚠️ Failed to send lead assignment email", {
        error: emailError?.message,
        lead_id: lead.id,
        assign_to: payload.assign_to,
      });
    }

    return result;
  } catch (error: any) {
    console.error("[SERVICE] Error assigning lead:", error);
    throw error;
  }
};

export const editTaskISMService = async (payload: EditTaskISMInput) => {
  const { error, value } = editTaskISMSchema.validate(payload);
  if (error) {
    throw new Error(
      `Validation failed: ${error.details.map((d) => d.message).join(", ")}`,
    );
  }

  const {
    lead_id,
    task_id,
    task_type,
    due_date,
    remark,
    assignee_user_id,
    updated_by,
    status,
    closed_at,
    closed_by,
  } = value;

  return prisma.$transaction(async (tx) => {
    // 1️⃣ Validate task existence
    const task = await tx.userLeadTask.findFirst({
      where: { id: task_id, lead_id },
      include: {
        lead: {
          select: {
            vendor_id: true,
            account_id: true,
          },
        },
      },
    });

    if (!task) throw new Error(`Task ${task_id} not found for lead ${lead_id}`);

    const vendor_id = task.lead.vendor_id;
    const account_id = task.lead.account_id;

    const updateData: any = {
      updated_by,
      updated_at: new Date(),
    };

    if (task_type !== undefined) updateData.task_type = task_type;
    if (due_date !== undefined) updateData.due_date = new Date(due_date);
    if (remark !== undefined) updateData.remark = remark;
    if (status !== undefined) updateData.status = status;
    if (closed_at !== undefined) updateData.closed_at = new Date(closed_at);

    // 2️⃣ Validate assignee (if changed)
    if (assignee_user_id !== undefined) {
      const assignee = await tx.userMaster.findUnique({
        where: { id: assignee_user_id },
        select: { vendor_id: true },
      });
      if (!assignee || assignee.vendor_id !== vendor_id) {
        throw new Error(
          `Assignee ${assignee_user_id} does not belong to vendor ${vendor_id}`,
        );
      }

      updateData.user_id = assignee_user_id;
    }

    // 3️⃣ Validate closer (if changed)
    if (closed_by !== undefined) {
      const closer = await tx.userMaster.findUnique({
        where: { id: closed_by },
        select: { vendor_id: true },
      });

      if (!closer || closer.vendor_id !== vendor_id) {
        throw new Error(
          `Closed_by user ${closed_by} does not belong to vendor ${vendor_id}`,
        );
      }

      updateData.closed_by = closed_by;
    }

    // 4️⃣ Update the task
    const updatedTask = await tx.userLeadTask.update({
      where: { id: task_id },
      data: updateData,
    });

    await createTaskHistoryLog({
      db: tx,
      task: updatedTask,
      createdBy: updated_by,
      actionType: "UPDATE",
    });

    // 🧹 Invalidate Dashboard Task Cache (Sales Executive Dashboard)
    const oldUserId = task.user_id; // user before update
    const newUserId = updatedTask.user_id; // user after update

    // Old user dashboard refresh
    await cache.del(`dashboard:tasks:${vendor_id}:${oldUserId}`);

    // New user dashboard refresh (only if reassigned)
    if (newUserId !== oldUserId) {
      await cache.del(`dashboard:tasks:${vendor_id}:${newUserId}`);
    }

    // Updater dashboard refresh
    await cache.del(`dashboard:tasks:${vendor_id}:${updated_by}`);

    // If closed_by exists → refresh closer dashboard too
    if (closed_by) {
      await cache.del(`dashboard:tasks:${vendor_id}:${closed_by}`);
    }
    // If status completed but closed_by was auto-set by system
    if (status === "completed" && !closed_by && updatedTask.closed_by) {
      await cache.del(`dashboard:tasks:${vendor_id}:${updatedTask.closed_by}`);
    }

    const taskLabel =
      task.task_type === "Follow Up" ? "Follow Up" : `${task.task_type} task`;

    // 5️⃣ Prepare LeadDetailedLogs entry
    let actionMessage = "";

    // Case 1️⃣ - Reschedule (new due_date + remark)
    if (due_date && remark) {
      const formattedDate = new Date(due_date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      actionMessage = `Lead's ${taskLabel} has been rescheduled on ${formattedDate}.`;
    }

    // Case 2️⃣ - Completed
    if (status === "completed") {
      actionMessage = `Lead's ${taskLabel} has been marked as Completed.`;
    }

    // Case 3️⃣ - Cancelled
    if (status === "cancelled") {
      actionMessage = `Lead's ${taskLabel} has been marked as Cancelled.`;
    }

    // ✅ Append remark if present
    if (remark && remark.trim() !== "") {
      actionMessage += ` — Remark: ${remark.trim()}`;
    }

    // 6️⃣ Insert into LeadDetailedLogs (if applicable)
    if (actionMessage) {
      await createLeadLog(tx, {
        vendor_id,
        lead_id,
        account_id: account_id!,
        action: actionMessage,
        action_type: "UPDATE",
        created_by: updated_by,
        created_at: new Date(),
      });

      logger.info("✅ LeadDetailedLogs entry created for task update", {
        lead_id,
        task_id,
        actionMessage,
      });
    }

    logger.info("[SERVICE] editTaskISM completed", {
      task_id,
      lead_id,
      updated_by,
    });

    return updatedTask;
  });
};

export const verifyUserTokenService = async (token: string) => {
  const vendorToken = await prisma.vendorTokens.findUnique({
    where: { token },
    include: {
      vendor: {
        select: {
          // id: true,
          vendor_name: true,
          primary_contact_name: true,
          primary_contact_number: true,
          primary_contact_email: true,
        },
      },
    },
  });

  if (!vendorToken) {
    throw new Error("Invalid token");
  }

  if (new Date(vendorToken.expiry_date) < new Date()) {
    throw new Error("Token expired");
  }

  return vendorToken.vendor;
};

export const getLeadLogsWithDocuments = async (params: {
  lead_id: number;
  vendor_id: number;
  limit?: number;
  cursor?: number;
  history_type?: "Lead" | "Task" | "FollowUp" | "Approval";
  search?: string;
  user_type_id?: number;
}) => {
  const {
    lead_id,
    vendor_id,
    limit = 10,
    cursor,
    history_type,
    search,
    user_type_id,
  } = params;

  const normalizeUserType = (value?: string | null) =>
    value?.trim().toLowerCase() ?? null;

  const resolvedUserType =
    user_type_id != null
      ? await prisma.userTypeMaster.findFirst({
        where: { id: user_type_id },
        select: { user_type: true },
      })
      : null;

  const role = normalizeUserType(resolvedUserType?.user_type);
  const isFullAccessRole = role === "super-admin" || role === "custom";
  const isTaskAndFollowUpOnlyRole =
    role === "admin" ||
    role === "sales-executive" ||
    role === "site-supervisor" ||
    role === "head-site-supervisor" ||
    role === "tech-check" ||
    role === "backend" ||
    role === "factory" ||
    role === "pre-prod";

  const allowedHistoryTypes = isFullAccessRole
    ? null
    : isTaskAndFollowUpOnlyRole
      ? ["Task", "FollowUp", "Approval"]
      : null;

  const restrictedTaskStageTags =
    role === "backend"
      ? ["Type 10"]
      : role === "admin" ||
        role === "sales-executive" ||
        role === "site-supervisor" ||
        role === "head-site-supervisor" ||
        role === "tech-check"
        ? ["Type 9", "Type 10"]
        : [];

  if (
    allowedHistoryTypes &&
    history_type &&
    !allowedHistoryTypes.includes(history_type)
  ) {
    return {
      data: [],
      meta: {
        hasMore: false,
        nextCursor: null,
        count: 0,
      },
    };
  }

  const where: any = {
    lead_id,
    vendor_id,
    ...(allowedHistoryTypes
      ? {
        history_type: history_type
          ? history_type
          : { in: allowedHistoryTypes },
      }
      : history_type
        ? { history_type }
        : {}),
    ...(search && {
      action: { contains: search, mode: "insensitive" },
    }),
  };

  if (restrictedTaskStageTags.length > 0) {
    const taskStageVisibilityWhere = {
      OR: [
        { stage_id: null },
        {
          stage: {
            is: {
              tag: {
                notIn: restrictedTaskStageTags,
              },
            },
          },
        },
      ],
    };

    if (history_type === "Task") {
      where.AND = [...(where.AND ?? []), taskStageVisibilityWhere];
    } else if (!history_type) {
      where.AND = [
        ...(where.AND ?? []),
        {
          OR: [
            { history_type: { not: "Task" } },
            {
              AND: [{ history_type: "Task" }, taskStageVisibilityWhere],
            },
          ],
        },
      ];
    }
  }

  const logs = await prisma.leadDetailedLogs.findMany({
    where,
    include: {
      stage: {
        select: {
          id: true,
          type: true,
        },
      },
      user: {
        select: {
          id: true,
          user_name: true,
          user_email: true,
          user_type: {
            select: { user_type: true },
          },
        },
      },
      docLogs: {
        include: {
          doc: {
            select: {
              id: true,
              doc_sys_name: true,
              doc_og_name: true,
            },
          },
        },
      },
    },
    orderBy: { id: "desc" }, // stable chronological order
    take: limit + 1, // fetch one extra record to check "hasNextPage"
    ...(cursor && { cursor: { id: cursor }, skip: 1 }), // skip cursor itself
  });

  const hasMore = logs.length > limit;
  const data = hasMore ? logs.slice(0, limit) : logs;

  // Generate signed URLs efficiently in parallel
  const formattedLogs = await Promise.all(
    data.map(async (log) => {
      const docs = await Promise.all(
        log.docLogs.map(async (docLog) => {
          const doc = docLog.doc;
          const signedUrl = await generateSignedUrl(
            doc.doc_sys_name,
            3600,
            "inline",
          );
          return {
            id: doc.id,
            original_name: doc.doc_og_name,
            signedUrl,
          };
        }),
      );

      return {
        id: log.id,
        task_id: log.task_id,
        action: log.action,
        action_type: log.action_type,
        stage: log.stage
          ? {
            id: log.stage.id,
            name: log.stage.type,
          }
          : null,
        created_at: log.created_at,
        created_by: {
          id: log.user.id,
          name: log.user.user_name,
          email: log.user.user_email,
          role: log.user.user_type?.user_type ?? null,
        },
        docs,
      };
    }),
  );

  return {
    data: formattedLogs,
    meta: {
      hasMore,
      nextCursor: hasMore ? data[data.length - 1].id : null,
      count: formattedLogs.length,
    },
  };
};

export const checkSiteSupervisorAssigned = async (
  vendorId: number,
  leadId: number,
): Promise<{ isSiteSupervisorAssigned: boolean }> => {
  const mapping = await prisma.leadUserMapping.findFirst({
    where: {
      vendor_id: vendorId,
      lead_id: leadId,
      type: "site-supervisor",
      status: "active",
    },
  });
  return { isSiteSupervisorAssigned: !!mapping };
};

export const getClientRequiredCompletionDate = async (
  vendorId: number,
  leadId: number,
): Promise<Date | null> => {
  const lead = await prisma.leadMaster.findFirst({
    where: {
      id: leadId,
      vendor_id: vendorId,
      is_deleted: false,
    },
    select: {
      client_required_order_login_complition_date: true,
    },
  });

  return lead?.client_required_order_login_complition_date || null;
};

export const updateLeadStageService = async (
  leadId: number,
  vendorId: number,
  accountId: number,
  stageTag: string, // e.g. "Type 1", "Measurement", etc.
  userId: number,
  actionMessage: string = "Lead stage updated",
) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const existingLead = await tx.leadMaster.findFirst({
        where: { id: leadId, vendor_id: vendorId, is_deleted: false },
      });

      if (!existingLead) {
        throw new Error("Lead not found or access denied");
      }

      // Find the status ID for the given tag
      const statusType = await tx.statusTypeMaster.findFirst({
        where: { tag: stageTag, vendor_id: vendorId },
      });

      if (!statusType) {
        throw new Error(`Stage with tag '${stageTag}' not found for this vendor`);
      }

      const newStatusId = statusType.id;

      // Update lead stage (status_id)
      const updatedLead = await tx.leadMaster.update({
        where: { id: leadId },
        data: {
          status_id: newStatusId,
          updated_by: userId,
        },
      });

      // Create history log
      await createLeadLog(tx, {
        vendor_id: vendorId,
        lead_id: leadId,
        account_id: existingLead.account_id!,
        action: actionMessage,
        action_type: "STATUS_CHANGE",
        created_by: userId,
        created_at: new Date(),
        stage_id: newStatusId, // Explicity set the stage_id for the log
      });

      return updatedLead;
    });

    return { success: true, data: result };
  } catch (error: any) {
    logger.error("Error in updateLeadStageService", { error: error.message });
    throw new Error(error.message || "Failed to update lead stage");
  }
};

