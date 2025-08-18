import { Router } from "express";
import { createProductType, fetchAllProductTypes, removeProductType } from "../../controllers/leadModuleControllers/productType.controller";
import { createSiteType, fetchAllSiteTypes, removeSiteType } from "../../controllers/leadModuleControllers/siteType.controller";
import { createSourceType, fetchAllSourceTypes, removeSourceType } from "../../controllers/leadModuleControllers/sourceType.controller";
import { createProductStructureType, fetchAllProductStructureTypes, removeProductStructureType } from "../../controllers/leadModuleControllers/productStructureType.controller";

const router = Router();

router.post('/create-product-type', createProductType);
router.post('/create-site-type', createSiteType);
router.post('/create-source-type', createSourceType);
router.post('/create-product-structure', createProductStructureType);
router.get("/get-all-product-types/:vendor_id", fetchAllProductTypes);
router.delete("/delete-product-type/:id", removeProductType);
router.get("/get-all-site-types/:vendor_id", fetchAllSiteTypes);
router.delete("/delete-site-type/:id", removeSiteType);
router.get("/get-all-productStructure-types/:vendor_id", fetchAllProductStructureTypes);
router.delete("/delete-productStructure-type/:id", removeProductStructureType);
router.get("/get-all-source-types/:vendor_id", fetchAllSourceTypes);
router.delete("/delete-source-type/:id", removeSourceType);

export default router;