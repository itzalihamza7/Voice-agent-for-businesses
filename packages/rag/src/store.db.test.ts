import { createPrismaClient, type PrismaClient } from "@voice-agent/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { KnowledgeStore } from "./store";

// Integration test against the real PostgreSQL (pgvector + full-text search) in DDEV.
// Run with `ddev npm run test:db`. Each test uses its own throwaway business.

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
  return new KnowledgeStore(prisma, businessId);
}

// Tiny 3-number "embeddings": price-ish, hours-ish, parking-ish.
const chunks = [
  { heading: "Prices", content: "A haircut costs £30 and a beard trim costs £15." },
  {
    heading: "Opening hours",
    content: "We are open Monday to Saturday from 9am to 5pm. Closed on Sundays.",
  },
  { heading: "Parking", content: "Free parking is available behind the salon." },
];
const vectors = [
  [1, 0.1, 0],
  [0.1, 1, 0],
  [0, 0.1, 1],
];

async function seeded() {
  const store = await newStore();
  await store.addDocument({
    title: "FAQ",
    sourceType: "text",
    chunking: "headings",
    content: "…",
    chunks,
    embeddings: { "test/model": vectors },
  });
  return store;
}

describe("KnowledgeStore (PostgreSQL)", () => {
  it("stores documents with chunks and lists them with their models", async () => {
    const store = await seeded();
    const [doc] = await store.listDocuments();
    expect(doc).toMatchObject({ title: "FAQ", chunkCount: 3, models: ["test/model"] });
    expect((await store.getChunks(doc!.id)).map((c) => c.heading)).toEqual([
      "Prices",
      "Opening hours",
      "Parking",
    ]);
  });

  it("finds chunks by meaning with pgvector", async () => {
    const store = await seeded();
    const hits = await store.vectorSearch("test/model", [0.2, 0.9, 0.1], 2);
    expect(hits.map((h) => h.heading)).toEqual(["Opening hours", "Prices"]);
    expect(hits[0]!.score).toBeGreaterThan(0.9);
    expect(await store.vectorSearch("other/model", [1, 0, 0], 2)).toEqual([]);
  });

  it("finds chunks by keywords, matching any word, with stemming", async () => {
    const store = await seeded();
    // Not all words appear in one chunk: OR semantics still finds the right one first.
    const hits = await store.keywordSearch("what time do you open on sundays please", 3);
    expect(hits[0]!.heading).toBe("Opening hours");
    expect((await store.keywordSearch("haircuts cost", 3))[0]!.heading).toBe("Prices"); // stemming
    expect(await store.keywordSearch("the of and", 3)).toEqual([]); // only stop words
  });

  it("never shows one business's knowledge to another, and deletes with its chunks", async () => {
    const a = await seeded();
    const b = await newStore();
    expect(await b.keywordSearch("haircut", 3)).toEqual([]);
    expect(await b.vectorSearch("test/model", [1, 0, 0], 3)).toEqual([]);
    const [doc] = await a.listDocuments();
    expect(await b.deleteDocument(doc!.id)).toBe(false);
    expect(await a.deleteDocument(doc!.id)).toBe(true);
    expect(await a.vectorSearch("test/model", [1, 0, 0], 3)).toEqual([]);
  });
});
