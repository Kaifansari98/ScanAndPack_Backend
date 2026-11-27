import { Request, Response, Router } from "express";
import { verifyToken } from "../middlewares/auth.middleware";
import logger from "../utils/logger";
import * as locations from "../services/inventoryLocations/inventoryLocations.service";

// Inventory locations: /inventory-locations/vendor/:vendorId

const router = Router();
router.use(verifyToken);

const actorOf = (req: Request): locations.LocationActor => {
  const user = (req as any).user;
  const vendorId = Number(req.params.vendorId);
  if (!Number.isSafeInteger(vendorId) || Number(user?.vendor_id) !== vendorId)
    throw new locations.LocationError("Vendor access denied.", 403);
  return { vendorId, userId: Number(user?.id) || 0 };
};

const idOf = (req: Request) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new locations.LocationError("Invalid ID.");
  return id;
};

const handle =
  (label: string, fn: (req: Request, actor: locations.LocationActor) => Promise<unknown>) =>
  async (req: Request, res: Response) => {
    try {
      res.json({ success: true, data: await fn(req, actorOf(req)) });
    } catch (error) {
      if (error instanceof locations.LocationError)
        return res.status(error.statusCode).json({ success: false, message: error.message });
      logger.error(`[inventory-locations] ${label}`, error);
      res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
    }
  };

const base = "/vendor/:vendorId";
router.get(base, handle("list", (_req, a) => locations.listLocations(a)));
router.post(base, handle("create", (req, a) => locations.createLocation(a, req.body ?? {})));
router.put(`${base}/:id`, handle("update", (req, a) => locations.updateLocation(a, idOf(req), req.body ?? {})));
router.delete(`${base}/:id`, handle("delete", (req, a) => locations.deleteLocation(a, idOf(req))));

export default router;
