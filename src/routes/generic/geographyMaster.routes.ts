import { Router } from "express";
import { createGeographyMastersController } from "../../controllers/generic/geographyMaster.controller";

const geographyMasterRoutes = Router();

// Single API to add multiple rows across geography masters
geographyMasterRoutes.post("/bulk", createGeographyMastersController);

export default geographyMasterRoutes;
