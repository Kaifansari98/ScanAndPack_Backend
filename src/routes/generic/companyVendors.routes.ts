import { Router } from "express";
import multer from "multer";
import { CompanyVendorsController } from "../../controllers/generic/CompanyVendorsController";

const upload = multer(); // 🧾 Handles multipart/form-data
const companyVendorsRoutes = Router();
const controller = new CompanyVendorsController();

// ✅ POST → Create a new company vendor (form-data)
companyVendorsRoutes.post(
  "/vendorId/:vendorId/create",
  upload.none(), // <— parses form-data fields into req.body
  controller.createCompanyVendor
);

// ✅ Fetch all company vendors by vendor_id
companyVendorsRoutes.get(
  "/vendorId/:vendorId",
  controller.getCompanyVendorsByVendorId
);

// ✅ Update company vendor details by vendor_id and company_vendor_id
companyVendorsRoutes.put(
  "/vendorId/:vendorId/companyVendorId/:companyVendorId/update",
  upload.none(), // handles form-data input
  controller.updateCompanyVendor
);

// ✅ Soft delete a company vendor
companyVendorsRoutes.delete(
  "/vendorId/:vendorId/companyVendorId/:companyVendorId/delete",
  upload.none(),
  controller.softDeleteCompanyVendor
);

export default companyVendorsRoutes;
