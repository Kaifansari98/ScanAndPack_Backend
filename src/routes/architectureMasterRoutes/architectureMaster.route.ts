import { Router } from "express";
import { ArchitectureMasterController } from "../../controllers/architectureMasterControllers/architectureMaster.controller";

const router = Router();
const architectureMasterController = new ArchitectureMasterController();

// Routes for Architecture Master
router.post("/create-architecture", architectureMasterController.create);
router.get("/list-architecture", architectureMasterController.getList);
router.get("/get-architecture/:id", architectureMasterController.getSingle);
router.put("/update-architecture/:id", architectureMasterController.update);
router.put("/update-status/:id", architectureMasterController.updateStatus);
router.delete("/delete-architecture/:id", architectureMasterController.delete);
router.get("/dropdown-list/:vendorId", architectureMasterController.getArchitectsList);

export default router;
