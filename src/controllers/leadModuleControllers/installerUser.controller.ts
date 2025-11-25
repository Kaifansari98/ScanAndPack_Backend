import { Request, Response } from "express";
import {
  addInstallerUser,
  getAllInstallerUsers,
  deleteInstallerUser,
} from "../../services/leadModuleServices/installerUser.service";

export const createInstallerUser = async (req: Request, res: Response) => {
  console.log("[CONTROLLER] createInstallerUser called", { body: req.body });

  try {
    const { vendor_id, installer_name, contact_number, created_by } = req.body;

    if (!vendor_id || !installer_name || !created_by) {
      console.warn("[CONTROLLER] Missing required fields", {
        vendor_id,
        installer_name,
        created_by,
      });
      return res
        .status(400)
        .json({
          error: "vendor_id, installer_name and created_by are required",
        });
    }

    const installerUser = await addInstallerUser({
      vendor_id,
      installer_name,
      contact_number,
      created_by,
    });

    console.log(
      "[CONTROLLER] InstallerUser created successfully",
      installerUser
    );
    return res.status(201).json({ success: true, data: installerUser });
  } catch (error: any) {
    console.error("[CONTROLLER] Error creating installer user", {
      error: error.message,
    });
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const fetchAllInstallerUsers = async (req: Request, res: Response) => {
  console.log("[CONTROLLER] fetchAllInstallerUsers called", {
    params: req.params,
  });

  try {
    const vendor_id = parseInt(req.params.vendor_id);
    if (!vendor_id) {
      console.warn("[CONTROLLER] Missing vendor_id");
      return res.status(400).json({ error: "vendor_id is required" });
    }

    const installers = await getAllInstallerUsers(vendor_id);
    return res.status(200).json({ success: true, data: installers });
  } catch (error: any) {
    console.error("[CONTROLLER] Error fetching installer users", {
      error: error.message,
    });
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const removeInstallerUser = async (req: Request, res: Response) => {
  console.log("[CONTROLLER] removeInstallerUser called", {
    params: req.params,
  });

  try {
    const id = parseInt(req.params.id);
    if (!id) {
      console.warn("[CONTROLLER] Missing installer user id");
      return res.status(400).json({ error: "id is required" });
    }

    await deleteInstallerUser(id);
    return res
      .status(200)
      .json({ success: true, message: "InstallerUser deleted successfully" });
  } catch (error: any) {
    console.error("[CONTROLLER] Error deleting installer user", {
      error: error.message,
    });
    return res.status(500).json({ success: false, error: error.message });
  }
};
