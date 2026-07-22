import { PrismaAgentConfigStore, type AgentConfigStore } from "@voice-agent/agent-config";
import { createPrismaClient, DEFAULT_BUSINESS_ID, type PrismaClient } from "@voice-agent/db";

// Server-only wiring: one Prisma client per server process.
// In dev, Next.js re-runs modules on every hot reload. Keeping the client on globalThis
// stops each reload from opening a new pool of database connections.

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getPrisma(): PrismaClient {
  globalForPrisma.prisma ??= createPrismaClient();
  return globalForPrisma.prisma;
}

// Every request uses the demo business until auth exists (roadmap phase 15).
export function getAgentConfigStore(): AgentConfigStore {
  return new PrismaAgentConfigStore(getPrisma(), DEFAULT_BUSINESS_ID);
}
