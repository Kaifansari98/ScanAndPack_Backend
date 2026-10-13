import { Router } from "express";
import {
  listTimeZonesController,
  getTimeZoneByIdController,
  createTimeZoneController,
  updateTimeZoneController,
} from "../../controllers/timeZone/timeZone.controller";
import { verifyToken } from "../../middlewares/auth.middleware";

const timeZoneRoutes = Router();

timeZoneRoutes.get("/", listTimeZonesController);
timeZoneRoutes.get("/:id", getTimeZoneByIdController);
timeZoneRoutes.post("/", verifyToken, createTimeZoneController);
timeZoneRoutes.put("/:id", verifyToken, updateTimeZoneController);

export default timeZoneRoutes;
