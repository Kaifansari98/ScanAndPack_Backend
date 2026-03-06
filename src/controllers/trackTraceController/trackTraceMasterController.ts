import fs from "fs";
import { Request, Response } from "express";
import { TrackTraceMasterService } from "../../../src/services/trackTraceServices/trackTraceMasterService";
import logger from "../../../src/utils/logger";
import * as trackTraceService from "../../services/trackTraceServices/trackTraceMasterService";
import path from "path";
import { uploadToWasabiMachineImage } from "../../../src/utils/wasabiClient";

export class TrackTraceMasterController {
  static async createMachine(req: Request, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Machine image is mandatory",
        });
      }

      const file = req.file;

      // ✅ Wasabi pe upload
      const imagePath = await uploadToWasabiMachineImage(
        file.path,
        Number(req.body.vendor_id),
        file.originalname,
        file.mimetype,
      );

      // ✅ Temp file cleanup
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }

      const machine = await TrackTraceMasterService.createMachine({
        ...req.body,
        vendor_id: Number(req.body.vendor_id),
        machine_type_id: Number(req.body.machine_type_id),
        factory_id: req.body.factory_id ? Number(req.body.factory_id) : null,
        sequence_no: req.body.sequence_no
          ? Number(req.body.sequence_no)
          : undefined,
        target_per_hour: req.body.target_per_hour
          ? Number(req.body.target_per_hour)
          : undefined,
        created_by: Number(req.body.created_by),
        updated_by: Number(req.body.created_by),
        image_path: imagePath,
      });

      return res.status(201).json({
        success: true,
        message: "Machine created successfully",
        data: machine,
      });
    } catch (error: any) {
      // ✅ Error pe bhi cleanup
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to create machine",
      });
    }
  }

  static async getMachineByVendor(req: Request, res: Response) {
    try {
      const vendor_id = Number(req.params.vendor_id);

      const machines =
        await TrackTraceMasterService.getMachinesByVendor(vendor_id);

      return res.status(200).json({
        success: true,
        data: machines,
      });
    } catch (error: any) {
      logger.error("Controller Error - Get Machines", error);

      return res.status(500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  }

  static async updateMachine(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      const vendor_id = Number(req.params.vendor_id);

      let imagePath: string | undefined;

      if (req.file) {
        const file = req.file;

        // ✅ Wasabi pe upload
        imagePath = await uploadToWasabiMachineImage(
          file.path,
          Number(vendor_id),
          file.originalname,
          file.mimetype,
        );

        // ✅ Temp file cleanup
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }

      const updated = await TrackTraceMasterService.updateMachine(
        id,
        vendor_id,
        {
          ...req.body,
          vendor_id,
          machine_type_id: Number(req.body.machine_type_id),
          factory_id: req.body.factory_id
            ? Number(req.body.factory_id)
            : undefined,
          sequence_no: req.body.sequence_no
            ? Number(req.body.sequence_no)
            : undefined,
          target_per_hour: req.body.target_per_hour
            ? Number(req.body.target_per_hour)
            : undefined,
          updated_by: Number(req.body.updated_by),
          ...(imagePath && { image_path: imagePath }),
        },
      );

      return res.status(200).json({
        success: true,
        message: "Machine updated successfully",
        data: updated,
      });
    } catch (error: any) {
      // ✅ Error pe bhi cleanup
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      logger.error("Controller Error - Update Machine", error);

      return res.status(400).json({
        success: false,
        message: error.message || "Update failed",
      });
    }
  }
}

export const getMachineType = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.params.vendor_id);

    const machines_type = await trackTraceService.getMachineType();

    return res.status(200).json({
      success: true,
      data: machines_type,
    });
  } catch (error: any) {
    logger.error("Controller Error - Get Machines", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};
