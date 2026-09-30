import { Request, Response } from "express";
import { ThemeService } from "../../services/theme/theme.service";
import { ApiResponse } from "../../utils/apiResponse";

export class ThemeController {
  /**
   * POST /themes/vendorId/:vendorId
   * Create a new theme with mappings
   */
  async createTheme(req: Request, res: Response) {
    try {
      const vendor_id = Number(req.params.vendorId);
      const { name, mappings } = req.body;

      if (!vendor_id || !name) {
        return res
          .status(400)
          .json(ApiResponse.error("vendor_id and name are required", 400));
      }

      if (!Array.isArray(mappings) || mappings.length === 0) {
        return res
          .status(400)
          .json(ApiResponse.error("mappings array is required and must not be empty", 400));
      }

      const theme = await ThemeService.createTheme({ vendor_id, name, mappings });

      return res
        .status(201)
        .json(ApiResponse.created(theme, "Theme created successfully"));
    } catch (error: any) {
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error", 500));
    }
  }

  /**
   * GET /themes/vendorId/:vendorId
   * Get all themes for a vendor
   */
  async getThemesByVendor(req: Request, res: Response) {
    try {
      const vendor_id = Number(req.params.vendorId);

      if (!vendor_id) {
        return res
          .status(400)
          .json(ApiResponse.error("vendor_id is required", 400));
      }

      const themes = await ThemeService.getThemesByVendor(vendor_id);

      return res
        .status(200)
        .json(ApiResponse.success(themes, "Themes fetched successfully"));
    } catch (error: any) {
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error", 500));
    }
  }

  /**
   * GET /themes/vendorId/:vendorId/themeId/:themeId
   * Get a single theme by id
   */
  async getThemeById(req: Request, res: Response) {
    try {
      const vendor_id = Number(req.params.vendorId);
      const theme_id = Number(req.params.themeId);

      if (!vendor_id || !theme_id) {
        return res
          .status(400)
          .json(ApiResponse.error("vendor_id and theme_id are required", 400));
      }

      const theme = await ThemeService.getThemeById(vendor_id, theme_id);

      if (!theme) {
        return res
          .status(404)
          .json(ApiResponse.error("Theme not found", 404));
      }

      return res
        .status(200)
        .json(ApiResponse.success(theme, "Theme fetched successfully"));
    } catch (error: any) {
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error", 500));
    }
  }

  /**
   * GET /themes/vendorId/:vendorId/active
   * Get the active theme for a vendor
   */
  async getActiveTheme(req: Request, res: Response) {
    try {
      const vendor_id = Number(req.params.vendorId);

      if (!vendor_id) {
        return res
          .status(400)
          .json(ApiResponse.error("vendor_id is required", 400));
      }

      const theme = await ThemeService.getActiveTheme(vendor_id);

      return res
        .status(200)
        .json(ApiResponse.success(theme, "Active theme fetched successfully"));
    } catch (error: any) {
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error", 500));
    }
  }

  /**
   * PUT /themes/vendorId/:vendorId/themeId/:themeId/activate
   * Set a theme as active
   */
  async setActiveTheme(req: Request, res: Response) {
    try {
      const vendor_id = Number(req.params.vendorId);
      const theme_id = Number(req.params.themeId);

      if (!vendor_id || !theme_id) {
        return res
          .status(400)
          .json(ApiResponse.error("vendor_id and theme_id are required", 400));
      }

      const theme = await ThemeService.setActiveTheme(vendor_id, theme_id);

      return res
        .status(200)
        .json(ApiResponse.success(theme, "Theme activated successfully"));
    } catch (error: any) {
      return res
        .status(error.message === "Theme not found" ? 404 : 500)
        .json(ApiResponse.error(error.message || "Internal server error"));
    }
  }

  /**
   * PUT /themes/vendorId/:vendorId/themeId/:themeId/mappings
   * Update (upsert) mappings for a theme
   */
  async updateThemeMappings(req: Request, res: Response) {
    try {
      const vendor_id = Number(req.params.vendorId);
      const theme_id = Number(req.params.themeId);
      const { mappings } = req.body;

      if (!vendor_id || !theme_id) {
        return res
          .status(400)
          .json(ApiResponse.error("vendor_id and theme_id are required", 400));
      }

      if (!Array.isArray(mappings) || mappings.length === 0) {
        return res
          .status(400)
          .json(ApiResponse.error("mappings array is required", 400));
      }

      const theme = await ThemeService.updateThemeMappings(vendor_id, theme_id, mappings);

      return res
        .status(200)
        .json(ApiResponse.success(theme, "Theme mappings updated successfully"));
    } catch (error: any) {
      return res
        .status(error.message === "Theme not found" ? 404 : 500)
        .json(ApiResponse.error(error.message || "Internal server error"));
    }
  }

  /**
   * DELETE /themes/vendorId/:vendorId/themeId/:themeId
   * Delete a theme
   */
  async deleteTheme(req: Request, res: Response) {
    try {
      const vendor_id = Number(req.params.vendorId);
      const theme_id = Number(req.params.themeId);

      if (!vendor_id || !theme_id) {
        return res
          .status(400)
          .json(ApiResponse.error("vendor_id and theme_id are required", 400));
      }

      await ThemeService.deleteTheme(vendor_id, theme_id);

      return res
        .status(200)
        .json(ApiResponse.success(null, "Theme deleted successfully"));
    } catch (error: any) {
      return res
        .status(error.message === "Theme not found" ? 404 : 500)
        .json(ApiResponse.error(error.message || "Internal server error"));
    }
  }
}
