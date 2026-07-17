/**
 * Shared Prisma client for database access.
 *
 * The client is generated into `src/generated/prisma` (see `schema.prisma`).
 * In development we reuse one instance on `globalThis` so hot-reload does not
 * open a new DB connection on every restart.
 */
import { PrismaClient } from "../generated/prisma/index.js";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
