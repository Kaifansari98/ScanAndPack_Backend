import { Router } from "express";
import { createProductType, fetchAllProductTypes, removeProductType } from "../../controllers/leadModuleControllers/productType.controller";
import { createSiteType, fetchAllSiteTypes, removeSiteType } from "../../controllers/leadModuleControllers/siteType.controller";
import { createSourceType, fetchAllSourceTypes, removeSourceType } from "../../controllers/leadModuleControllers/sourceType.controller";
import { createProductStructureType, fetchAllProductStructureTypes, removeProductStructureType } from "../../controllers/leadModuleControllers/productStructureType.controller";
import { upload } from "../../middlewares/upload.middleware";
import { leadController } from "../../controllers/leadModuleControllers/leadsGeneration/leadGeneration.controller";

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

leadsRouter.post("/create", upload.array("documents", 10), leadController.createLead);

// GET all leads by vendorId
leadsRouter.get("/get-vendor-leads/vendor/:vendorId", leadController.fetchLeadsByVendor);

// GET leads by vendorId and userId
leadsRouter.get("/get-vendor-user-leads/vendor/:vendorId/user/:userId", leadController.fetchLeadsByVendorAndUser);

leadsRouter.delete("/delete-lead/:id/user-id/:deletedBy", leadController.deleteLead);

leadsRouter.put('/update/:leadId/userId/:userId', leadController.updateLead);

// GET /api/sales-executives/vendor/:vendorId
// Fetch all sales executives for a specific vendor
leadsRouter.get("/sales-executives/vendor/:vendorId", leadController.fetchSalesExecutivesByVendor);

/**
 * Lead Assignment Routes
 * Base path: /api/leads/assignment
 * 
 * All routes require admin or super-admin authentication
 * These routes should be protected by authentication middleware
 */
// PUT /api/leads/assignment/vendor/:vendorId/lead/:leadId
// Assign a lead to a sales executive
// Only accessible to admin and super-admin users
leadsRouter.put(
    "/sales-executives/vendor/:vendorId/lead/:leadId",
    // Add authentication middleware here: authMiddleware,
    // Add role-based middleware here: requireRole(['admin', 'super-admin']),
    leadController.assignLead
);

// GET /api/leads/assignment/vendor/:vendorId/lead/:leadId/history
// Get lead assignment history (optional feature)
leadsRouter.get(
    "/sales-executives/vendor/:vendorId/lead/:leadId/history",
    // Add authentication middleware here: authMiddleware,
    // Add role-based middleware here: requireRole(['admin', 'super-admin']),
    leadController.getLeadAssignmentHistory
);

export default leadsRouter;