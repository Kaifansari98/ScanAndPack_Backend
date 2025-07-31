import { Router } from "express";
import { 
    createClientController,
} from "../../controllers/clientControllers/client.controller";

const router = Router();

// POST /api/clients
router.post("/create-client", createClientController);

export default router;