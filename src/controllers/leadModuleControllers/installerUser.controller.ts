import { Request, Response } from "express";
import {
  addInstallerUser,
  deleteInstallerUser,
  getAllInstallerUsers,
  getAllInstallerUsersForMaster,
  updateInstallerUser,
  updateInstallerUserStatus,
} from "../../services/leadModuleServices/installerUser.service";

const getParam = (param: string | string[] | undefined): string | undefined =>
  Array.isArray(param) ? param[0] : param;

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
    const vendor_id = Number(getParam(req.params.vendor_id));
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

export const fetchAllInstallerUsersForMaster = async (
  req: Request,
  res: Response,
) => {
  console.log("[CONTROLLER] fetchAllInstallerUsersForMaster called", {
    params: req.params,
  });

  try {
    const vendor_id = Number(getParam(req.params.vendor_id));
    if (!vendor_id) {
      console.warn("[CONTROLLER] Missing vendor_id");
      return res.status(400).json({ error: "vendor_id is required" });
    }

    const installers = await getAllInstallerUsersForMaster(vendor_id);
    return res.status(200).json({ success: true, data: installers });
  } catch (error: any) {
    console.error("[CONTROLLER] Error fetching installer users for master", {
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
    const id = Number(getParam(req.params.id));
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

export const editInstallerUser = async (req: Request, res: Response) => {
  console.log("[CONTROLLER] editInstallerUser called", {
    params: req.params,
    body: req.body,
  });

  try {
    const id = Number(getParam(req.params.id));
    const installer_name = String(req.body?.installer_name ?? "").trim();
    const contact_number = req.body?.contact_number
      ? String(req.body.contact_number).trim()
      : undefined;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    if (!installer_name) {
      return res.status(400).json({ error: "installer_name is required" });
    }

    const installerUser = await updateInstallerUser(id, {
      installer_name,
      contact_number,
    });

    return res.status(200).json({ success: true, data: installerUser });
  } catch (error: any) {
    console.error("[CONTROLLER] Error editing installer user", {
      error: error.message,
    });
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const toggleInstallerUserStatus = async (req: Request, res: Response) => {
  console.log("[CONTROLLER] toggleInstallerUserStatus called", {
    params: req.params,
    body: req.body,
  });

  try {
    const id = Number(getParam(req.params.id));
    const status = String(req.body?.status ?? "").toLowerCase();

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    if (!status) {
      return res.status(400).json({ error: "status is required" });
    }

    if (!["active", "inactive"].includes(status)) {
      return res.status(400).json({
        error: "status must be either 'active' or 'inactive'",
      });
    }

    const installerUser = await updateInstallerUserStatus(
      id,
      status as "active" | "inactive",
    );

    return res.status(200).json({ success: true, data: installerUser });
  } catch (error: any) {
    console.error("[CONTROLLER] Error updating installer user status", {
      error: error.message,
    });
    return res.status(500).json({ success: false, error: error.message });
  }
};
