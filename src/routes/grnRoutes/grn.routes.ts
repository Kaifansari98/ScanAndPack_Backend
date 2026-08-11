import { Router } from "express";
import {
  getPOForGRN, createGRN, confirmGRN, listGRNs, getGRNById,
  createDCN, createRedelivery,
  rejectionReport, delayReport, vendorPerformanceReport, grnSummary,
} from "../../controllers/grnController/grn.Controller";


const router = Router();

// GRN CRUD
router.get("/:vendor_id/po/:po_id/prefill", getPOForGRN);
router.post("/:vendor_id/grn",                  createGRN);
router.patch("/:vendor_id/:id/confirm",     confirmGRN);
router.get("/:vendor_id",                   listGRNs);
router.get("/:vendor_id/:id",               getGRNById);


// Actions on a GRN
router.post("/:vendor_id/dcn",              createDCN);
router.post("/:vendor_id/redelivery",       createRedelivery);

// Reports
router.get("/:vendor_id/reports/rejection",         rejectionReport);
router.get("/:vendor_id/reports/delay",             delayReport);
router.get("/:vendor_id/reports/vendor-performance",vendorPerformanceReport);
router.get("/:vendor_id/reports/summary",           grnSummary);

export default router;
// app.use("/grn", router);