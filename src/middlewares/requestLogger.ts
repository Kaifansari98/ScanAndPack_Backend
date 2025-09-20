// src/middleware/requestLogger.ts
import expressWinston from "express-winston";
import logger from "../utils/logger";

export const requestLogger = expressWinston.logger({
  winstonInstance: logger,
  level: (req, res) => {
    // elevate level for server errors
    if (res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  meta: true,
  // keep logs compact but useful
  msg: "{{req.method}} {{req.url}} {{res.statusCode}} {{res.responseTime}}ms",
  colorize: true,
  requestWhitelist: ["method", "url", "headers", "httpVersion", "ip", "query", "body"],
  responseWhitelist: ["statusCode", "responseTime"],
  // redact sensitive data
  dynamicMeta: (req) => {
    const headers = { ...req.headers };
    delete headers.authorization;
    delete headers.cookie;
    return { reqId: (req as any).id, headers };
  },
});

export const errorLogger = expressWinston.errorLogger({
  winstonInstance: logger,
  level: "error",
});