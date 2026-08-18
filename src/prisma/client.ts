import * as dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";

const myEnv = dotenv.config();
dotenvExpand.expand(myEnv);

import {
  PrismaClient,
  Prisma,
} from "../../generated/prisma_client/client";

import { PrismaPg } from "@prisma/adapter-pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured");
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

export const prisma = new PrismaClient({
  adapter,

  log: [
    {
      emit: "event",
      level: "query",
    },
  ],
});

prisma.$on("query", (event) => {
  console.log(
    `[PRISMA QUERY] ${event.duration}ms`,
    event.query.substring(0, 500),
  );
});

export { Prisma };