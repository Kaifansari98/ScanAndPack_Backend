import { Request, Response, Router } from "express";
import { verifyToken } from "../middlewares/auth.middleware";
import logger from "../utils/logger";
import * as units from "../services/standardUnits/standardUnits.service";

// Standard units, unit relations and category units: /standard-units/vendor/:vendorId

const router = Router();
router.use(verifyToken);

const actorOf = (req: Request): units.UnitActor => {
  const user = (req as any).user;
  const vendorId = Number(req.params.vendorId);
  if (!Number.isSafeInteger(vendorId) || Number(user?.vendor_id) !== vendorId)
    throw new units.UnitError("Vendor access denied.", 403);
  return { vendorId, userId: Number(user?.id) || 0 };
};

const idOf = (req: Request) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new units.UnitError("Invalid ID.");
  return id;
};

const handle =
  (label: string, fn: (req: Request, actor: units.UnitActor) => Promise<unknown>) =>
  async (req: Request, res: Response) => {
    try {
      res.json({ success: true, data: await fn(req, actorOf(req)) });
    } catch (error) {
      if (error instanceof units.UnitError)
        return res.status(error.statusCode).json({ success: false, message: error.message });
      logger.error(`[standard-units] ${label}`, error);
      res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
    }
  };

const base = "/vendor/:vendorId";
router.get(base, handle("list", (_req, a) => units.getStandardUnits(a)));

router.post(`${base}/classes`, handle("create class", (req, a) => units.createClass(a, req.body ?? {})));
router.put(`${base}/classes/:id`, handle("update class", (req, a) => units.updateClass(a, idOf(req), req.body ?? {})));
router.delete(`${base}/classes/:id`, handle("delete class", (req, a) => units.deleteClass(a, idOf(req))));

router.post(`${base}/units`, handle("create unit", (req, a) => units.createUnit(a, req.body ?? {})));
router.put(`${base}/units/:id`, handle("update unit", (req, a) => units.updateUnit(a, idOf(req), req.body ?? {})));
router.delete(`${base}/units/:id`, handle("delete unit", (req, a) => units.deleteUnit(a, idOf(req))));

router.post(`${base}/relations`, handle("create relation", (req, a) => units.createRelation(a, req.body ?? {})));
router.put(`${base}/relations/:id`, handle("update relation", (req, a) => units.updateRelation(a, idOf(req), req.body ?? {})));
router.delete(`${base}/relations/:id`, handle("delete relation", (req, a) => units.deleteRelation(a, idOf(req))));

// Purchase / stock / consumption units of a category or sub-category.
router.get(`${base}/category-units`, handle("list category units", (_req, a) => units.getCategoryUnits(a)));
router.put(`${base}/category-units/:id`, handle("save category units", (req, a) => units.saveCategoryUnits(a, idOf(req), req.body ?? {})));

export default router;
