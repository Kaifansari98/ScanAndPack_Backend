import { Request, Response } from "express";
import { clientFrom } from "../middleware/client-auth.middleware";
import { MobileProjectsService } from "../services/projects.service";
import { MobileTrackerService } from "../services/tracker.service";
import { MobileDashboardService } from "../services/dashboard.service";

const mobileProjectsService = new MobileProjectsService();
const mobileTrackerService = new MobileTrackerService();
const mobileDashboardService = new MobileDashboardService();

type Handler = (
  req: Request,
  res: Response,
) => Promise<{ status: number; body: unknown }>;

const handle =
  (label: string, handler: Handler) => async (req: Request, res: Response) => {
    try {
      const response = await handler(req, res);
      return res.status(response.status).json(response.body);
    } catch (err) {
      console.error(`[furnixcrm-app] ${label} error:`, err);
      return res.status(500).json({ message: "Server error" });
    }
  };

export const listProjects = handle("List projects", (_req, res) =>
  mobileProjectsService.listProjects(clientFrom(res)),
);
export const listInstances = handle("List instances", (req, res) =>
  mobileProjectsService.listInstances(clientFrom(res), Number(req.params.leadId)),
);
export const getProjectTracker = handle("Project tracker", (req, res) =>
  mobileTrackerService.getProjectTracker(clientFrom(res), Number(req.params.leadId)),
);
export const getProjectDashboard = handle("Project dashboard", (req, res) =>
  mobileDashboardService.getDashboard(clientFrom(res), Number(req.params.leadId)),
);
export const getProjectUpdates = handle("Project updates", (req, res) =>
  mobileTrackerService.getProjectUpdates(clientFrom(res), Number(req.params.leadId)),
);
