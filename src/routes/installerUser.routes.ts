import { Router } from "express";
import {
  createInstallerUser,
  fetchAllInstallerUsers,
  removeInstallerUser,
} from "../controllers/leadModuleControllers/installerUser.controller";

const installerUserRoutes = Router();

/**
 * ✅ POST → Create a new Installer User
 * @route POST /installation/installer-users
 */
installerUserRoutes.post("/create-installer-user", createInstallerUser);

/**
 * ✅ GET → Get all Installer Users for a vendor
 * @route GET /installation/installer-users/vendor/:vendor_id
 */
installerUserRoutes.get("/vendorId/:vendor_id/get-all-installers", fetchAllInstallerUsers);

/**
 * ✅ DELETE → Delete Installer User by ID
 * @route DELETE /installation/installer-users/:id
 */
installerUserRoutes.delete("/installerId/:id/delete-installer", removeInstallerUser);

export default installerUserRoutes;
