import { Request, Response } from "express";
import { ArchitectureMasterService } from "../../services/architectureMasterServices/architectureMaster.service";
import { ApiResponse } from "../../utils/apiResponse";

const architectureMasterService = new ArchitectureMasterService();

export class ArchitectureMasterController {
  /**
   * Create Architecture Master
   */
  async create(req: Request, res: Response) {
    try {
      const { vendorId, name, email, mobile, is_active } = req.body;
      
      // Basic validation
      if (!name || !email || !mobile) {
        return res.status(400).json(ApiResponse.validationError("Name, email, and mobile are required"));
      }

      // We might want to use req.user for created_by if auth middleware sets it
      const created_by = (req as any).user?.id;

      const newArchitecture = await architectureMasterService.createArchitectureMaster({
        vendorId,
        name,
        email,
        mobile,
        is_active,
        created_by
      });

      return res.status(201).json(ApiResponse.created(newArchitecture, "Architecture master created successfully"));
    } catch (error: any) {
      return res.status(500).json(ApiResponse.error(error.message || "Failed to create architecture master"));
    }
  }

  /**
   * Get List of Architecture Masters with Pagination
   */
  async getList(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string | undefined;

      const result = await architectureMasterService.getAllArchitectureMasters(page, limit, search);
      return res.status(200).json(ApiResponse.success(result, "Architecture masters fetched successfully"));
    } catch (error: any) {
      return res.status(500).json(ApiResponse.error(error.message || "Failed to fetch architecture masters"));
    }
  }

  /**
   * Get Single Architecture Master by ID
   */
  async getSingle(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      
      const architecture = await architectureMasterService.getArchitectureMasterById(id);
      
      if (!architecture) {
        return res.status(404).json(ApiResponse.notFound("Architecture master not found"));
      }

      return res.status(200).json(ApiResponse.success(architecture, "Architecture master fetched successfully"));
    } catch (error: any) {
      return res.status(500).json(ApiResponse.error(error.message || "Failed to fetch architecture master"));
    }
  }

  /**
   * Update Architecture Master
   */
  async update(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const { vendorId, name, email, mobile, is_active } = req.body;

      // Check if it exists
      const existing = await architectureMasterService.getArchitectureMasterById(id);
      if (!existing) {
        return res.status(404).json(ApiResponse.notFound("Architecture master not found"));
      }

      const updated = await architectureMasterService.updateArchitectureMaster(id, {
        vendorId,
        name,
        email,
        mobile,
        is_active
      });

      return res.status(200).json(ApiResponse.success(updated, "Architecture master updated successfully"));
    } catch (error: any) {
      return res.status(500).json(ApiResponse.error(error.message || "Failed to update architecture master"));
    }
  }

  /**
   * Delete Architecture Master
   */
  async delete(req: Request, res: Response) {
    try {
      const id = String(req.params.id);

      // Check if it exists
      const existing = await architectureMasterService.getArchitectureMasterById(id);
      if (!existing) {
        return res.status(404).json(ApiResponse.notFound("Architecture master not found"));
      }

      const deletedBy = (req as any).user?.id;
      
      await architectureMasterService.deleteArchitectureMaster(id, deletedBy);

      return res.status(200).json(ApiResponse.success(null, "Architecture master deleted successfully"));
    } catch (error: any) {
      return res.status(500).json(ApiResponse.error(error.message || "Failed to delete architecture master"));
    }
  }
  /**
   * Update Architecture Master Status
   */
  async updateStatus(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const { is_active } = req.body;

      if (is_active === undefined) {
        return res.status(400).json(ApiResponse.validationError("is_active is required"));
      }

      // Check if it exists
      const existing = await architectureMasterService.getArchitectureMasterById(id);
      if (!existing) {
        return res.status(404).json(ApiResponse.notFound("Architecture master not found"));
      }

      const updated = await architectureMasterService.updateArchitectureMasterStatus(id, is_active);

      return res.status(200).json(ApiResponse.success(updated, "Architecture master status updated successfully"));
    } catch (error: any) {
      return res.status(500).json(ApiResponse.error(error.message || "Failed to update architecture master status"));
    }
  }

  /**
   * Get Architect List for Dropdowns
   */
  async getArchitectsList(req: Request, res: Response) {
    try {
      const vendorId = req.params.vendorId || (req as any).user?.vendor_id;
      
      if (!vendorId) {
        return res.status(400).json(ApiResponse.validationError("Vendor ID is required"));
      }

      const list = await architectureMasterService.getArchitectsList(vendorId);
      return res.status(200).json(ApiResponse.success(list, "Architects list fetched successfully"));
    } catch (error: any) {
      return res.status(500).json(ApiResponse.error(error.message || "Failed to fetch architects list"));
    }
  }
}
