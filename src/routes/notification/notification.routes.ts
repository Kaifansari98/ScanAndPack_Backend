import { Router } from "express";
import { NotificationController } from "../../controllers/notification/notification.controller";

const notificationRoutes = Router();

notificationRoutes.post("/send", NotificationController.send);
notificationRoutes.get(
  "/vendor/:vendorId/user/:userId",
  NotificationController.listForUser,
);
notificationRoutes.patch("/:id/read", NotificationController.markRead);
notificationRoutes.post(
  "/push-token",
  NotificationController.registerPushToken,
);
notificationRoutes.put(
  "/deactivate-token",
  NotificationController.deactivatePushToken,
);

export default notificationRoutes;
