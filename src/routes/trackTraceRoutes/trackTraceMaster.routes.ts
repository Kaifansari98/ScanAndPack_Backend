import { Router } from "express";
import { TrackTraceMasterController } from "../../../src/controllers/trackTraceController/trackTraceMasterController";
import { CutListRuleController } from "../../../src/controllers/trackTraceController/cutListRule.controller";
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

router.post(
  "/machine-users-assign",
  TrackTraceMasterController.assignUsersToMachineController,
);

router.get(
  "/machines/:machine_id/assigned-users",
  TrackTraceMasterController.getAssignedUsersController,
);

router.get("/machine-type",getMachineType);

// --- CUTLIST MACHINE RULES ROUTES ---
router.get("/rule-masters/fields", CutListRuleController.getRuleFields);
router.get("/rule-masters/actions", CutListRuleController.getVendorRuleActions);

router.get("/machines/:machine_id/rules", CutListRuleController.getRulesByMachine);
router.get("/machines/:machine_id/rules/:rule_id", CutListRuleController.getRuleById);
router.post("/machines/:machine_id/rules", CutListRuleController.createRule);
router.put("/machines/:machine_id/rules/:rule_id", CutListRuleController.updateRule);
router.delete("/machines/:machine_id/rules/:rule_id", CutListRuleController.deleteRule);
router.patch("/machines/:machine_id/rules/:rule_id/status", CutListRuleController.toggleRuleStatus);

export default router;