import { NextFunction, Request, Response } from "express";
import { ClientTokenPayload, verifyClientToken } from "../services/auth.service";

/** Accepts only app client tokens; the decoded payload is stored on `res.locals.client`. */
export const requireClient = (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ message: "Access token missing" });

  try {
    res.locals.client = verifyClientToken(token);
    return next();
  } catch {
    return res.status(401).json({ message: "Session expired. Please sign in again." });
  }
};

export const clientFrom = (res: Response) => res.locals.client as ClientTokenPayload;
