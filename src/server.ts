// src/server.ts
import { app } from "./app";
import { env } from "./config/env";
import logger from "./utils/logger";

const PORT = env.PORT || 7777;

const server = app.listen(PORT, () => {
  logger.info("Server started", { port: PORT, env: process.env.NODE_ENV });
});

// Graceful shutdown (optional but recommended)
const shutdown = (signal: string) => {
  logger.warn(`Received ${signal}, shutting down...`);
  server.close((err?: Error) => {
    if (err) {
      logger.error("Error during server close", { err });
      process.exit(1);
    }
    logger.info("HTTP server closed");
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
