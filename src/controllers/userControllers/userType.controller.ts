import { Request, Response } from "express";
import { createUserTypeService, getUserTypesService } from "../../services/userServices/userType.service";

export const createUserTypeController = async (req: Request, res: Response) => {
  try {
    const { user_type } = req.body;

    if (!user_type) return res.status(400).json({ message: "user_type is required" });

    const result = await createUserTypeService(user_type);
    res.status(201).json({ message: "User type created", data: result });
  } catch (error) {
    res.status(500).json({ message: "Failed to create user type", error });
  }
};

export const getUserTypesController = async (req: Request, res: Response) => {
  try {
    const result = await getUserTypesService();
    res.status(200).json({ message: "Fetched user types", data: result });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch user types", error });
  }
};
