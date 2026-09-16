import { Router } from 'express';

import { getPIForConversion, convertPIToPO,
  listPurchaseOrders, getPurchaseOrderById,
  updatePOItem, deletePOItem,
  updatePOStatus, cancelPO,
 } from "../../controllers/purchaseOrderController/purchaseOrder.controller";
const router = Router();





 
router.get("/:vendor_id/pi/:pi_id/prefill", getPIForConversion);
router.post("/:vendor_id/convert",          convertPIToPO);
router.get("/:vendor_id",                   listPurchaseOrders);
router.get("/:vendor_id/:id",               getPurchaseOrderById);
router.patch("/:vendor_id/:id/status",      updatePOStatus);
router.patch("/:vendor_id/:id/cancel",      cancelPO);
router.patch("/:vendor_id/:id/items/:item_id", updatePOItem);
router.delete("/:vendor_id/:id/items/:item_id", deletePOItem);



export default router;