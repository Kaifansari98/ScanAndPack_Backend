import { Router } from "express";
import multer from "multer";
import { CompanyVendorsController } from "../../controllers/generic/CompanyVendorsController";

const upload = multer(); // 🧾 Handles multipart/form-data
const companyVendorsRoutes = Router();
const controller = new CompanyVendorsController();

// ✅ Fetch all company vendors by vendor_id
companyVendorsRoutes.get(
  "/vendorId/:vendorId",
  controller.getCompanyVendorsByVendorId
);
companyVendorsRoutes.get(
  "/vendorId/:vendorId/master",
  controller.getCompanyVendorsByVendorIdForMaster
);

// ✅ Toggle company vendor status
companyVendorsRoutes.patch(
  "/vendorId/:vendorId/companyVendorId/:companyVendorId/status",
  upload.none(),
  controller.toggleCompanyVendorStatus
);

// ✅ REST endpoints for detailed company vendor
import { CompanyVendorsDetailedController } from "../../controllers/generic/CompanyVendorsDetailedController";
const detailedController = new CompanyVendorsDetailedController();

companyVendorsRoutes.get("/meta", detailedController.getCompanyVendorMetaData.bind(detailedController));
companyVendorsRoutes.post("/", upload.any(), detailedController.createDetailedCompanyVendor.bind(detailedController));
companyVendorsRoutes.get("/:id", detailedController.getDetailedCompanyVendorById.bind(detailedController));
companyVendorsRoutes.put("/:id", upload.any(), detailedController.updateDetailedCompanyVendor.bind(detailedController));
companyVendorsRoutes.delete("/:id", upload.none(), detailedController.deleteDetailedCompanyVendor.bind(detailedController));

export default companyVendorsRoutes;

