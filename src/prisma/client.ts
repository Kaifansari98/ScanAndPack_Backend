// src/prisma/client.ts
import { PrismaClient } from '@prisma/client';

// Prisma 7: Connection URL is now configured in prisma.config.ts
// PrismaClient will automatically read from the config file or DATABASE_URL env var
export const prisma = new PrismaClient();