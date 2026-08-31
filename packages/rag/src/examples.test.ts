import type { EmbeddingProvider } from "@voice-agent/pipeline";
import { describe, expect, it } from "vitest";
import { addExampleDocuments, EXAMPLE_DOCUMENTS } from "./examples";
import type { DocumentSummary, NewDocument } from "./store";

// A fake model: every text gets the same small vector.
const fakeModel: EmbeddingProvider = {
  id: "fake/model",
  embed: async (texts) => ({
    vectors: texts.map(() => [1, 0, 0]),
    model: "fake/model",
    latencyMs: 1,
    tokens: null,
    costUsd: 0,
  }),
};

function fakeStore(existingTitles: string[]) {
  const added: NewDocument[] = [];
  return {
    added,
    listDocuments: async () => existingTitles.map((title) => ({ title }) as DocumentSummary),
    addDocument: async (doc: NewDocument) => {
      added.push(doc);
      return { id: doc.title, chunkCount: doc.chunks.length };
    },
  };
}

describe("addExampleDocuments", () => {
  it("adds only the missing examples, each with its own chunking and every model's vectors", async () => {
    const store = fakeStore([EXAMPLE_DOCUMENTS[0]!.title]);
    const result = await addExampleDocuments(store, [fakeModel]);

    expect(result.alreadyThere).toEqual([EXAMPLE_DOCUMENTS[0]!.title]);
    expect(result.added).toEqual(EXAMPLE_DOCUMENTS.slice(1).map((doc) => doc.title));
    for (const doc of store.added) {
      const example = EXAMPLE_DOCUMENTS.find((e) => e.title === doc.title)!;
      expect(doc.chunking).toBe(example.chunking);
      expect(doc.chunks.length).toBeGreaterThan(0);
      expect(doc.embeddings["fake/model"]).toHaveLength(doc.chunks.length);
    }
  });

  it("splits the FAQ into one chunk per heading", async () => {
    const store = fakeStore([]);
    await addExampleDocuments(store, [fakeModel]);
    const faq = store.added.find((doc) => doc.title === "Salon FAQ (example)")!;
    expect(faq.chunks.map((c) => c.heading)).toContain("Location and parking");
    expect(faq.chunks).toHaveLength(12);
  });
});
