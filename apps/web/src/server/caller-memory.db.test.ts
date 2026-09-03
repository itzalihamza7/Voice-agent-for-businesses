import { createPrismaClient, type PrismaClient } from "@voice-agent/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaCallerMemoryStore } from "./caller-memory";

// Integration test against the real PostgreSQL in DDEV (`ddev npm run test:db`).
// Each test uses its own throwaway business.

let prisma: PrismaClient;
const businessIds: string[] = [];

beforeAll(() => {
  prisma = createPrismaClient();
});
afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
  await prisma.$disconnect();
});

async function newStore() {
  const businessId = `test-${crypto.randomUUID()}`;
  businessIds.push(businessId);
  await prisma.business.create({ data: { id: businessId, name: "Test business" } });
  return new PrismaCallerMemoryStore(prisma, businessId);
}

describe("PrismaCallerMemoryStore", () => {
  it("saves, counts calls, updates and forgets a caller", async () => {
    const store = await newStore();
    expect(await store.get("+447700900123")).toBeNull();

    await store.save("+447700900123", ["Name is Ali."]);
    const second = await store.save("+447700900123", ["Name is Ali.", "Prefers Saturdays."]);
    expect(second).toMatchObject({ facts: ["Name is Ali.", "Prefers Saturdays."], callCount: 2 });
    expect(await store.get("+447700900123")).toMatchObject({ callCount: 2 });

    expect(await store.forget("+447700900123")).toBe(true);
    expect(await store.get("+447700900123")).toBeNull();
    expect(await store.forget("+447700900123")).toBe(false);
  });

  it("keeps businesses apart", async () => {
    const [a, b] = [await newStore(), await newStore()];
    await a.save("+15550100", ["Customer of A."]);
    expect(await b.get("+15550100")).toBeNull();
  });
});
