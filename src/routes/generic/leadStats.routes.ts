import { Router } from "express";
import { LeadStatsController } from "../../controllers/generic/leadStats.controller";

const Statsrouter = Router();

// GET  
Statsrouter.get("/count/vendor/:vendorId", LeadStatsController.getStats);

export default Statsrouter;