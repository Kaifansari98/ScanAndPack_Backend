import { Request, Response, NextFunction } from "express";
import { AuthService } from "../services/auth/auth.service";

const authService = new AuthService();

export const verifyToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Access token missing" });
  }

  try {
    const decoded = await authService.verifySessionToken(token);
    (req as any).user = decoded;
    next();
  } catch (err: any) {
    return res
      .status(err?.statusCode || 403)
      .json({ message: err?.message || "Invalid token" });
  }
};
