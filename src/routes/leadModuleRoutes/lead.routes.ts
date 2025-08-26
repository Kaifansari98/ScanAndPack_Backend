import { Router } from "express";
import { createProductType, fetchAllProductTypes, removeProductType } from "../../controllers/leadModuleControllers/productType.controller";
import { createSiteType, fetchAllSiteTypes, removeSiteType } from "../../controllers/leadModuleControllers/siteType.controller";
import { createSourceType, fetchAllSourceTypes, removeSourceType } from "../../controllers/leadModuleControllers/sourceType.controller";
import { createProductStructureType, fetchAllProductStructureTypes, removeProductStructureType } from "../../controllers/leadModuleControllers/productStructureType.controller";
import { createLead, fetchLeadsByVendor, fetchLeadsByVendorAndUser, deleteLead, updateLeadController } from "../../controllers/leadModuleControllers/leadsGeneration/leadGeneration.controller";
import { upload } from "../../middlewares/upload.middleware";

const leadsRouter = Router();

leadsRouter.post('/create-product-type', createProductType);
leadsRouter.post('/create-site-type', createSiteType);
leadsRouter.post('/create-source-type', createSourceType);
leadsRouter.post('/create-product-structure', createProductStructureType);
leadsRouter.get("/get-all-product-types/:vendor_id", fetchAllProductTypes);
leadsRouter.delete("/delete-product-type/:id", removeProductType);
leadsRouter.get("/get-all-site-types/:vendor_id", fetchAllSiteTypes);
leadsRouter.delete("/delete-site-type/:id", removeSiteType);
leadsRouter.get("/get-all-productStructure-types/:vendor_id", fetchAllProductStructureTypes);
leadsRouter.delete("/delete-productStructure-type/:id", removeProductStructureType);
leadsRouter.get("/get-all-source-types/:vendor_id", fetchAllSourceTypes);
leadsRouter.delete("/delete-source-type/:id", removeSourceType);

leadsRouter.post("/create", upload.array("documents", 10), createLead);

// GET all leads by vendorId
leadsRouter.get("/get-vendor-leads/vendor/:vendorId", fetchLeadsByVendor);

// GET leads by vendorId and userId
leadsRouter.get("/get-vendor-user-leads/vendor/:vendorId/user/:userId", fetchLeadsByVendorAndUser);

leadsRouter.delete("/delete-lead/:id/user-id/:deletedBy", deleteLead);

leadsRouter.put('/update/:leadId/userId/:userId', updateLeadController);

export default leadsRouter;