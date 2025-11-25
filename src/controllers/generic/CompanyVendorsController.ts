import { Request, Response } from "express";
import { CompanyVendorsService } from "../../services/generic/companyVendors.service";

const service = new CompanyVendorsService();

export class CompanyVendorsController {
  async createCompanyVendor(req: Request, res: Response) {
    try {
      const { vendorId } = req.params;
      const payload = req.body;

      const newVendor = await service.createCompanyVendor(
        Number(vendorId),
        payload
      );

      return res.status(201).json({
        success: true,
        message: "Company vendor created successfully",
        data: newVendor,
      });
    } catch (error: any) {
      console.error("Error creating company vendor:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while creating company vendor",
      });
    }
  }

  async getCompanyVendorsByVendorId(req: Request, res: Response) {
    try {
      const { vendorId } = req.params;

      const vendors = await service.getCompanyVendorsByVendorId(
        Number(vendorId)
      );

      return res.status(200).json({
        success: true,
        message: "Company vendors fetched successfully",
        data: vendors,
      });
    } catch (error: any) {
      console.error("Error fetching company vendors:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while fetching company vendors",
      });
    }
  }

  async updateCompanyVendor(req: Request, res: Response) {
    try {
      const { vendorId, companyVendorId } = req.params;
      const payload = req.body;

      const updatedVendor = await service.updateCompanyVendor(
        Number(vendorId),
        Number(companyVendorId),
        payload
      );

      return res.status(200).json({
        success: true,
        message: "Company vendor updated successfully",
        data: updatedVendor,
      });
    } catch (error: any) {
      console.error("Error updating company vendor:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while updating company vendor",
      });
    }
  }

  async softDeleteCompanyVendor(req: Request, res: Response) {
    try {
      const { vendorId, companyVendorId } = req.params;
      const { deleted_by } = req.body;

      const deletedVendor = await service.softDeleteCompanyVendor(
        Number(vendorId),
        Number(companyVendorId),
        Number(deleted_by)
      );

      return res.status(200).json({
        success: true,
        message: "Company vendor deleted successfully (soft delete)",
        data: deletedVendor,
      });
    } catch (error: any) {
      console.error("Error deleting company vendor:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while deleting company vendor",
      });
    }
  }
}
