import { createPrismaClient, type PrismaClient } from "@voice-agent/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaAgentConfigStore } from "./prisma-store";
import { describeAgentConfigStore, draftFor } from "./store.contract";

// Integration test against the real PostgreSQL in DDEV. Run with `ddev npm run test:db`.
// Each test gets its own throwaway business, deleted afterwards (cascades to agents/versions),
// so the dev data is never touched.

let prisma: PrismaClient;
const businessIds: string[] = [];

beforeAll(() => {
  prisma = createPrismaClient();
});

afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
  await prisma.$disconnect();
});

async function newBusinessStore(): Promise<PrismaAgentConfigStore> {
  const businessId = `test-${crypto.randomUUID()}`;
  businessIds.push(businessId);
  await prisma.business.create({ data: { id: businessId, name: "Test business" } });
  return new PrismaAgentConfigStore(prisma, businessId);
}

describeAgentConfigStore("PrismaAgentConfigStore", newBusinessStore, () => crypto.randomUUID());

describe("PrismaAgentConfigStore business isolation", () => {
  it("does not let one business see or overwrite another business's agent", async () => {
    const storeA = await newBusinessStore();
    const storeB = await newBusinessStore();
    const id = crypto.randomUUID();
    await storeA.saveNewVersion(draftFor(id, "Owned by A"));

    expect(await storeB.getLatest(id)).toBeNull();
    expect(await storeB.listAgents()).toEqual([]);
    await expect(storeB.saveNewVersion(draftFor(id, "Hijack"))).rejects.toThrow("not found");
    expect((await storeA.getLatest(id))?.name).toBe("Owned by A");
  });
});
