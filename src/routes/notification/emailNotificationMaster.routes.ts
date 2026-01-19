import { Router } from "express";
import { EmailNotificationMasterController } from "../../controllers/notification/emailNotificationMaster.controller";

const emailNotificationMasterRoutes = Router();

emailNotificationMasterRoutes.post(
  "/create",
  EmailNotificationMasterController.create
);

export default emailNotificationMasterRoutes;
