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

  async createCompanyVendorsBulk(req: Request, res: Response) {
    try {
      const { vendorId } = req.params;

      let payload: any;

      if (req.body.data) {
        try {
          payload = JSON.parse(req.body.data);
        } catch {
          return res.status(400).json({
            success: false,
            message: "Invalid JSON in 'data' field",
          });
        }
      } else {
        payload = req.body;
      }

      if (!Array.isArray(payload)) {
        return res.status(400).json({
          success: false,
          message: "Expected an array of company vendor objects",
        });
      }

      const result = await service.createCompanyVendorsBulk(
        Number(vendorId),
        payload
      );

      return res.status(201).json({
        success: true,
        message: "Company vendors created successfully",
        data: result,
      });
    } catch (error: any) {
      console.error("Error creating company vendors (bulk):", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while creating company vendors",
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
