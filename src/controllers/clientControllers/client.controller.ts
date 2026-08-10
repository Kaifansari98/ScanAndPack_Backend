import { Request, Response } from "express";
import {
  createClient,
  getClientsList,
  getClientById,
  updateClient,
} from "../../services/clientServices/client.service";
import { CreateClientInput, UpdateClientInput } from "../../types/client.types";
import { ApiResponse } from "../../utils/apiResponse";

const resolveUserId = (req: Request, bodyData: any): number | undefined => {
  const userId =
    Number(req.headers["x-user-id"] || req.headers["user_id"]) ||
    Number((req as any).user?.id || (req as any).user?.user_id) ||
    Number(bodyData?.created_by || bodyData?.updated_by || bodyData?.userId || bodyData?.user_id);
  return isNaN(userId) || userId === 0 ? undefined : userId;
};

export const createClientController = async (req: Request, res: Response) => {
  try {
    const clientData: CreateClientInput = { ...req.body };
    const userId = resolveUserId(req, req.body);

    if (typeof clientData.vendor_id === "string") {
      clientData.vendor_id = Number(clientData.vendor_id);
    }
    if (typeof clientData.client_type_id === "string" && clientData.client_type_id) {
      clientData.client_type_id = Number(clientData.client_type_id);
    }
    if (typeof (clientData as any).is_active !== "undefined") {
      clientData.is_active = (clientData as any).is_active === true || (clientData as any).is_active === "true";
    }
    if (typeof req.body.bankAccounts === "string") {
      try {
        clientData.bankAccounts = JSON.parse(req.body.bankAccounts);
      } catch (e) {
        console.error("Failed to parse bankAccounts JSON string in createClientController", e);
      }
    }

    if (userId) {
      (clientData as any).created_by = userId;
    }

    if (!clientData.vendor_id) {
      return res.status(400).json(ApiResponse.validationError("vendor_id is required"));
    }

    const newClient = await createClient(clientData, req.files, userId);
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
    const activeOnly = req.query.activeOnly === "true";

    if (!vendor_id) {
      return res.status(400).json(ApiResponse.validationError("vendor_id is required"));
    }

    const result = await getClientsList(vendor_id, page, limit, search, activeOnly);
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
    const data: UpdateClientInput = { ...req.body };
    const userId = resolveUserId(req, req.body);

    if (typeof data.client_type_id === "string" && data.client_type_id) {
      data.client_type_id = Number(data.client_type_id);
    }
    if (typeof (data as any).is_active !== "undefined") {
      data.is_active = (data as any).is_active === true || (data as any).is_active === "true";
    }
    if (typeof req.body.bankAccounts === "string") {
      try {
        data.bankAccounts = JSON.parse(req.body.bankAccounts);
      } catch (e) {
        console.error("Failed to parse bankAccounts JSON string in updateClientController", e);
      }
    }

    if (userId) {
      (data as any).updated_by = userId;
    }

    const updated = await updateClient(id, data, req.files, userId);
    return res.status(200).json(ApiResponse.success(updated, "Client updated successfully"));
  } catch (error: any) {
    return res.status(500).json(ApiResponse.error(error.message || "Failed to update client"));
  }
};
