import { Request, Response } from 'express';
import * as userService from '../../services/userServices/user.service';

export const createUserController = async (req: Request, res: Response) => {
  try {
    const newUser = await userService.createUserService(req.body);
    res.status(201).json({ message: "User created", data: newUser });
  } catch (error: any) {
    res
      .status(error.statusCode || 500)
      .json({ message: "Failed to create user", error: error.message || error });
  }
};

export const masterResetPasswordController = async (
  req: Request,
  res: Response
) => {
  try {
    const { user_id, new_password } = req.body;

    if (!user_id || !new_password) {
      return res.status(400).json({
        success: false,
        message: "user_id and new_password are required",
      });
    }

    const result = await userService.MasterResetPasswordService({
      user_id: Number(user_id),
      new_password,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to reset password",
    });
  }
};

export const updateUserController = async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId) {
      return res.status(400).json({ success: false, message: "userId is required" });
    }

    const result = await userService.updateUserService(userId, req.body);
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to update user",
    });
  }
};

export const getUsersByVendorController = async (req: Request, res: Response) => {
  try {
    const vendorId = Number(req.params.vendorId);
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    const search = String(req.query.search ?? "");
    const franchise_id = req.query.franchise_id ? Number(req.query.franchise_id) : undefined;

    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: "vendorId is required",
      });
    }

    const users = await userService.getUsersByVendorService({
      vendorId,
      page,
      limit,
      search,
      franchise_id,
    });

    return res.status(200).json({
      success: true,
      count: users.count,
      data: users.data,
      pagination: users.pagination,
    });
  } catch (error: any) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch users",
    });
  }
};
