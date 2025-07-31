import { Request, Response } from "express";
import { createClient } from "../../services/clientServices/client.service";
import { CreateClientInput } from "../../types/client.types";

export const createClientController = async (req: Request, res: Response) => {
  try {
    const clientData: CreateClientInput = req.body;
    const newClient = await createClient(clientData);
    res.status(201).json({
      message: "Client created successfully",
      data: newClient,
    });
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to create client",
      error: error.message || error,
    });
  }
};
