import { PrismaAgentConfigStore, type AgentConfigStore } from "@voice-agent/agent-config";
import { createPrismaClient, type PrismaClient } from "@voice-agent/db";
import { currentBusinessId } from "./business";

// Server-only wiring: one Prisma client per server process.
// In dev, Next.js re-runs modules on every hot reload. Keeping the client on globalThis
// stops each reload from opening a new pool of database connections.

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  globalForPrisma.prisma ??= createPrismaClient();
  return globalForPrisma.prisma;
}

/** Agent configs of a business: the signed-in user's, unless one is given (e.g. phone calls). */
export async function getAgentConfigStore(businessId?: string): Promise<AgentConfigStore> {
  return new PrismaAgentConfigStore(getPrisma(), businessId ?? (await currentBusinessId()));
}
