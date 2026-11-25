import { NextFunction, Request, Response } from "express";
import multer from "multer";
import logger from "../../utils/logger";
import { CHAT_MAX_FILE_SIZE, ChatError } from "./clientChat.service";

// Express helpers shared by the client-app and staff client-chat routers.

export const positiveId = (value: unknown, label = "ID") => {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new ChatError(`A valid ${label} is required.`);
  return n;
};

/** Multipart requests carry their JSON fields in "data"; plain JSON otherwise. */
export const bodyOf = (req: Request): Record<string, unknown> => {
  if (typeof req.body?.data === "string") {
    try {
      return JSON.parse(req.body.data);
    } catch {
      throw new ChatError("Invalid message details.");
    }
  }
  return req.body ?? {};
};

export const chatHandler =
  (label: string, fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
    try {
      res.json({ success: true, data: await fn(req, res) });
    } catch (error) {
      if (error instanceof ChatError) return res.status(error.statusCode).json({ success: false, message: error.message });
      logger.error(`[client-chat] ${label}`, error);
      res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
    }
  };

const single = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CHAT_MAX_FILE_SIZE, files: 1, fields: 2 },
}).single("file");

export const chatUpload = (req: Request, res: Response, next: NextFunction) =>
  single(req, res, (error) =>
    error
      ? res.status(400).json({
          success: false,
          message: error.code === "LIMIT_FILE_SIZE" ? "That file is too large (max 25 MB)." : error.message,
        })
      : next(),
  );
