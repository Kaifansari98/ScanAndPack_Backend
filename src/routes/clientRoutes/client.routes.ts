import { Router } from "express";
import {
    createClientController,
    getClientsListController,
    getClientController,
    updateClientController,
} from "../../controllers/clientControllers/client.controller";

const router = Router();

// POST /api/clients/create-client
router.post("/create-client", createClientController);
// GET /api/clients/list-clients
router.get("/list-clients", getClientsListController);
// GET /api/clients/get-client/:id
router.get("/get-client/:id", getClientController);
// PUT /api/clients/update-client/:id
router.put("/update-client/:id", updateClientController);

export default router;
