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