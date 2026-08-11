import { Router } from "express";
import { ThemeController } from "../../controllers/theme/theme.controller";

const router = Router();
const controller = new ThemeController();

/**
 * POST   /themes/vendorId/:vendorId               → create theme + mappings
 * GET    /themes/vendorId/:vendorId               → get all themes for vendor
 * GET    /themes/vendorId/:vendorId/active        → get active theme
 * GET    /themes/vendorId/:vendorId/themeId/:themeId          → get single theme
 * PUT    /themes/vendorId/:vendorId/themeId/:themeId/activate → set as active
 * PUT    /themes/vendorId/:vendorId/themeId/:themeId/mappings → update mappings
 * DELETE /themes/vendorId/:vendorId/themeId/:themeId          → delete theme
 */

router.post("/vendorId/:vendorId", controller.createTheme.bind(controller));
router.get("/vendorId/:vendorId", controller.getThemesByVendor.bind(controller));
router.get("/vendorId/:vendorId/active", controller.getActiveTheme.bind(controller));
router.get("/vendorId/:vendorId/themeId/:themeId", controller.getThemeById.bind(controller));
router.put("/vendorId/:vendorId/themeId/:themeId/activate", controller.setActiveTheme.bind(controller));
router.put("/vendorId/:vendorId/themeId/:themeId/mappings", controller.updateThemeMappings.bind(controller));
router.delete("/vendorId/:vendorId/themeId/:themeId", controller.deleteTheme.bind(controller));

export default router;
