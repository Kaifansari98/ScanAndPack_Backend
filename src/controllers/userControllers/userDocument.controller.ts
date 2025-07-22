import { Request, Response } from "express";
import {
  createUserDocumentService,
  getUserDocumentsByUserIdService,
  deleteUserDocumentService,
} from "../../services/userServices/userDocument.service";

export const createUserDocumentController = async (req: Request, res: Response) => {
  try {
    const { user_id, document_name, document_number, filename } = req.body;

    if (!user_id || !document_name || !document_number || !filename) {
      return res.status(400).json({ message: "Missing required fields" });  
    }

    const result = await createUserDocumentService({ user_id, document_name, document_number, filename });

    res.status(201).json({ message: "Document uploaded", data: result });
  } catch (error) {
    res.status(500).json({ message: "Failed to upload document", error });
  }
};

export const getUserDocumentsByUserIdController = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const result = await getUserDocumentsByUserIdService(parseInt(userId));
    res.status(200).json({ message: "Documents fetched", data: result });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch documents", error });
  }
};

export const deleteUserDocumentController = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await deleteUserDocumentService(parseInt(id));
    res.status(200).json({ message: "Document deleted", data: result });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete document", error });
  }
};