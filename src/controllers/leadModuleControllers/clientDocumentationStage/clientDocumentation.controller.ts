import { Request, Response } from "express";
import {
  ClientDocumentationDto,
  ClientDocumentationService,
  CustomMulterFile,
} from "../../../services/leadModuleServices/clientDocumentationStage/clientDocumentation.service";
import { uploadToWasabClientDocumentationFile } from "../../../utils/wasabiClient";
import { sanitizeFilename } from "../../../utils/sanitizeFilename";
import fs from "node:fs/promises";
import { prisma } from "../../../prisma/client";
import { resolveClientBaseUrl } from "../../../utils/fileUtils";

const clientDocumentationService = new ClientDocumentationService();

const getParam = (param: string | string[] | undefined): string | undefined =>
  Array.isArray(param) ? param[0] : param;

type ResolvedInstance = {
  id: number;
  title: string;
};

type ClientDocUploadContext = {
  vendorId: number;
  leadId: number;
  isCustomVendorFlow: boolean;
  resolvedInstance: ResolvedInstance | null;
  clientNameSegment: string;
  fallbackFurnitureSegment: string;
};

type ClientDocCategory = "Document" | "Design";

export class ClientDocumentationController {
  private static async resolveProductStructureInstance(
    leadId: number,
    vendorId: number,
    requestedInstanceId?: number
  ) {
    const instances = await prisma.leadProductStructureInstance.findMany({
      where: { lead_id: leadId, vendor_id: vendorId },
      select: { id: true, title: true },
      orderBy: [{ product_structure_id: "asc" }, { quantity_index: "asc" }],
    });

    if (instances.length > 1) {
      if (!requestedInstanceId) {
        throw new Error(
          "product_structure_instance_id is required when lead has multiple product structure instances"
        );
      }
      const selected = instances.find((item) => item.id === requestedInstanceId);
      if (!selected) {
        throw new Error("Invalid product_structure_instance_id for this lead");
      }
      return selected;
    }

    if (instances.length === 1) {
      if (requestedInstanceId && instances[0].id !== requestedInstanceId) {
        throw new Error("Invalid product_structure_instance_id for this lead");
      }
      return instances[0];
    }

    if (requestedInstanceId) {
      throw new Error(
        "product_structure_instance_id provided but no product structure instance exists for this lead"
      );
    }

    return null;
  }

  private static formatDateSegment(date: Date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  }

  private static sanitizeSegment(value: string, fallback: string) {
    const normalized = sanitizeFilename((value || "").trim().replace(/\s+/g, "-"))
      .replace(/_+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");

    return normalized || fallback;
  }

  private static extractClientDocRevision(fileName: string) {
    const parsedName = fileName.replace(/\.[^/.]+$/, "");
    const match = parsedName.match(/^CD(\d+)-(Document|Design)-/i);
    return match ? Number(match[1]) : null;
  }

  private static async buildUploadContext(
    leadId: number,
    vendorId: number,
    resolvedInstance: ResolvedInstance | null,
  ): Promise<ClientDocUploadContext> {
    const [vendor, lead, allInstances] = await Promise.all([
      prisma.vendorMaster.findUnique({
        where: { id: vendorId },
        select: { is_this_vendor_is_custom_usertype_only: true },
      }),
      prisma.leadMaster.findFirst({
        where: { id: leadId, vendor_id: vendorId, is_deleted: false },
        select: { firstname: true, lastname: true },
      }),
      prisma.leadProductStructureInstance.findMany({
        where: { lead_id: leadId, vendor_id: vendorId },
        select: {
          id: true,
          title: true,
          productType: { select: { type: true } },
        },
        orderBy: [
          { product_structure_id: "asc" },
          { quantity_index: "asc" },
        ],
      }),
    ]);

    if (!lead) {
      throw new Error("Lead not found for client documentation upload");
    }

    const firstFurnitureType =
      allInstances.find((instance) => instance.productType?.type)?.productType?.type ??
      "Furniture";

    return {
      vendorId,
      leadId,
      isCustomVendorFlow:
        vendor?.is_this_vendor_is_custom_usertype_only === true,
      resolvedInstance,
      clientNameSegment: ClientDocumentationController.sanitizeSegment(
        `${lead.firstname ?? ""} ${lead.lastname ?? ""}`,
        "Client",
      ),
      fallbackFurnitureSegment:
        ClientDocumentationController.sanitizeSegment(
          firstFurnitureType,
          "Furniture",
        ),
    };
  }

  private static async getNextClientDocumentationRevision(
    context: ClientDocUploadContext,
    tag: "Type 11" | "Type 12",
  ) {
    const existingDocs = await prisma.leadDocuments.findMany({
      where: {
        lead_id: context.leadId,
        vendor_id: context.vendorId,
        is_deleted: false,
        documentType: { tag },
        product_structure_instance_id: context.resolvedInstance?.id ?? null,
      },
      select: { doc_og_name: true },
    });

    const parsedRevisions = existingDocs
      .map((doc) =>
        ClientDocumentationController.extractClientDocRevision(doc.doc_og_name),
      )
      .filter((revision): revision is number => revision !== null);

    const nextRevision =
      parsedRevisions.length > 0
        ? Math.max(...parsedRevisions) + 1
        : existingDocs.length;

    return nextRevision;
  }

  private static buildClientDocumentationName(
    context: ClientDocUploadContext,
    tag: "Type 11" | "Type 12",
    originalName: string,
    revision: number,
  ) {
    if (!context.isCustomVendorFlow) {
      return originalName;
    }

    const category: ClientDocCategory = tag === "Type 11" ? "Document" : "Design";
    const extension = (originalName.match(/\.[^/.]+$/)?.[0] || "").toLowerCase();
    const structureSegment = context.resolvedInstance?.title
      ? ClientDocumentationController.sanitizeSegment(
          context.resolvedInstance.title,
          context.fallbackFurnitureSegment,
        )
      : context.fallbackFurnitureSegment;

    return [
      `CD${revision}`,
      category,
      context.clientNameSegment,
      structureSegment,
      ClientDocumentationController.formatDateSegment(new Date()),
    ].join("-") + extension;
  }

  public static async create(req: Request, res: Response): Promise<void> {
    try {
      const {
        lead_id,
        account_id,
        vendor_id,
        created_by,
        product_structure_instance_id,
      } = req.body;
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      if (!lead_id || !account_id || !vendor_id || !created_by) {
        res
          .status(400)
          .json({ success: false, message: "Missing required fields" });
        return;
      }

      const pptFiles = files?.client_documentations_ppt || [];
      const pythaFiles = files?.client_documentations_pytha || [];

      if (pptFiles.length === 0 && pythaFiles.length === 0) {
        res.status(400).json({
          success: false,
          message: "At least one PPT or Pytha file is required",
        });
        return;
      }

      const parsedLeadId = parseInt(lead_id);
      const parsedVendorId = parseInt(vendor_id);
      const parsedProductStructureInstanceId = product_structure_instance_id
        ? Number(product_structure_instance_id)
        : undefined;

      if (
        parsedProductStructureInstanceId !== undefined &&
        Number.isNaN(parsedProductStructureInstanceId)
      ) {
        res.status(400).json({
          success: false,
          message: "Invalid product_structure_instance_id",
        });
        return;
      }

      let resolvedInstance: { id: number; title: string } | null = null;
      try {
        resolvedInstance = await ClientDocumentationController.resolveProductStructureInstance(
          parsedLeadId,
          parsedVendorId,
          parsedProductStructureInstanceId
        );
      } catch (instanceError: any) {
        res.status(400).json({
          success: false,
          message: instanceError?.message || "Invalid product structure instance",
        });
        return;
      }

      const uploadContext =
        await ClientDocumentationController.buildUploadContext(
          parsedLeadId,
          parsedVendorId,
          resolvedInstance,
        );

      const instanceFolder = resolvedInstance?.title
        ? sanitizeFilename(resolvedInstance.title.trim().replace(/\s+/g, "_"))
        : undefined;

      const uploadTaggedFiles = async (
        docs: Express.Multer.File[],
        tag: "Type 11" | "Type 12",
      ): Promise<CustomMulterFile[]> => {
        const folder =
          tag === "Type 11"
            ? "client_documentations/client_documentations_ppt"
            : "client_documentations/client_documentations_pytha";

        const uploaded: CustomMulterFile[] = [];
        let nextRevision =
          await ClientDocumentationController.getNextClientDocumentationRevision(
            uploadContext,
            tag,
          );

        for (const doc of docs) {
          const finalOriginalName =
            ClientDocumentationController.buildClientDocumentationName(
              uploadContext,
              tag,
              doc.originalname,
              nextRevision,
            );
          nextRevision += 1;
          const sysName = await uploadToWasabClientDocumentationFile(
            doc.path,
            Number(vendor_id),
            Number(lead_id),
            finalOriginalName,
            doc.mimetype,
            instanceFolder
          );

          await fs.unlink(doc.path);

          uploaded.push({
            originalName: finalOriginalName,
            sysName,
            docTypeTag: tag,
            productStructureInstanceId: resolvedInstance?.id,
          });
        }

        return uploaded;
      };

      const documents: CustomMulterFile[] = [
        ...(await uploadTaggedFiles(pptFiles, "Type 11")),
        ...(await uploadTaggedFiles(pythaFiles, "Type 12")),
      ];

      const dto: ClientDocumentationDto = {
        lead_id: parsedLeadId,
        account_id: parseInt(account_id),
        vendor_id: parsedVendorId,
        created_by: parseInt(created_by),
        product_structure_instance_id: resolvedInstance?.id,
        documents,
        baseUrl: resolveClientBaseUrl(req),
      };

      const result =
        await clientDocumentationService.createClientDocumentationStage(dto);
      res.status(201).json({
        success: true,
        message: "Client documentation stage completed",
        data: result,
      });
    } catch (error: any) {
      console.error("[ClientDocumentationController] Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  public static async canMoveToOrderLoginController(
    req: Request,
    res: Response,
  ) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const result =
        await clientDocumentationService.canMoveToOrderLoginButtonEnabled(
          vendorId,
          leadId,
        );

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error("Order Login Eligibility Error:", error);

      return res.status(500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  }

  public static async addMoreDocuments(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const {
        lead_id,
        account_id,
        vendor_id,
        created_by,
        product_structure_instance_id,
      } = req.body;
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      const pptFiles = files?.client_documentations_ppt || [];
      const pythaFiles = files?.client_documentations_pytha || [];

      console.info("[ClientDocumentation:addMoreDocuments] Incoming request", {
        lead_id,
        account_id,
        vendor_id,
        created_by,
        product_structure_instance_id,
        pptCount: pptFiles.length,
        pythaCount: pythaFiles.length,
        pptNames: pptFiles.map((f) => f.originalname),
        pythaNames: pythaFiles.map((f) => f.originalname),
      });

      if (!lead_id || !account_id || !vendor_id || !created_by) {
        res
          .status(400)
          .json({ success: false, message: "Missing required fields" });
        return;
      }

      if (pptFiles.length === 0 && pythaFiles.length === 0) {
        res.status(400).json({
          success: false,
          message: "At least one PPT or Pytha file is required",
        });
        return;
      }

      const parsedLeadId = parseInt(lead_id);
      const parsedVendorId = parseInt(vendor_id);
      const parsedProductStructureInstanceId = product_structure_instance_id
        ? Number(product_structure_instance_id)
        : undefined;

      if (
        parsedProductStructureInstanceId !== undefined &&
        Number.isNaN(parsedProductStructureInstanceId)
      ) {
        res.status(400).json({
          success: false,
          message: "Invalid product_structure_instance_id",
        });
        return;
      }

      let resolvedInstance: { id: number; title: string } | null = null;
      try {
        resolvedInstance = await ClientDocumentationController.resolveProductStructureInstance(
          parsedLeadId,
          parsedVendorId,
          parsedProductStructureInstanceId
        );
      } catch (instanceError: any) {
        res.status(400).json({
          success: false,
          message: instanceError?.message || "Invalid product structure instance",
        });
        return;
      }

      const uploadContext =
        await ClientDocumentationController.buildUploadContext(
          parsedLeadId,
          parsedVendorId,
          resolvedInstance,
        );

      const instanceFolder = resolvedInstance?.title
        ? sanitizeFilename(resolvedInstance.title.trim().replace(/\s+/g, "_"))
        : undefined;

      const uploadTaggedFiles = async (
        docs: Express.Multer.File[],
        tag: "Type 11" | "Type 12",
      ): Promise<CustomMulterFile[]> => {
        const folder =
          tag === "Type 11"
            ? "client_documentations/client_documentations_ppt"
            : "client_documentations/client_documentations_pytha";

        const uploaded: CustomMulterFile[] = [];
        let nextRevision =
          await ClientDocumentationController.getNextClientDocumentationRevision(
            uploadContext,
            tag,
          );

        for (const doc of docs) {
          const finalOriginalName =
            ClientDocumentationController.buildClientDocumentationName(
              uploadContext,
              tag,
              doc.originalname,
              nextRevision,
            );
          nextRevision += 1;
          const sysName = await uploadToWasabClientDocumentationFile(
            doc.path,
            Number(vendor_id),
            Number(lead_id),
            finalOriginalName,
            doc.mimetype,
            instanceFolder
          );

          await fs.unlink(doc.path);

          uploaded.push({
            originalName: finalOriginalName,
            sysName,
            docTypeTag: tag,
            productStructureInstanceId: resolvedInstance?.id,
          });
        }

        return uploaded;
      };

      const documents: CustomMulterFile[] = [
        ...(await uploadTaggedFiles(pptFiles, "Type 11")),
        ...(await uploadTaggedFiles(pythaFiles, "Type 12")),
      ];

      console.info("[ClientDocumentation:addMoreDocuments] Uploaded docs", {
        lead_id: parsedLeadId,
        vendor_id: parsedVendorId,
        resolvedInstanceId: resolvedInstance?.id ?? null,
        uploadedCount: documents.length,
        uploadedNames: documents.map((d) => d.originalName),
      });

      const dto: ClientDocumentationDto = {
        lead_id: parsedLeadId,
        account_id: parseInt(account_id),
        vendor_id: parsedVendorId,
        created_by: parseInt(created_by),
        product_structure_instance_id: resolvedInstance?.id,
        documents,
        baseUrl: resolveClientBaseUrl(req),
      };


      const result =
        await clientDocumentationService.addMoreClientDocumentation(dto);

      res.status(201).json({
        success: true,
        message: "Additional client documentation uploaded successfully",
        data: result,
      });
    } catch (error: any) {
      console.error("[ClientDocumentationController] Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  public static getAllClientDocumentations = async (
    req: Request,
    res: Response,
  ) => {
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
        await clientDocumentationService.getLeadsWithStatusClientDocumentation(
          vendorId,
          userId,
        );

      return res.status(200).json({
        success: true,
        message: "Client Documentation leads fetched successfully",
        count: leads.length,
        data: leads,
      });
    } catch (error: any) {
      console.error(
        "[ClientDocumentationController] getAllClientDocumentations Error:",
        error,
      );
      return res.status(500).json({
        success: false,
        message: error.message || "Something went wrong",
      });
    }
  };

  public static async get(req: Request, res: Response): Promise<void> {
    try {
      const vendorId = Number(getParam(req.params.vendorId));
      const leadId = Number(getParam(req.params.leadId));
      const userId = Number(req.query.userId);
      const instanceId = req.query.instanceId ? parseInt(req.query.instanceId as string) : undefined


      if (!vendorId || !leadId || !userId) {
        res.status(400).json({
          success: false,
          message: "vendorId, leadId and userId are required",
        });
        return;
      }

      const baseUrl = resolveClientBaseUrl(req);

      const data = await clientDocumentationService.getClientDocumentation(
        vendorId,
        leadId,
        userId,
        baseUrl,
        instanceId,
      );

      console.info("[ClientDocumentation:get] Response summary", {
        leadId,
        vendorId,
        userId,
        instanceCount: data?.instance_count,
        instanceGroups: data?.documents_by_instance?.length,
        pptCount: data?.documents?.ppt?.length,
        pythaCount: data?.documents?.pytha?.length,
      });

      res.status(200).json({
        success: true,
        message: "Client documentation fetched successfully",
        data,
      });
    } catch (error: any) {
      console.error("[ClientDocumentationController:get]", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  public static moveToClientApproval = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const { lead_id, vendor_id, updated_by } = req.body;
      if (!lead_id || !vendor_id || !updated_by) {
        res.status(400).json({
          success: false,
          message: "lead_id, vendor_id and updated_by are required",
        });
        return;
      }

      const baseUrl = resolveClientBaseUrl(req);
      const result = await clientDocumentationService.moveToClientApproval({
        lead_id: Number(lead_id),
        vendor_id: Number(vendor_id),
        updated_by: Number(updated_by),
        baseUrl,
      });

      res.status(200).json({
        success: true,
        message: "Lead moved to Client Approval",
        data: result,
      });
    } catch (error: any) {
      console.error("[ClientDocumentationController] moveToClientApproval:", error);
      res.status(400).json({
        success: false,
        message: error?.message || "Failed to move lead to Client Approval",
      });
    }
  };
}
