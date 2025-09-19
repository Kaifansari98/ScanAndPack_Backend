// logger.ts
import { createLogger, format, transports } from "winston";

const { combine, timestamp, ms, json, colorize, printf, splat, errors } = format;

const devFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const base = `${timestamp} ${level}: ${message}`;
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  return stack ? `${base}\n${stack}${metaStr}` : `${base}${metaStr}`;
});

export const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  defaultMeta: { service: "lead-status" },
  format: combine(
    timestamp(),
    ms(),
    splat(),
    errors({ stack: true }), // <-- capture error stack traces
    process.env.NODE_ENV === "production" ? json() : combine(colorize(), devFormat)
  ),
  transports: [
    new transports.Console(),
    // In prod you might also add:
    // new transports.File({ filename: 'logs/error.log', level: 'error' }),
    // new transports.File({ filename: 'logs/combined.log' }),
  ],
});