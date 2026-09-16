import { Router } from "express";
import { cadbidIntegrationWithFurnixcrmController } from "../../controllers/cadbid-integration-with-furnixcrm/CadbidIntegrationWithFurnixcrm.controller";

const cadbidIntegrationWithFurnixcrmRoutes = Router();

cadbidIntegrationWithFurnixcrmRoutes.post(
  "/vendorId/:vendorId/leadId/:leadId/sync-external-customer",
  cadbidIntegrationWithFurnixcrmController.syncLeadCustomer,
);

export default cadbidIntegrationWithFurnixcrmRoutes;
