import { Router } from "express";
import { getTracker, listInstances, listProjects } from "../controllers/projects.controller";
import { requireClient } from "../middleware/client-auth.middleware";

const router = Router();

router.use(requireClient);
router.get("/", listProjects);
router.get("/:leadId/instances", listInstances);
router.get("/:leadId/instances/:instanceId/tracker", getTracker);

export default router;
