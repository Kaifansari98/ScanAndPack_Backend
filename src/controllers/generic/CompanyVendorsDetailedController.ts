import { Request, Response } from "express";
import { CompanyVendorsDetailedService } from "../../services/generic/companyVendorsDetailed.service";
import { validateCompanyVendorFile } from "../../utils/wasabiClient";

const service = new CompanyVendorsDetailedService();

export class CompanyVendorsDetailedController {
  /**
   * Helper to resolve vendorId and userId from request
   */
  private resolveIds(req: Request) {
    // Parse data JSON if it was stringified for form-data
    let bodyData: any = {};
    if (req.body && req.body.data) {
      try {
        bodyData = JSON.parse(req.body.data);
      } catch (e) {
        bodyData = {};
      }
    } else {
      bodyData = req.body || {};
    }

    const vendorId =
      Number(req.headers["x-vendor-id"] || req.headers["vendor_id"]) ||
      Number(req.query.vendor_id || req.query.vendorId) ||
      Number(bodyData.vendor_id || bodyData.vendorId);

    const userId =
      Number(req.headers["x-user-id"] || req.headers["user_id"]) ||
      Number(req.query.user_id || req.query.userId) ||
      Number(bodyData.created_by || bodyData.updated_by || bodyData.userId);

    return { vendorId, userId };
  }

  /**
   * Helper to group and validate uploaded files
   */
  private getAndValidateFiles(req: Request) {
    const filesDict: { [fieldname: string]: Express.Multer.File[] } = {};
    const filesList = req.files as Express.Multer.File[] || [];

    if (Array.isArray(filesList)) {
      filesList.forEach((file) => {
        // Validate MIME type, extension and size (max 5MB)
        validateCompanyVendorFile(file);
        if (!filesDict[file.fieldname]) {
          filesDict[file.fieldname] = [];
        }
        filesDict[file.fieldname].push(file);
      });
    }

    return filesDict;
  }

  /**
   * Fetch meta data dropdown options
   */
  async getCompanyVendorMetaData(req: Request, res: Response) {
    try {
      const { vendorId } = this.resolveIds(req);
      if (!vendorId) {
        return res.status(400).json({ success: false, message: "vendor_id is required" });
      }

      const meta = await service.getCompanyVendorMetaData(vendorId);

      return res.status(200).json({
        success: true,
        message: "Metadata fetched successfully",
        data: meta,
      });
    } catch (error: any) {
      console.error("Error fetching vendor meta:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to fetch metadata",
      });
    }
  }

  /**
   * Get single company vendor by ID
   */
  async getDetailedCompanyVendorById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ success: false, message: "vendor id param is required" });
      }

      const vendor = await service.getDetailedCompanyVendorById(Number(id));

      return res.status(200).json({
        success: true,
        message: "Detailed company vendor fetched successfully",
        data: vendor,
      });
    } catch (error: any) {
      console.error("Error fetching detailed company vendor:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to fetch company vendor details",
      });
    }
  }

  /**
   * Create a new detailed company vendor
   */
  async createDetailedCompanyVendor(req: Request, res: Response) {
    try {
      const { vendorId, userId } = this.resolveIds(req);

      if (!vendorId) {
        return res.status(400).json({ success: false, message: "vendor_id is required" });
      }
      if (!userId) {
        return res.status(400).json({ success: false, message: "user_id is required" });
      }

      // Group and validate uploaded files
      const files = this.getAndValidateFiles(req);

      const newVendor = await service.createDetailedCompanyVendor(
        vendorId,
        req.body,
        files,
        userId
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
        message: error.message || "Failed to create company vendor",
      });
    }
  }

  /**
   * Update detailed company vendor details
   */
  async updateDetailedCompanyVendor(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { vendorId, userId } = this.resolveIds(req);

      if (!id) {
        return res.status(400).json({ success: false, message: "vendor id param is required" });
      }
      if (!vendorId) {
        return res.status(400).json({ success: false, message: "vendor_id is required" });
      }
      if (!userId) {
        return res.status(400).json({ success: false, message: "user_id is required" });
      }

      // Group and validate uploaded files
      const files = this.getAndValidateFiles(req);

      const updated = await service.updateDetailedCompanyVendor(
        vendorId,
        Number(id),
        req.body,
        files,
        userId
      );

      return res.status(200).json({
        success: true,
        message: "Company vendor updated successfully",
        data: updated,
      });
    } catch (error: any) {
      console.error("Error updating company vendor:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to update company vendor",
      });
    }
  }

  /**
   * Delete company vendor
   */
  async deleteDetailedCompanyVendor(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { vendorId, userId } = this.resolveIds(req);

      if (!id) {
        return res.status(400).json({ success: false, message: "vendor id param is required" });
      }
      if (!vendorId) {
        return res.status(400).json({ success: false, message: "vendor_id is required" });
      }
      if (!userId) {
        return res.status(400).json({ success: false, message: "user_id is required" });
      }

      const deleted = await service.deleteDetailedCompanyVendor(
        vendorId,
        Number(id),
        userId
      );

      return res.status(200).json({
        success: true,
        message: "Company vendor deleted successfully",
        data: deleted,
      });
    } catch (error: any) {
      console.error("Error deleting company vendor:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to delete company vendor",
      });
    }
  }
}
