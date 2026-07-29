import { Request, Response } from "express";
import {
  createClient,
  getClientsList,
  getClientById,
  updateClient,
} from "../../services/clientServices/client.service";
import { CreateClientInput, UpdateClientInput } from "../../types/client.types";
import { ApiResponse } from "../../utils/apiResponse";

export const createClientController = async (req: Request, res: Response) => {
  try {
    const clientData: CreateClientInput = req.body;

    if (!clientData.vendor_id) {
      return res.status(400).json(ApiResponse.validationError("vendor_id is required"));
    }

    const newClient = await createClient(clientData);
    return res.status(201).json(ApiResponse.created(newClient, "Client created successfully"));
  } catch (error: any) {
    return res.status(500).json(ApiResponse.error(error.message || "Failed to create client"));
  }
};

export const getClientsListController = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.query.vendor_id);
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string | undefined;

    if (!vendor_id) {
      return res.status(400).json(ApiResponse.validationError("vendor_id is required"));
    }

    const result = await getClientsList(vendor_id, page, limit, search);
    return res.status(200).json(ApiResponse.success(result, "Clients fetched successfully"));
  } catch (error: any) {
    return res.status(500).json(ApiResponse.error(error.message || "Failed to fetch clients"));
  }
};

export const getClientController = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.query.vendor_id);
    const id = Number(req.params.id);

    if (!vendor_id) {
      return res.status(400).json(ApiResponse.validationError("vendor_id is required"));
    }

    const client = await getClientById(vendor_id, id);
    if (!client) {
      return res.status(404).json(ApiResponse.notFound("Client not found"));
    }

    return res.status(200).json(ApiResponse.success(client, "Client fetched successfully"));
  } catch (error: any) {
    return res.status(500).json(ApiResponse.error(error.message || "Failed to fetch client"));
  }
};

export const updateClientController = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const data: UpdateClientInput = req.body;

    const updated = await updateClient(id, data);
    return res.status(200).json(ApiResponse.success(updated, "Client updated successfully"));
  } catch (error: any) {
    return res.status(500).json(ApiResponse.error(error.message || "Failed to update client"));
  }
};
