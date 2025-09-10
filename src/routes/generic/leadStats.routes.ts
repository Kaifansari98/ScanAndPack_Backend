import { Router } from "express";
import { LeadStatsController } from "../../controllers/generic/leadStats.controller";

const Statsrouter = Router();

// GET route with optional userId query parameter
// Usage examples:
// GET /leads/stats/count/vendor/1 - Gets all leads for vendor 1 (admin/super-admin view)
// GET /leads/stats/count/vendor/1?userId=5 - Gets filtered leads based on user 5's role
Statsrouter.get("/count/vendor/:vendorId", LeadStatsController.getStats);

export default Statsrouter;