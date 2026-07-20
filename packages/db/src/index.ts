// Public entry point for database access (Prisma + PostgreSQL).
export * from "./client";
export * from "./constants";
export { Prisma, type PrismaClient } from "./generated/prisma/client";
