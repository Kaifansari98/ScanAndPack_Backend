import { Router } from "express";
import authRoutes from "./auth.routes";

// Register mobile feature routers here as they are implemented.
export const mobileAppRouter = Router();

mobileAppRouter.use("/auth", authRoutes);
