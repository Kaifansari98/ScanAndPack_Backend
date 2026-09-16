// src/server.ts
import { app } from "./app";
import { env } from "./config/env";
import logger from "./utils/logger";

import { startCronJobs } from "./services/schedulers/cron";
import { prisma } from "./prisma/client";

const PORT = env.PORT || 7777;

async function fixStaleApprovedOnlineLeads() {
  try {
    const mohammad = await prisma.userMaster.findFirst({
      where: { user_name: { contains: "mohammad", mode: "insensitive" } },
      select: { id: true, user_name: true },
    });
    const awais = await prisma.userMaster.findFirst({
      where: { user_name: { contains: "awais", mode: "insensitive" } },
      select: { id: true, user_name: true },
    });

    if (!mohammad || !awais) return;

    const targetCodes = ["SHCOOK-60", "SHCOOK-61", "SHCOOK-62"];
    const staleLeads = await prisma.leadMaster.findMany({
      where: {
        OR: [
          { lead_code: { in: targetCodes } },
          { contact_no: { contains: "9123401032" } },
        ],
        assign_to: awais.id,
      },
      select: { id: true, account_id: true, vendor_id: true, lead_code: true },
    });

    if (staleLeads.length > 0) {
      logger.info(
        `[MIGRATION] Migrating ${staleLeads.length} leads from Awais (${awais.id}) to Mohammad (${mohammad.id})`,
      );
      for (const lead of staleLeads) {
        await prisma.leadMaster.update({
          where: { id: lead.id },
          data: { assign_to: mohammad.id },
        });

        await prisma.leadUserMapping.updateMany({
          where: {
            lead_id: lead.id,
            user_id: awais.id,
            type: "ISM",
          },
          data: { status: "inactive" },
        });

        const existingMohammadMapping = await prisma.leadUserMapping.findFirst({
          where: {
            lead_id: lead.id,
            user_id: mohammad.id,
            type: "ISM",
          },
        });

        if (existingMohammadMapping) {
          await prisma.leadUserMapping.update({
            where: { id: existingMohammadMapping.id },
            data: { status: "active" },
          });
        } else {
          await prisma.leadUserMapping.create({
            data: {
              vendor_id: lead.vendor_id,
              account_id: lead.account_id ?? 0,
              lead_id: lead.id,
              user_id: mohammad.id,
              type: "ISM",
              status: "active",
              created_by: 1,
            },
          });
        }
      }

      await prisma.online_leads.updateMany({
        where: {
          contact: { contains: "9123401032" },
        },
        data: {
          final_assigned_leads: mohammad.id,
          pending_assign_to: null,
        },
      });

      logger.info(`[MIGRATION] Successfully moved leads to Mohammad!`);
    }
  } catch (err) {
    logger.error("[MIGRATION] Error fixing stale leads:", err);
  }
}

const server = app.listen(PORT, () => {
  logger.info("Server started", { port: PORT, env: process.env.NODE_ENV });
  console.log('DATABASE_URL:', process.env.DATABASE_URL);
  
  // Start scheduler jobs
  startCronJobs();
  fixStaleApprovedOnlineLeads();
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
