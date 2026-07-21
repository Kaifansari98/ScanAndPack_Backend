import { Router } from "express";
import multer from "multer";
import { BroadcastController } from "../../controllers/broadcast/broadcast.controller";
import { verifyToken } from "../../middlewares/auth.middleware";

const upload = multer(); // in-memory multipart/form-data handler
const broadcastRouter = Router();
const controller = new BroadcastController();

// All broadcast routes require token verification
broadcastRouter.use(verifyToken);

// POST   /broadcasts              → Create broadcast
broadcastRouter.post("/", upload.any(), controller.create.bind(controller));

// GET    /broadcasts              → List broadcasts (supports ?forMe=true for audience filtering)
broadcastRouter.get("/", controller.list.bind(controller));

// GET    /broadcasts/:id          → Get single broadcast
broadcastRouter.get("/:id", controller.getById.bind(controller));

// PATCH  /broadcasts/:id          → Update broadcast
broadcastRouter.patch("/:id", upload.any(), controller.update.bind(controller));

// DELETE /broadcasts/:id          → Soft-delete broadcast
broadcastRouter.delete("/:id", controller.delete.bind(controller));

// POST   /broadcasts/:id/read     → Mark broadcast as read by current user
broadcastRouter.post("/:id/read", controller.markRead.bind(controller));

// GET    /broadcasts/:id/readers  → List all users who read this broadcast
broadcastRouter.get("/:id/readers", controller.getReaders.bind(controller));

export default broadcastRouter;
