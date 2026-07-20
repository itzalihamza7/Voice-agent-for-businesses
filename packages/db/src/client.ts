import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

// Creates a Prisma client for PostgreSQL. Long-running apps should create one and reuse it.
export function createPrismaClient(databaseUrl = process.env.DATABASE_URL): PrismaClient {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set. Inside DDEV it is set automatically.");
  }
  return new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
}
