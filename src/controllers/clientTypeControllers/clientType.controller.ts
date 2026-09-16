import { Request, Response } from "express";
import {
  createClientType,
  getClientTypesList,
} from "../../services/clientTypeServices/clientType.service";
import { ApiResponse } from "../../utils/apiResponse";

export const createClientTypeController = async (req: Request, res: Response) => {
  try {
    const { vendor_id, type } = req.body;

    if (!vendor_id || !type) {
      return res.status(400).json(ApiResponse.validationError("vendor_id and type are required"));
    }

    const newClientType = await createClientType(Number(vendor_id), String(type).trim());
    return res.status(201).json(ApiResponse.created(newClientType, "Client type created successfully"));
  } catch (error: any) {
    return res.status(500).json(ApiResponse.error(error.message || "Failed to create client type"));
  }
};

export const getClientTypesListController = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.params.vendorId);

    if (!vendor_id) {
      return res.status(400).json(ApiResponse.validationError("vendor_id is required"));
    }

    const list = await getClientTypesList(vendor_id);
    return res.status(200).json(ApiResponse.success(list, "Client types fetched successfully"));
  } catch (error: any) {
    return res.status(500).json(ApiResponse.error(error.message || "Failed to fetch client types"));
  }
};
