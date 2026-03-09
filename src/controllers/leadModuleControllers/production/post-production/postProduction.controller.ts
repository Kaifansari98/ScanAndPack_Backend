import { Request, Response } from "express";
import { PostProductionService } from "../../../../services/production/post-production/postProduction.service";
import { prisma } from "../../../../prisma/client";
import {
  uploadToWasabiProductionFilesHardwarePackingDocsFile,
  uploadToWasabiProductionFilesQcPhotosFile,
  uploadToWasabiProductionFilesWoodworkPackingDocsFile,
  uploadToWasabiPreProductionFilesFile,
} from "../../../../utils/wasabiClient";
import fs from "node:fs/promises";
import { resolveClientBaseUrl } from "../../../../utils/fileUtils";

const service = new PostProductionService();

const getParam = (param: string | string[] | undefined): string | undefined =>
  Array.isArray(param) ? param[0] : param;

export class PostProductionController {
  async uploadQcPhotos(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;
      const { account_id, created_by, instance_id } = req.body;
      const { instance_id: instanceIdQuery } = req.query;
      const files = req.files as Express.Multer.File[];
      const bodyInstanceRaw = Array.isArray(instance_id)
        ? instance_id[0]
        : instance_id;
      const queryInstanceRaw = Array.isArray(instanceIdQuery)
        ? instanceIdQuery[0]
        : instanceIdQuery;
      const parsedInstanceId =
        typeof bodyInstanceRaw !== "undefined"
          ? Number(bodyInstanceRaw)
          : typeof queryInstanceRaw !== "undefined"
          ? Number(queryInstanceRaw)
          : undefined;
      const instanceIdValue = Number.isFinite(parsedInstanceId)
        ? parsedInstanceId
        : undefined;
      let instanceFolder: string | undefined;

      if (!vendorId || !leadId || !created_by) {
        return res.status(400).json({
          success: false,
          message: "vendorId, leadId and created_by are required",
        });
      }

      if (!instanceIdValue) {
        return res.status(400).json({
          success: false,
          message: "instance_id is required for QC photos",
        });
      }

      const instance = await prisma.leadProductStructureInstance.findFirst({
        where: {
          id: instanceIdValue,
          lead_id: Number(leadId),
          vendor_id: Number(vendorId),
        },
        select: { title: true },
      });

      if (!instance) {
        return res.status(404).json({
          success: false,
          message: "Product structure instance not found for this lead.",
        });
      }

      instanceFolder = instance.title?.trim() || `instance-${instanceIdValue}`;

      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one file must be uploaded",
        });
      }

      const uploadedFiles: { originalName: string; sysName: string }[] = [];

      for (const file of files) {
        const sysName = await uploadToWasabiProductionFilesQcPhotosFile(
          file.path,
          Number(vendorId),
          Number(leadId),
          file.originalname,
          file.mimetype,
        );

        await fs.unlink(file.path);

        uploadedFiles.push({
          originalName: file.originalname,
          sysName,
        });
      }

      const uploaded = await service.uploadQcPhotos(
        Number(vendorId),
        Number(leadId),
        account_id ? Number(account_id) : null,
        Number(created_by),
        uploadedFiles,
        instanceIdValue
      );

      return res.status(200).json({
        success: true,
        message: "QC Photos uploaded successfully",
        count: uploaded.length,
        data: uploaded,
      });
    } catch (error: any) {
      console.error("[PostProductionController] uploadQcPhotos Error:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message || "Internal server error while uploading QC Photos",
      });
    }
  }

  async uploadHardwarePackingDetails(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;
      const { account_id, created_by, remark, instance_id } = req.body;
      const { instance_id: instanceIdQuery } = req.query;
      const files = req.files as Express.Multer.File[];
      const bodyInstanceRaw = Array.isArray(instance_id)
        ? instance_id[0]
        : instance_id;
      const queryInstanceRaw = Array.isArray(instanceIdQuery)
        ? instanceIdQuery[0]
        : instanceIdQuery;
      const parsedInstanceId =
        typeof bodyInstanceRaw !== "undefined"
          ? Number(bodyInstanceRaw)
          : typeof queryInstanceRaw !== "undefined"
          ? Number(queryInstanceRaw)
          : undefined;
      const instanceIdValue = Number.isFinite(parsedInstanceId)
        ? parsedInstanceId
        : undefined;
      let instanceFolder: string | undefined;

      if (!instanceIdValue) {
        return res.status(400).json({
          success: false,
          message: "instance_id is required for hardware packing details",
        });
      }

      if (instanceIdValue) {
        const instance = await prisma.leadProductStructureInstance.findFirst({
          where: {
            id: instanceIdValue,
            lead_id: Number(leadId),
            vendor_id: Number(vendorId),
          },
          select: { title: true },
        });

        if (!instance) {
          return res.status(404).json({
            success: false,
            message: "Product structure instance not found for this lead.",
          });
        }

        instanceFolder = instance.title?.trim() || `instance-${instanceIdValue}`;
      }

      if (!vendorId || !leadId || !created_by) {
        return res.status(400).json({
          success: false,
          message: "vendorId, leadId and created_by are required",
        });
      }

      // ✅ At least one of remark or files must be provided
      if ((!remark || remark.trim() === "") && (!files || files.length === 0)) {
        return res.status(400).json({
          success: false,
          message: "Either remark or at least one file must be provided",
        });
      }

      const uploadedFiles: { originalName: string; sysName: string }[] = [];

      if (files && files.length > 0) {
        for (const file of files) {
          const sysName =
            await uploadToWasabiProductionFilesHardwarePackingDocsFile(
              file.path,
              Number(vendorId),
              Number(leadId),
              file.originalname,
              file.mimetype,
            );

          await fs.unlink(file.path);

          uploadedFiles.push({
            originalName: file.originalname,
            sysName,
          });
        }
      }

      const uploaded = await service.uploadHardwarePackingDetails(
        Number(vendorId),
        Number(leadId),
        account_id ? Number(account_id) : null,
        Number(created_by),
        remark,
        uploadedFiles,
        instanceIdValue
      );

      return res.status(200).json({
        success: true,
        message: "Hardware Packing Details uploaded successfully",
        data: uploaded,
      });
    } catch (error: any) {
      console.error(
        "[PostProductionController] uploadHardwarePackingDetails Error:",
        error
      );
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while uploading hardware packing details",
      });
    }
  }

  async uploadWoodworkPackingDetails(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;
      const { account_id, created_by, remark, instance_id } = req.body;
      const { instance_id: instanceIdQuery } = req.query;
      const files = req.files as Express.Multer.File[];
      console.log("[woodwork] body:", req.body);
      console.log("[woodwork] query:", req.query);
      const bodyInstanceRaw = Array.isArray(instance_id)
        ? instance_id[0]
        : instance_id;
      const queryInstanceRaw = Array.isArray(instanceIdQuery)
        ? instanceIdQuery[0]
        : instanceIdQuery;
      const parsedInstanceId =
        typeof bodyInstanceRaw !== "undefined"
          ? Number(bodyInstanceRaw)
          : typeof queryInstanceRaw !== "undefined"
          ? Number(queryInstanceRaw)
          : undefined;
      const instanceIdValue = Number.isFinite(parsedInstanceId)
        ? parsedInstanceId
        : undefined;
      let instanceFolder: string | undefined;

      if (!instanceIdValue) {
        return res.status(400).json({
          success: false,
          message: "instance_id is required for woodwork packing details",
        });
      }

      if (instanceIdValue) {
        const instance = await prisma.leadProductStructureInstance.findFirst({
          where: {
            id: instanceIdValue,
            lead_id: Number(leadId),
            vendor_id: Number(vendorId),
          },
          select: { title: true },
        });

        if (!instance) {
          return res.status(404).json({
            success: false,
            message: "Product structure instance not found for this lead.",
          });
        }

        instanceFolder = instance.title?.trim() || `instance-${instanceIdValue}`;
      }

      if (!vendorId || !leadId || !created_by) {
        return res.status(400).json({
          success: false,
          message: "vendorId, leadId and created_by are required",
        });
      }

      if ((!remark || remark.trim() === "") && (!files || files.length === 0)) {
        return res.status(400).json({
          success: false,
          message: "Either remark or at least one file must be provided",
        });
      }

      const uploadedFiles: { originalName: string; sysName: string }[] = [];

      if (files && files.length > 0) {
        for (const file of files) {
          const sysName =
            await uploadToWasabiProductionFilesWoodworkPackingDocsFile(
              file.path,
              Number(vendorId),
              Number(leadId),
              file.originalname,
              file.mimetype,
            );

          await fs.unlink(file.path);

          uploadedFiles.push({
            originalName: file.originalname,
            sysName,
          });
        }
      }

      const uploaded = await service.uploadWoodworkPackingDetails(
        Number(vendorId),
        Number(leadId),
        account_id ? Number(account_id) : null,
        Number(created_by),
        remark,
        uploadedFiles,
        instanceIdValue
      );

      return res.status(200).json({
        success: true,
        message: "Woodwork Packing Details uploaded successfully",
        data: uploaded,
      });
    } catch (error: any) {
      console.error(
        "[PostProductionController] uploadWoodworkPackingDetails Error:",
        error
      );
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while uploading woodwork packing details",
      });
    }
  }

  // ✅ GET QC Photos
  async getQcPhotos(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;
      const { instance_id } = req.query;
      const parsedInstanceId =
        typeof instance_id !== "undefined" ? Number(instance_id) : undefined;
      const safeInstanceId = Number.isFinite(parsedInstanceId)
        ? parsedInstanceId
        : undefined;

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const data = await service.getQcPhotos(
        Number(vendorId),
        Number(leadId),
        safeInstanceId
      );

      return res.status(200).json({
        success: true,
        message: "QC Photos fetched successfully",
        count: data.length,
        data,
      });
    } catch (error: any) {
      console.error("[PostProductionController] getQcPhotos Error:", error);
      return res.status(500).json({
        success: false,
        message:
          error.message || "Internal server error while fetching QC Photos",
      });
    }
  }

  // ✅ GET Hardware Packing Details
  async getHardwarePackingDetails(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;
      const { instance_id } = req.query;
      const parsedInstanceId =
        typeof instance_id !== "undefined" ? Number(instance_id) : undefined;
      const safeInstanceId = Number.isFinite(parsedInstanceId)
        ? parsedInstanceId
        : undefined;

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const data = await service.getHardwarePackingDetails(
        Number(vendorId),
        Number(leadId),
        safeInstanceId
      );

      return res.status(200).json({
        success: true,
        message: "Hardware Packing Details fetched successfully",
        remark: data.remark,
        count: data.documents.length,
        data: data.documents,
      });
    } catch (error: any) {
      console.error(
        "[PostProductionController] getHardwarePackingDetails Error:",
        error
      );
      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while fetching Hardware Packing Details",
      });
    }
  }

  // ✅ GET Woodwork Packing Details
  async getWoodworkPackingDetails(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;
      const { instance_id } = req.query;
      const parsedInstanceId =
        typeof instance_id !== "undefined" ? Number(instance_id) : undefined;
      const safeInstanceId = Number.isFinite(parsedInstanceId)
        ? parsedInstanceId
        : undefined;

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const data = await service.getWoodworkPackingDetails(
        Number(vendorId),
        Number(leadId),
        safeInstanceId
      );

      return res.status(200).json({
        success: true,
        message: "Woodwork Packing Details fetched successfully",
        remark: data.remark,
        count: data.documents.length,
        data: data.documents,
      });
    } catch (error: any) {
      console.error(
        "[PostProductionController] getWoodworkPackingDetails Error:",
        error
      );
      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while fetching Woodwork Packing Details",
      });
    }
  }

  async updateNoOfBoxes(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;
      const { account_id, user_id, no_of_boxes, instance_id } = req.body;
      const { instance_id: instanceIdQuery } = req.query;

      if (!vendorId || !leadId || !user_id || !no_of_boxes) {
        return res.status(400).json({
          success: false,
          message: "vendorId, leadId, user_id and no_of_boxes are required",
        });
      }

      const bodyInstanceRaw = Array.isArray(instance_id)
        ? instance_id[0]
        : instance_id;
      const queryInstanceRaw = Array.isArray(instanceIdQuery)
        ? instanceIdQuery[0]
        : instanceIdQuery;
      const parsedInstanceId =
        typeof bodyInstanceRaw !== "undefined"
          ? Number(bodyInstanceRaw)
          : typeof queryInstanceRaw !== "undefined"
          ? Number(queryInstanceRaw)
          : undefined;
      const instanceIdValue = Number.isFinite(parsedInstanceId)
        ? parsedInstanceId
        : undefined;

      if (
        typeof bodyInstanceRaw !== "undefined" ||
        typeof queryInstanceRaw !== "undefined"
      ) {
        if (!instanceIdValue) {
          return res.status(400).json({
            success: false,
            message: "instance_id must be a valid number",
          });
        }
      }

      const value = parseInt(no_of_boxes);
      if (isNaN(value) || value <= 0) {
        return res.status(400).json({
          success: false,
          message: "no_of_boxes must be a positive integer",
        });
      }

      const updated = await service.updateNoOfBoxes(
        Number(vendorId),
        Number(leadId),
        Number(account_id) || null,
        Number(user_id),
        value,
        instanceIdValue
      );

      return res.status(200).json({
        success: true,
        message: "No. of Boxes updated successfully",
        data: updated,
      });
    } catch (error: any) {
      console.error("[PostProductionController] updateNoOfBoxes Error:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message || "Internal server error while updating No. of Boxes",
      });
    }
  }

  // ✅ GET No. of Boxes by Lead
  async getNoOfBoxes(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;
      const { instance_id } = req.query;
      const parsedInstanceId =
        typeof instance_id !== "undefined" ? Number(instance_id) : undefined;
      const safeInstanceId = Number.isFinite(parsedInstanceId)
        ? parsedInstanceId
        : undefined;

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const data = await service.getNoOfBoxes(
        Number(vendorId),
        Number(leadId),
        safeInstanceId
      );

      if (!data) {
        return res.status(404).json({
          success: false,
          message: "Lead not found or deleted",
        });
      }

      return res.status(200).json({
        success: true,
        message: "No. of Boxes fetched successfully",
        data,
      });
    } catch (error: any) {
      console.error("[PostProductionController] getNoOfBoxes Error:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message || "Internal server error while fetching No. of Boxes",
      });
    }
  }

  // ✅ Check Post-Production Completeness
  async checkPostProductionCompleteness(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;
      const { instance_id } = req.query;

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const result = await service.checkPostProductionCompleteness(
        Number(vendorId),
        Number(leadId),
        typeof instance_id !== "undefined" ? Number(instance_id) : undefined
      );

      return res.status(200).json({
        success: true,
        message: "Post Production completeness check successful",
        data: result,
      });
    } catch (error: any) {
      console.error(
        "[PostProductionController] checkPostProductionCompleteness Error:",
        error
      );
      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while checking post production completeness",
      });
    }
  }

  async markProductionCompleted(req: Request, res: Response) {
    try {
      const vendorId = Number(getParam(req.params.vendorId));
      const leadId = Number(getParam(req.params.leadId));
      const { updated_by, instance_id } = req.body;
      const { instance_id: instanceIdQuery } = req.query;

      const bodyInstanceRaw = Array.isArray(instance_id)
        ? instance_id[0]
        : instance_id;
      const queryInstanceRaw = Array.isArray(instanceIdQuery)
        ? instanceIdQuery[0]
        : instanceIdQuery;

      const parsedInstanceId =
        typeof bodyInstanceRaw !== "undefined"
          ? Number(bodyInstanceRaw)
          : typeof queryInstanceRaw !== "undefined"
          ? Number(queryInstanceRaw)
          : undefined;

      const instanceIdValue = Number.isFinite(parsedInstanceId)
        ? parsedInstanceId
        : undefined;

      if (!vendorId || !leadId || !updated_by || !instanceIdValue) {
        return res.status(400).json({
          success: false,
          message:
            "vendorId, leadId, updated_by and instance_id are required",
        });
      }

      const result = await service.markProductionCompleted(
        vendorId,
        leadId,
        instanceIdValue,
        Number(updated_by)
      );

      return res.status(200).json({
        success: true,
        message: "Production marked completed for the instance",
        data: result,
      });
    } catch (error: any) {
      console.error(
        "[PostProductionController] markProductionCompleted error:",
        error
      );
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  async uploadPreProductionFiles(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;
      const { account_id, created_by, instance_id } = req.body;
      const { instance_id: instanceIdQuery } = req.query;
      const files = req.files as Express.Multer.File[];

      const bodyInstanceRaw = Array.isArray(instance_id)
        ? instance_id[0]
        : instance_id;
      const queryInstanceRaw = Array.isArray(instanceIdQuery)
        ? instanceIdQuery[0]
        : instanceIdQuery;
      const parsedInstanceId =
        typeof bodyInstanceRaw !== "undefined"
          ? Number(bodyInstanceRaw)
          : typeof queryInstanceRaw !== "undefined"
          ? Number(queryInstanceRaw)
          : undefined;
      const instanceIdValue = Number.isFinite(parsedInstanceId)
        ? parsedInstanceId
        : undefined;

      if (!vendorId || !leadId || !created_by) {
        return res.status(400).json({
          success: false,
          message: "vendorId, leadId and created_by are required",
        });
      }

      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one file must be uploaded",
        });
      }

      const uploadedFiles: { originalName: string; sysName: string }[] = [];

      for (const file of files) {
        const sysName = await uploadToWasabiPreProductionFilesFile(
          file.path,
          Number(vendorId),
          Number(leadId),
          file.originalname,
          file.mimetype,
        );

        await fs.unlink(file.path);

        uploadedFiles.push({ originalName: file.originalname, sysName });
      }

      const uploaded = await service.uploadPreProductionFiles(
        Number(vendorId),
        Number(leadId),
        account_id ? Number(account_id) : null,
        Number(created_by),
        uploadedFiles,
        instanceIdValue,
      );

      return res.status(200).json({
        success: true,
        message: "Pre-production files uploaded successfully",
        count: uploaded.length,
        data: uploaded,
      });
    } catch (error: any) {
      console.error(
        "[PostProductionController] uploadPreProductionFiles Error:",
        error,
      );
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while uploading pre-production files",
      });
    }
  }

  async getPreProductionFiles(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;
      const { instance_id } = req.query;
      const parsedInstanceId =
        typeof instance_id !== "undefined" ? Number(instance_id) : undefined;
      const safeInstanceId = Number.isFinite(parsedInstanceId)
        ? parsedInstanceId
        : undefined;

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const data = await service.getPreProductionFiles(
        Number(vendorId),
        Number(leadId),
        safeInstanceId,
      );

      return res.status(200).json({
        success: true,
        message: "Pre-production files fetched successfully",
        count: data.length,
        data,
      });
    } catch (error: any) {
      console.error(
        "[PostProductionController] getPreProductionFiles Error:",
        error,
      );
      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while fetching pre-production files",
      });
    }
  }

  async checkPreProductionFilesReady(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;
      const { instance_id } = req.query;

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const result = await service.checkPreProductionFilesReady(
        Number(vendorId),
        Number(leadId),
        typeof instance_id !== "undefined" ? Number(instance_id) : undefined,
      );

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      console.error(
        "[PostProductionController] checkPreProductionFilesReady Error:",
        error,
      );
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  async moveLeadToReadyToDispatch(req: Request, res: Response) {
    try {
      const vendorId = Number(getParam(req.params.vendorId));
      const leadId = Number(getParam(req.params.leadId));
      const { updated_by } = req.body;

      if (!vendorId || !leadId || !updated_by) {
        return res.status(400).json({
          success: false,
          message: "vendorId, leadId and updated_by are required",
        });
      }


            const baseUrl = resolveClientBaseUrl(req);
      const result = await service.moveLeadToReadyToDispatch(
        vendorId,
        leadId,
        updated_by,
        baseUrl
      );

      return res.status(200).json({
        success: true,
        message: "Lead successfully moved to Ready To Dispatch stage",
        data: result,
      });
    } catch (error: any) {
      console.error(
        "[PreProductionController] moveLeadToReadyToDispatch error:",
        error
      );
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }
}
