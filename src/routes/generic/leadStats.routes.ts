import { Router } from "express";
import { LeadStatsController } from "../../controllers/generic/leadStats.controller";

const Statsrouter = Router();

// GET /leads/stats/count/vendor/1?userId=5
Statsrouter.get("/count/vendor/:vendorId", LeadStatsController.getStats);

export default Statsrouter;