import { Prisma } from "@prisma/client";
import logger from "./logger";

export function logDbError(error: unknown, context: string, meta?: any) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    logger.error(`[PRISMA][${context}]`, {
      code: error.code,
      message: error.message,
      meta: error.meta,
      ...meta,
    });
  } 
  else if (error instanceof Prisma.PrismaClientValidationError) {
    logger.error(`[PRISMA VALIDATION][${context}]`, {
      message: error.message,
      ...meta,
    });
  } 
  else if (error instanceof Prisma.PrismaClientRustPanicError) {
    logger.error(`[PRISMA PANIC][${context}]`, {
      message: error.message,
      ...meta,
    });
  } 
  else {
    logger.error(`[UNKNOWN ERROR][${context}]`, {
      message: (error as any)?.message,
      stack: (error as any)?.stack,
      ...meta,
    });
  }
}
