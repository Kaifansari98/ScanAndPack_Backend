import { Router } from "express";
import { createUserTypeController, getUserTypesController } from "../../controllers/userControllers/userType.controller";

const router = Router();

router.post("/", createUserTypeController);
router.get("/", getUserTypesController);

export default router;
