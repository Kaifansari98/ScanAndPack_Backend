import { Request, Response } from "express";
import { createFranchise } from "../../services/franchise/franchise.service";

export const createFranchiseController = async (
  req: Request,
  res: Response
) => {
  try {
    const payload = req.body ?? {};
    const franchise = await createFranchise(payload);

    return res.status(201).json({
      success: true,
      message: "Franchise created successfully",
      data: franchise,
    });
  } catch (error: any) {
    console.error("Error creating franchise:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Internal server error while creating franchise",
    });
  }
};
