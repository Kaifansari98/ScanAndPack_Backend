import { Request, Response } from 'express';
import * as userService from '../../services/userServices/user.service';

export const createUserController = async (req: Request, res: Response) => {
  try {
    const newUser = await userService.createUserService(req.body);
    res.status(201).json({ message: "User created", data: newUser });
  } catch (error) {
    res.status(500).json({ message: "Failed to create user", error });
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