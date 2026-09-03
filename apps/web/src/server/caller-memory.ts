import { DEFAULT_BUSINESS_ID, type Prisma, type PrismaClient } from "@voice-agent/db";
import type { CallerMemory, CallerMemoryStore } from "@voice-agent/orchestrator";
import { z } from "zod";
import { getPrisma } from "./store";

// Caller memories in Postgres, one row per business and phone number.

const FactsSchema = z.array(z.string());

export class PrismaCallerMemoryStore implements CallerMemoryStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly businessId: string,
  ) {}

  async get(phoneNumber: string): Promise<CallerMemory | null> {
    const row = await this.prisma.callerMemory.findUnique({
      where: { businessId_phoneNumber: { businessId: this.businessId, phoneNumber } },
    });
    return row && toMemory(row);
  }

  async save(phoneNumber: string, facts: string[]): Promise<CallerMemory> {
    const json = facts as Prisma.InputJsonArray;
    const row = await this.prisma.callerMemory.upsert({
      where: { businessId_phoneNumber: { businessId: this.businessId, phoneNumber } },
      create: { businessId: this.businessId, phoneNumber, facts: json, callCount: 1 },
      update: { facts: json, callCount: { increment: 1 } },
    });
    return toMemory(row);
  }

  async forget(phoneNumber: string): Promise<boolean> {
    const { count } = await this.prisma.callerMemory.deleteMany({
      where: { businessId: this.businessId, phoneNumber },
    });
    return count > 0;
  }
}

function toMemory(row: {
  phoneNumber: string;
  facts: Prisma.JsonValue;
  callCount: number;
  updatedAt: Date;
}): CallerMemory {
  const facts = FactsSchema.safeParse(row.facts);
  return {
    phoneNumber: row.phoneNumber,
    facts: facts.success ? facts.data : [],
    callCount: row.callCount,
    lastCallAt: row.updatedAt.toISOString(),
  };
}

// Every request uses the demo business until auth exists (roadmap phase 15).
export function getCallerMemoryStore(): CallerMemoryStore {
  return new PrismaCallerMemoryStore(getPrisma(), DEFAULT_BUSINESS_ID);
}
