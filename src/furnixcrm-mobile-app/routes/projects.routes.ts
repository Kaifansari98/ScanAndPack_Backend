import { Router } from "express";
import {
  getProjectDashboard,
  getProjectTracker,
  getProjectUpdates,
  listInstances,
  listProjects,
} from "../controllers/projects.controller";
import { requireClient } from "../middleware/client-auth.middleware";

const router = Router();

router.use(requireClient);
router.get("/", listProjects);
router.get("/:leadId/instances", listInstances);
router.get("/:leadId/dashboard", getProjectDashboard);
router.get("/:leadId/tracker", getProjectTracker);
router.get("/:leadId/updates", getProjectUpdates);

export default router;
