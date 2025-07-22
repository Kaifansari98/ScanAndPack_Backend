import { Router } from "express";
import {
  createUserDocumentController,
  getUserDocumentsByUserIdController,
  deleteUserDocumentController,
} from "../../controllers/userControllers/userDocument.controller";

const router = Router();

router.post("/add-documents", createUserDocumentController); // Add document
router.get("/:userId", getUserDocumentsByUserIdController); // Get docs for a user
router.delete("/:id", deleteUserDocumentController); // Delete a specific document

export default router;