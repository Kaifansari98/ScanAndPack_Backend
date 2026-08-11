import { Request, Response } from "express";
import { CompanyVendorsService } from "../../services/generic/companyVendors.service";

const service = new CompanyVendorsService();

export class CompanyVendorsController {

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

  async getCompanyVendorsByVendorIdForMaster(req: Request, res: Response) {
    try {
      const { vendorId } = req.params;

      const vendors = await service.getCompanyVendorsByVendorIdForMaster(
        Number(vendorId)
      );

      return res.status(200).json({
        success: true,
        message: "Company vendors fetched successfully",
        data: vendors,
      });
    } catch (error: any) {
      console.error("Error fetching company vendors for master:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while fetching company vendors",
      });
    }
  }


  async toggleCompanyVendorStatus(req: Request, res: Response) {
    try {
      const { vendorId, companyVendorId } = req.params;
      const { updated_by, is_deleted } = req.body;

      const updatedVendor = await service.toggleCompanyVendorStatus(
        Number(vendorId),
        Number(companyVendorId),
        Number(updated_by),
        Boolean(is_deleted)
      );

      return res.status(200).json({
        success: true,
        message: "Company vendor status updated successfully",
        data: updatedVendor,
      });
    } catch (error: any) {
      console.error("Error updating company vendor status:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while updating company vendor status",
      });
    }
  }
}
