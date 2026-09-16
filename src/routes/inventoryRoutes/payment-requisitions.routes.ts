import { Router } from "express";
import {
  listPaymentRequisitions,
  getPaymentRequisitionById,
  reschedulePaymentRequisition,
  markPaymentDone,
} from "../../controllers/inventoryController/payment-requisition.controller";

const router = Router();

router.get("/:vendor_id", listPaymentRequisitions);
router.get("/:vendor_id/:id", getPaymentRequisitionById);
router.patch("/:vendor_id/:id/reschedule", reschedulePaymentRequisition);
router.post("/:vendor_id/:id/payments", markPaymentDone);

export default router;