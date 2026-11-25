import { Router } from "express";
import authRoutes from "./auth.routes";
import projectsRoutes from "./projects.routes";
import chatsRoutes from "./chats.routes";

// Register mobile feature routers here as they are implemented.
export const mobileAppRouter = Router();

mobileAppRouter.use("/auth", authRoutes);
mobileAppRouter.use("/client/projects", projectsRoutes);
mobileAppRouter.use("/client/chats", chatsRoutes);
