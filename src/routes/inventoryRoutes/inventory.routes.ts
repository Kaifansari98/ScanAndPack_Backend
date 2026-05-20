import { Router } from 'express';
import {
  syncCadbidProduct,
  getProductFilters,
  getProductMaster,
  getProductPurchaseHistory,
} from '../../controllers/inventoryController/inventory.controller';

import {
  downloadStockSheet, uploadStockSheet,
  getProductStockHistory, getStockUploadBatches,
  upload,
} from "../../controllers/inventoryController/stock.controller";

import {
  getCategories,
  getProducts,
  getCompanyVendors,
  getPaymentTerms,
  create,
  list,
  getById,
  patchStatus,
  remove,
  update,
  getVendorStateId,
} from "../../controllers/inventoryController/purchaseIntent.Controller";

const router = Router();

// ── Inventory / Products ──────────────────────────────────────────────────────
router.post("/sync-cadbid-products",                      syncCadbidProduct);
router.get("/products/:vendor_id/filters",                getProductFilters);
router.get("/products/:vendor_id",                        getProductMaster);
router.get("/products/:vendor_id/:product_id/history",    getProductPurchaseHistory);

// ── Purchase Intents ──────────────────────────────────────────────────────────
// Lookup endpoints (products now returns HSN tax rates too)
router.get("/purchase-intents/:vendor_id/categories",     getCategories);
router.get("/purchase-intents/:vendor_id/products",       getProducts);
router.get("/purchase-intents/:vendor_id/company-vendors",getCompanyVendors);
router.get("/purchase-intents/:vendor_id/company-state-id",getVendorStateId);


// CRUD
router.post("/purchase-intents/:vendor_id",               create);
router.get("/purchase-intents/:vendor_id",                list);
router.get("/purchase-intents/:vendor_id/:id",            getById);
router.patch("/purchase-intents/:vendor_id/:id/status",   patchStatus);
router.delete("/purchase-intents/:vendor_id/:id",         remove);
router.put("/purchase-intents/:vendor_id/:id",            update);
router.get("/purchase-intents/:vendor_id/payment-terms/get", getPaymentTerms);


router.get("/stock/:vendor_id/download",                   downloadStockSheet);
router.post("/stock/:vendor_id/upload", upload.single("file"), uploadStockSheet);
router.get("/stock/:vendor_id/history/:product_id",        getProductStockHistory);
router.get("/stock/:vendor_id/batches",                    getStockUploadBatches);


export default router;