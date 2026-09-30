import { Router } from "express";
import { ArchitectureMasterController } from "../../controllers/architectureMasterControllers/architectureMaster.controller";
import multer from "multer";

const router = Router();
const architectureMasterController = new ArchitectureMasterController();
const upload = multer();

// Routes for Architecture Master
router.post("/create-architecture", architectureMasterController.create);
router.get("/list-architecture", architectureMasterController.getList);
router.get("/get-architecture/:id", architectureMasterController.getSingle);
router.put("/update-architecture/:id", architectureMasterController.update);
router.put("/update-status/:id", architectureMasterController.updateStatus);
router.delete("/delete-architecture/:id", architectureMasterController.delete);
router.get("/dropdown-list/:vendorId", architectureMasterController.getArchitectsList);
router.post("/upload-architecture", upload.single("file"), architectureMasterController.uploadArchitects);

export default router;
