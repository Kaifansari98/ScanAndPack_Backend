import { Router } from "express";
import {
  createMiscType,
  getMiscTypes,
  deleteMiscType,
  editMiscType,
  toggleMiscTypeStatus,
  createMiscTeam,
  getMiscTeams,
  deleteMiscTeam,
  editMiscTeam,
  toggleMiscTeamStatus,
  getPendingMiscellaneousLeads,
  getPendingMiscellaneousLeadCount,
} from "../controllers/leadModuleControllers/miscellaneousMaster.controller";

const miscRoutes = Router();

/* ----------------------------- Misc Type Master ----------------------------- */

// POST → Create Misc Type
// @route POST /miscellaneous-master/type/create
miscRoutes.post("/type/create", createMiscType);

// GET → All Misc Types (Vendor Wise)
// @route GET /miscellaneous-master/type/vendor/:vendor_id
miscRoutes.get("/type/vendor/:vendor_id", getMiscTypes);

// DELETE → Delete Misc Type by ID
// @route DELETE /miscellaneous-master/type/:id
miscRoutes.delete("/type/:id", deleteMiscType);
miscRoutes.patch("/type/:id", editMiscType);
miscRoutes.patch("/type/:id/status", toggleMiscTypeStatus);

/* ----------------------------- Misc Team Master ----------------------------- */

// POST → Create Team
// @route POST /miscellaneous-master/team/create
miscRoutes.post("/team/create", createMiscTeam);

// GET → All Teams (Vendor Wise)
// @route GET /miscellaneous-master/team/vendor/:vendor_id
miscRoutes.get("/team/vendor/:vendor_id", getMiscTeams);

// DELETE → Delete Team by ID
// @route DELETE /miscellaneous-master/team/:id
miscRoutes.delete("/team/:id", deleteMiscTeam);
miscRoutes.patch("/team/:id", editMiscTeam);
miscRoutes.patch("/team/:id/status", toggleMiscTeamStatus);

miscRoutes.post(
  "/vendor/:vendorId/pending-miscellaneous",
  getPendingMiscellaneousLeads,
);

miscRoutes.get(
  "/vendor/:vendorId/pending-miscellaneous/count",
  getPendingMiscellaneousLeadCount,
);

export default miscRoutes;
