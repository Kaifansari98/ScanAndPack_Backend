import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { AuthService } from "../services/auth/auth.service";

dotenv.config();

const authService = new AuthService();
const secret = process.env.JWT_SECRET || "supersecretkey";

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
    return next();
  } catch (err: any) {
    try {
      const legacyDecoded = jwt.verify(token, secret) as any;
      if (legacyDecoded && !legacyDecoded.session_id) {
        (req as any).user = legacyDecoded;
        return next();
      }
    } catch {}

    return res
      .status(err?.statusCode || 403)
      .json({ message: err?.message || "Invalid token" });
  }
};
