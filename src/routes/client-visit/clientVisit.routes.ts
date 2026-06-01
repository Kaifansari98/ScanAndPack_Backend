import { Router } from "express";
import { ClientVisitController } from "../../controllers/client-visit/clientVisit.controller";
import { uploadClientVisit } from "../../middlewares/uploadWasabi";

const clientVisitRouter = Router();
const clientVisitController = new ClientVisitController();

clientVisitRouter.get(
  "/leadId/:leadId",
  clientVisitController.getByLead,
);

clientVisitRouter.post(
  "/leadId/:leadId",
  uploadClientVisit.fields([
    { name: "documents", maxCount: 20 },
    { name: "payment_proof_documents", maxCount: 10 },
  ]),
  clientVisitController.create,
);

export default clientVisitRouter;
