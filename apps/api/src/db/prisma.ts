// Importing env first ensures the root .env is loaded (DATABASE_URL) for every
// entrypoint that touches the database — server, worker, and standalone scripts.
import "../env.js";
import { PrismaClient } from "@prisma/client";

// Single shared Prisma client across the API process and workers.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
