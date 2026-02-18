import { Router } from "express";
import { TrackTraceMasterController } from "../../../src/controllers/trackTraceController/trackTraceMasterController";
import { uploadMachineFiles } from "../../../src/middlewares/uploadWasabi";
import { 

  getMachineType
} from '../../controllers/trackTraceController/trackTraceMasterController';
const router = Router();


router.post(
  "/machines",
  uploadMachineFiles.single("machine_image"),
  TrackTraceMasterController.createMachine
);
router.get(
  "/machines/vendor/:vendor_id",
  TrackTraceMasterController.getMachineByVendor,
);
router.put(
  "/machines/:id/vendor/:vendor_id",
  uploadMachineFiles.single("machine_image"),
  TrackTraceMasterController.updateMachine
);

router.get("/machine-type",getMachineType);
export default router;