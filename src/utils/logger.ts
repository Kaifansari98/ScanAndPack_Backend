// src/lib/logger.ts
import winston from "winston";
import "winston-daily-rotate-file";

const isProd = process.env.NODE_ENV === "production";
const logLevel = process.env.LOG_LEVEL || (isProd ? "info" : "debug");

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
    const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return stack
      ? `[${timestamp}] ${level}: ${message}\n${stack}${rest}`
      : `[${timestamp}] ${level}: ${message}${rest}`;
  })
);

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// File rotation (daily), keeps 14 days, zipped
const rotate = (filename: string) =>
  new (winston.transports as any).DailyRotateFile({
    filename,
    datePattern: "YYYY-MM-DD",
    dirname: "logs",
    zippedArchive: true,
    maxFiles: "14d",
    maxSize: "20m",
    level: logLevel,
  });

export const logger = winston.createLogger({
  level: logLevel,
  format: isProd ? jsonFormat : consoleFormat,
  transports: [
    new winston.transports.Console({ level: logLevel }),
    rotate("app-%DATE%.log"),
    new (winston.transports as any).DailyRotateFile({
      filename: "error-%DATE%.log",
      dirname: "logs",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxFiles: "30d",
      level: "error",
    }),
  ],
  exceptionHandlers: [
    new winston.transports.Console(),
    rotate("exceptions-%DATE%.log"),
  ],
  rejectionHandlers: [
    new winston.transports.Console(),
    rotate("rejections-%DATE%.log"),
  ],
  exitOnError: false,
});

// Helpful typed helpers (optional)
export const log = {
  info: (msg: string, meta?: unknown) => logger.info(msg, meta),
  error: (msg: string, meta?: unknown) => logger.error(msg, meta),
  warn: (msg: string, meta?: unknown) => logger.warn(msg, meta),
  debug: (msg: string, meta?: unknown) => logger.debug(msg, meta),
};

export default logger;