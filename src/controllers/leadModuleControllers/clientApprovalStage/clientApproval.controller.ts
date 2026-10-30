import { Request, Response } from "express";
import { ClientApprovalService } from "../../../services/leadModuleServices/clientApprovalStage/clientApproval.service";
import { ApiResponse } from "../../../utils/apiResponse";
import { uploadToWasabClientApprovalDocumentationFile } from "../../../utils/wasabiClient";
import { sanitizeFilename } from "../../../utils/fileUtils";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../../prisma/client";
import { NotificationService } from "../../../services/notification/notification.service";
import { getFranchiseAdminRecipients } from "../../../services/notification/adminRecipients.service";
import { NotificationType } from "../../../prisma/generated";
import {
  sendLeadAssignedEmail,
  sendMajorMilestoneEmail,
} from "../../../services/email/brevoEmail.service";
import { STAGE_PATH_BY_TAG } from "../../../services/leadModuleServices/leadsGeneration/leadActivityStatus.service";
import logger from "../../../utils/logger";
import { sendTechCheckAssignedEmail } from "../../../../src/services/email/brevoEmail2.service";

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

const clientApprovalService = new ClientApprovalService();

/**
 * Client approval file names. Custom-usertype vendors get
 * <CAS|CPD>-<nn>-<ClientName>-<Structure>-<Date>.<ext>, numbered across the
 * lead's files of that prefix; other vendors keep the original name.
 */
const buildClientApprovalDocNames = async (
  vendorId: number,
  leadId: number,
  productTypeId: number | undefined,
  prefix: "CAS" | "CPD",
  files: Express.Multer.File[],
): Promise<string[]> => {
  const originalNames = files.map((file) => file.originalname);
  if (files.length === 0) return originalNames;

  const vendor = await prisma.vendorMaster.findUnique({
    where: { id: vendorId },
    select: { is_this_vendor_is_custom_usertype_only: true },
  });
  if (vendor?.is_this_vendor_is_custom_usertype_only !== true) return originalNames;

  const lead = await prisma.leadMaster.findFirst({
    where: { id: leadId, vendor_id: vendorId },
    select: { firstname: true, lastname: true },
  });
  const clientNameSegment = sanitizeFilename(
    `${lead?.firstname ?? ""}${lead?.lastname ?? ""}` || "Client",
  )
    .replace(/_+/g, "_")
    .slice(0, 50);

  const leadInstances = await prisma.leadProductStructureInstance.findMany({
    where: {
      lead_id: leadId,
      vendor_id: vendorId,
      ...(productTypeId ? { product_type_id: productTypeId } : {}),
    },
    select: { productType: { select: { type: true } } },
  });
  const uniqueStructureNames = [
    ...new Set(
      leadInstances
        .map((instance) => instance.productType?.type)
        .filter(Boolean),
    ),
  ];
  const structureSegment = sanitizeFilename(
    uniqueStructureNames.length > 0
      ? uniqueStructureNames.join("_")
      : "General",
  )
    .replace(/_+/g, "_")
    .slice(0, 80);

  const now = new Date();
  const dateSegment = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");

  const existingDocs = await prisma.leadDocuments.findMany({
    where: {
      vendor_id: vendorId,
      lead_id: leadId,
      doc_og_name: { startsWith: `${prefix}-` },
      is_deleted: false,
    },
    select: { doc_og_name: true },
  });
  let nextRevision =
    existingDocs.reduce((maxRevision, doc) => {
      const match = doc.doc_og_name?.match(new RegExp(`^${prefix}-(\\d+)-`, "i"));
      return match ? Math.max(maxRevision, Number(match[1])) : maxRevision;
    }, -1) + 1;

  return files.map((file) => {
    const extension = path.extname(file.originalname || "");
    const revision = String(nextRevision++).padStart(2, "0");
    return `${prefix}-${revision}-${clientNameSegment}-${structureSegment}-${dateSegment}${extension}`;
  });
};

export class ClientApprovalController {
  public static async addApprovalDocuments(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const {
        lead_id,
        vendor_id,
        account_id,
        created_by,
        product_type_id,
      } = req.body;

      if (!lead_id || !vendor_id || !account_id || !created_by) {
        res
          .status(400)
          .json({ success: false, message: "Missing required fields" });
        return;
      }

      const documents = (req.files as any)?.documents || [];

      if (!documents || documents.length === 0) {
        res.status(400).json({
          success: false,
          message: "At least one screenshot is required",
        });
        return;
      }

      const uploadedDocs: { originalName: string; sysName: string }[] = [];
      const documentNames = await buildClientApprovalDocNames(
        Number(vendor_id),
        Number(lead_id),
        product_type_id ? Number(product_type_id) : undefined,
        "CAS",
        documents,
      );

      for (const [index, doc] of documents.entries()) {
        const sysName = await uploadToWasabClientApprovalDocumentationFile(
          doc.path,
          Number(vendor_id),
          Number(lead_id),
          documentNames[index],
          doc.mimetype,
        );

        await fs.unlink(doc.path);

        uploadedDocs.push({
          originalName: documentNames[index],
          sysName,
        });
      }

      const result = await clientApprovalService.addApprovalDocuments({
        lead_id: Number(lead_id),
        vendor_id: Number(vendor_id),
        account_id: Number(account_id),
        created_by: Number(created_by),
        product_type_id: product_type_id ? Number(product_type_id) : undefined,
        documents: uploadedDocs,
      });

      res.status(201).json({
        success: true,
        message: "Client approval screenshots uploaded successfully",
        data: result,
      });
    } catch (error: any) {
      console.error(
        "[ClientApprovalController] addApprovalDocuments Error:",
        error,
      );
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  public static async submitApproval(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const { leadId, vendorId } = req.params;
      const {
        account_id,
        client_id,
        created_by,
        advance_payment_date,
        amount_paid,
        payment_text,
        product_type_id,
      } = req.body;

      const approvalScreenshots = (req.files as any)?.approvalScreenshots || [];
      const payment_files = (req.files as any)?.payment_files || [];

      if (!leadId || !vendorId || !account_id || !created_by) {
        res
          .status(400)
          .json({ success: false, message: "Missing required fields" });
        return;
      }

      if (!approvalScreenshots || approvalScreenshots.length === 0) {
        res.status(400).json({
          success: false,
          message: "Client approval screenshot is mandatory",
        });
        return;
      }

      const uploadedApprovalScreenshots: {
        originalName: string;
        sysName: string;
      }[] = [];

      const screenshotNames = await buildClientApprovalDocNames(
        Number(vendorId),
        Number(leadId),
        product_type_id ? Number(product_type_id) : undefined,
        "CAS",
        approvalScreenshots,
      );

      for (const [index, doc] of approvalScreenshots.entries()) {
        const sysName = await uploadToWasabClientApprovalDocumentationFile(
          doc.path,
          Number(vendorId),
          Number(leadId),
          screenshotNames[index],
          doc.mimetype,
        );

        await fs.unlink(doc.path);

        uploadedApprovalScreenshots.push({
          originalName: screenshotNames[index],
          sysName,
        });
      }

      const uploadedPaymentFiles: {
        originalName: string;
        sysName: string;
      }[] = [];

      if (payment_files && payment_files.length > 0) {
        const paymentFileNames = await buildClientApprovalDocNames(
          Number(vendorId),
          Number(leadId),
          product_type_id ? Number(product_type_id) : undefined,
          "CPD",
          payment_files,
        );

        for (const [index, doc] of payment_files.entries()) {
          const sysName = await uploadToWasabClientApprovalDocumentationFile(
            doc.path,
            Number(vendorId),
            Number(leadId),
            paymentFileNames[index],
            doc.mimetype,
          );

          await fs.unlink(doc.path);

          uploadedPaymentFiles.push({
            originalName: paymentFileNames[index],
            sysName,
          });
        }
      }

      const dto = {
        lead_id: Number(leadId),
        vendor_id: Number(vendorId),
        account_id: parseInt(account_id),
        client_id: parseInt(client_id),
        created_by: parseInt(created_by),
        approvalScreenshots: uploadedApprovalScreenshots,
        advance_payment_date,
        amount_paid: parseFloat(amount_paid),
        payment_text,
        payment_files: uploadedPaymentFiles,
        product_type_id: product_type_id ? Number(product_type_id) : undefined,
      };

      const result = await clientApprovalService.submitClientApproval(dto);

      res.status(201).json({
        success: true,
        message: "Client approval stage submitted successfully",
        data: result,
      });
    } catch (error: any) {
      console.error("[ClientApprovalController] Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  /**
   * Fetch all Backend Users for a specific vendor
   */
  public static async fetchBackendUsersByVendor(
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
        `[CONTROLLER] Fetching Backend Users for vendor ID: ${vendorId}`,
      );

      const backendUsers =
        await clientApprovalService.getBackendUsersByVendor(vendorId);

      // Check if any backend users were found
      if (backendUsers.length === 0) {
        return res
          .status(200)
          .json(
            ApiResponse.success(
              [],
              "No Backend Users found for this vendor",
              200,
            ),
          );
      }

      console.log(`[CONTROLLER] Found ${backendUsers.length} Backend Users`);

      return res.status(200).json(
        ApiResponse.success(
          {
            backend_users: backendUsers,
            count: backendUsers.length,
          },
          "backend users fetched successfully",
          200,
        ),
      );
    } catch (error: any) {
      console.error("[CONTROLLER] fetchBackendUsersByVendor error:", error);

      return res
        .status(500)
        .json(
          ApiResponse.error(
            "Failed to fetch Backend Users",
            500,
            process.env.NODE_ENV === "development" ? error.message : undefined,
          ),
        );
    }
  }

  public static getAllClientApprovals = async (req: Request, res: Response) => {
    try {
      const vendorId = Number(getParam(req.params.vendorId));
      const userId = Number(getParam(req.params.userId));

      if (!vendorId || !userId) {
        return res.status(400).json({
          success: false,
          message: "Vendor ID and User ID are required",
        });
      }

      const leads =
        await clientApprovalService.getLeadsWithStatusClientApproval(
          vendorId,
          userId,
        );

      const count = leads.length;

      return res.status(200).json({
        success: true,
        message: "Client Approval leads fetched successfully",
        count,
        data: leads,
      });
    } catch (error: any) {
      console.error(
        "[ClientApprovalController] getAllClientApprovals Error:",
        error,
      );
      return res.status(500).json({
        success: false,
        message: error.message || "Something went wrong",
      });
    }
  };

  public static async getApprovalDetails(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const { leadId, vendorId } = req.params;
      const { product_type_id } = req.query;

      if (!leadId || !vendorId) {
        res.status(400).json({
          success: false,
          message: "LeadId and VendorId are required",
        });
        return;
      }

      const details = await clientApprovalService.getClientApprovalDetails(
        Number(vendorId),
        Number(leadId),
        product_type_id ? Number(product_type_id) : undefined,
      );

      res.status(200).json({
        success: true,
        message: "Client approval details fetched successfully",
        data: details,
      });
    } catch (error: any) {
      console.error(
        "[ClientApprovalController] getApprovalDetails Error:",
        error,
      );
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  public static async requestToTechCheck(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const { leadId, vendorId } = req.params;
      const { account_id, assign_to_user_id, created_by } = req.body;

      if (
        !leadId ||
        !vendorId ||
        !account_id ||
        !assign_to_user_id ||
        !created_by
      ) {
        res.status(400).json({
          success: false,
          message:
            "Missing required fields: leadId, vendorId, account_id, assign_to_user_id, created_by",
        });
        return;
      }

      const dto = {
        lead_id: Number(leadId),
        vendor_id: Number(vendorId),
        account_id: parseInt(account_id),
        assign_to_user_id: parseInt(assign_to_user_id),
        created_by: parseInt(created_by),
      };

      const result = await clientApprovalService.requestToTechCheck(dto);

      // ─── 1. In-app notification to assignee ───────────────────────────────
      try {
        const assignee = await prisma.userMaster.findUnique({
          where: { id: dto.assign_to_user_id },
          select: {
            user_name: true,
            user_email: true,
            user_type: { select: { user_type: true } },
          },
        });
        const assigneeRole = assignee?.user_type?.user_type?.toLowerCase();
        if (assigneeRole !== "admin" && assigneeRole !== "super-admin") {
          const [lead, vendor, instances] = await Promise.all([
            prisma.leadMaster.findUnique({
              where: { id: dto.lead_id },
              select: {
                firstname: true,
                lastname: true,
                lead_code: true,
                franchise_id: true,
              },
            }),
            prisma.vendorMaster.findUnique({
              where: { id: dto.vendor_id },
              select: { handlesLargeScaleProjects: true },
            }),
            prisma.leadProductStructureInstance.findMany({
              where: { lead_id: dto.lead_id, vendor_id: dto.vendor_id },
              select: { id: true, quantity_index: true },
              orderBy: [
                { product_structure_id: "asc" },
                { quantity_index: "asc" },
              ],
            }),
          ]);

          const handlesLargeScaleProjects =
            vendor?.handlesLargeScaleProjects === true;

          const leadName =
            `${lead?.firstname ?? ""} ${lead?.lastname ?? ""}`.trim();
          const baseLeadCode =
            lead?.lead_code ?? `LEAD-${String(dto.lead_id).padStart(4, "0")}`;

          // Build notification targets (single lead target for large scale projects)
          const notificationTargets =
            !handlesLargeScaleProjects && instances.length > 1
              ? instances.map((inst) => ({
                  instanceId: inst.id,
                  leadCode: `${baseLeadCode}.${inst.quantity_index}`,
                }))
              : [
                  {
                    instanceId: instances[0]?.id ?? null,
                    leadCode: baseLeadCode,
                  },
                ];

          for (const target of notificationTargets) {
            const redirectUrl =
              target.instanceId != null
                ? `/dashboard/production/tech-check/details/${dto.lead_id}?accountId=${dto.account_id}&instance_id=${target.instanceId}`
                : `/dashboard/production/tech-check/details/${dto.lead_id}?accountId=${dto.account_id}`;

            const notificationMessage =
              leadName.length > 0
                ? `You have been assigned ${target.leadCode} - ${leadName} for Tech Check Review. Please review the documents uploaded by the Sales Executive.`
                : `You have been assigned ${target.leadCode} for Tech Check Review. Please review the documents uploaded by the Sales Executive.`;

            await NotificationService.createAndSend({
              vendor_id: dto.vendor_id,
              user_id: dto.assign_to_user_id,
              sender_id: dto.created_by,
              type: NotificationType.LEAD_ASSIGNED,
              title: "Tech Check Review Required",
              message: notificationMessage,
              entity_type: "lead",
              entity_id: dto.lead_id,
              redirect_url: redirectUrl,
            });
          }
        }
      } catch (notificationError: any) {
        console.error("⚠️ Failed to send tech-check assignment notification", {
          error: notificationError?.message,
          lead_id: dto.lead_id,
          assignee_user_id: dto.assign_to_user_id,
        });
      }

      // ─── 2. Email to assignee (Tech Check) ────────────────────────────────
      try {
        if (dto.assign_to_user_id !== dto.created_by) {
          const [assignee, assignedBy, lead, vendor, instances] = await Promise.all([
            prisma.userMaster.findUnique({
              where: { id: dto.assign_to_user_id },
              select: { user_name: true, user_email: true },
            }),
            prisma.userMaster.findUnique({
              where: { id: dto.created_by },
              select: { user_name: true },
            }),
            prisma.leadMaster.findUnique({
              where: { id: dto.lead_id },
              select: {
                id: true,
                lead_code: true,
                firstname: true,
                lastname: true,
              },
            }),
            prisma.vendorMaster.findUnique({
              where: { id: dto.vendor_id },
              select: { handlesLargeScaleProjects: true },
            }),
            prisma.leadProductStructureInstance.findMany({
              where: { lead_id: dto.lead_id, vendor_id: dto.vendor_id },
              select: { id: true, quantity_index: true },
              orderBy: [
                { product_structure_id: "asc" },
                { quantity_index: "asc" },
              ],
            }),
          ]);

          const handlesLargeScaleProjects =
            vendor?.handlesLargeScaleProjects === true;

          const assigneeEmail = assignee?.user_email?.trim();
          if (!assigneeEmail) {
            logger.warn("Tech-check email skipped: missing assignee email", {
              lead_id: dto.lead_id,
              assignee_user_id: dto.assign_to_user_id,
            });
          } else if (lead) {
            const leadName =
              `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim();
            const baseLeadCode =
              lead.lead_code ?? `LEAD-${String(lead.id).padStart(4, "0")}`;
            const assignedByName = assignedBy?.user_name ?? "Admin";
            const assignedDate = new Date().toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            });
            const clientBaseUrl = resolveClientBaseUrl(req);

            const emailTargets =
              !handlesLargeScaleProjects && instances.length > 1
                ? instances.map((inst) => ({
                    instanceId: inst.id,
                    leadCode: `${baseLeadCode}.${inst.quantity_index}`,
                  }))
                : [
                    {
                      instanceId: instances[0]?.id ?? null,
                      leadCode: baseLeadCode,
                    },
                  ];

            for (const target of emailTargets) {
              const leadUrl =
                target.instanceId != null
                  ? `${clientBaseUrl}/dashboard/production/tech-check/details/${dto.lead_id}?accountId=${dto.account_id}&instance_id=${target.instanceId}`
                  : `${clientBaseUrl}/dashboard/production/tech-check/details/${dto.lead_id}?accountId=${dto.account_id}`;

              await sendTechCheckAssignedEmail({
                vendor_id: dto.vendor_id,
                toEmail: assigneeEmail,
                toName: assignee?.user_name ?? undefined,
                leadCode: target.leadCode,
                leadName: leadName || "—",
                assignedBy: assignedByName,
                assignedDate,
                leadUrl,
              });
            }
          }
        }
      } catch (emailError: any) {
        logger.warn("⚠️ Failed to send tech-check assignment email", {
          error: emailError?.message,
          lead_id: dto.lead_id,
          assignee_user_id: dto.assign_to_user_id,
        });
      }

      // ─── 3. Milestone notification + email (admins only, matching franchise) ────────
      try {
        const [lead, firstInstance] = await Promise.all([
          prisma.leadMaster.findUnique({
            where: { id: dto.lead_id },
            select: {
              firstname: true,
              lastname: true,
              lead_code: true,
              franchise_id: true,
              statusType: { select: { tag: true } },
            },
          }),
          prisma.leadProductStructureInstance.findFirst({
            where: { lead_id: dto.lead_id, vendor_id: dto.vendor_id },
            select: { id: true },
            orderBy: [
              { product_structure_id: "asc" },
              { quantity_index: "asc" },
            ],
          }),
        ]);

        const leadName =
          `${lead?.firstname ?? ""} ${lead?.lastname ?? ""}`.trim();
        const leadCode =
          lead?.lead_code ?? `LEAD-${String(dto.lead_id).padStart(4, "0")}`;
        const franchiseId = lead?.franchise_id ?? null;
        const stageTag = lead?.statusType?.tag;
        const instanceId = firstInstance?.id;

        // Build redirect URL using STAGE_PATH_BY_TAG
        const stagePath =
          stageTag && STAGE_PATH_BY_TAG[stageTag]
            ? `${STAGE_PATH_BY_TAG[stageTag]}/${dto.lead_id}`
            : `/dashboard/production/details/${dto.lead_id}`;

        const queryParams = new URLSearchParams();
        if (dto.account_id)
          queryParams.set("accountId", String(dto.account_id));
        if (instanceId) queryParams.set("instance_id", String(instanceId));
        const qs = queryParams.toString();
        const redirectUrl = qs ? `${stagePath}?${qs}` : stagePath;

        // Only admins matching vendor_id + franchise_id
        const { recipients: users, isSuperAdminFallback } =
          await getFranchiseAdminRecipients({
            vendorId: dto.vendor_id,
            franchiseId,
            excludeUserId: dto.created_by,
          });

        await Promise.all(
          users.map((user) =>
            NotificationService.createAndSend({
              vendor_id: dto.vendor_id,
              user_id: user.id,
              sender_id: dto.created_by,
              type: NotificationType.LEAD_MILESTONE,
              title: "Lead moved to Production",
              message:
                leadName.length > 0
                  ? `Lead ${leadName} moved to Production stage.`
                  : "Lead moved to Production stage.",
              entity_type: "lead",
              entity_id: dto.lead_id,
              redirect_url: redirectUrl,
            }),
          ),
        );

        const clientBaseUrl = resolveClientBaseUrl(req);
        const detailsUrl = `${clientBaseUrl}${redirectUrl}`;
        const completedOn = new Date().toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });

        await Promise.allSettled(
          users
            .filter((user) => user.user_email)
            .map((user) =>
              sendMajorMilestoneEmail({
                vendor_id: dto.vendor_id,
                allowSuperAdmin: isSuperAdminFallback,
                toEmail: user.user_email!,
                toName: user.user_name ?? undefined,
                leadCode,
                leadName: leadName || "Lead",
                milestoneName: "Project to Production",
                completedOn,
                detailsUrl,
              }),
            ),
        );
      } catch (milestoneError: any) {
        console.error("⚠️ Failed to send project-to-production notification", {
          error: milestoneError?.message,
          lead_id: dto.lead_id,
        });
      }

      res.status(200).json({
        success: true,
        message: "Lead moved to Tech Check stage successfully",
        data: result,
      });
    } catch (error: any) {
      console.error(
        "[ClientApprovalController] Error in requestToTechCheck:",
        error,
      );
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  public static async fetchTechCheckUsersByVendor(
    req: Request,
    res: Response,
  ): Promise<Response> {
    try {
      const vendorId = Number(getParam(req.params.vendorId));

      if (isNaN(vendorId) || vendorId <= 0) {
        return res
          .status(400)
          .json(ApiResponse.error("Invalid vendor ID provided", 400));
      }

      console.log(
        `[CONTROLLER] Fetching Tech-Check Users for vendor ID: ${vendorId}`,
      );

      const techCheckUsers =
        await clientApprovalService.getTechCheckUsersByVendor(vendorId);

      if (techCheckUsers.length === 0) {
        return res
          .status(200)
          .json(
            ApiResponse.success(
              [],
              "No Tech-Check Users found for this vendor",
              200,
            ),
          );
      }

      console.log(
        `[CONTROLLER] Found ${techCheckUsers.length} Tech-Check Users`,
      );

      return res.status(200).json(
        ApiResponse.success(
          {
            tech_check_users: techCheckUsers,
            count: techCheckUsers.length,
          },
          "Tech-Check users fetched successfully",
          200,
        ),
      );
    } catch (error: any) {
      console.error("[CONTROLLER] fetchTechCheckUsersByVendor error:", error);

      return res
        .status(500)
        .json(
          ApiResponse.error(
            "Failed to fetch Tech-Check Users",
            500,
            process.env.NODE_ENV === "development" ? error.message : undefined,
          ),
        );
    }
  }
}
