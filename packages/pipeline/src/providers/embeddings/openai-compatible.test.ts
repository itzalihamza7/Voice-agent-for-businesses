import { describe, expect, it, vi } from "vitest";
import { cosineSimilarity, OpenAICompatibleEmbeddings } from "./openai-compatible";

describe("OpenAICompatibleEmbeddings", () => {
  it("adds the purpose prefix, batches inputs, restores order and prices the tokens", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const { input } = JSON.parse(String(init?.body)) as { input: string[] };
      // Answer in reverse order: the provider must sort by index.
      const data = input
        .map((text, index) => ({ index, embedding: [text.length, index] }))
        .reverse();
      return Response.json({ data, usage: { prompt_tokens: input.length * 10 } });
    });
    const embeddings = new OpenAICompatibleEmbeddings({
      id: "test/model",
      baseUrl: "https://emb.example/v1",
      model: "m",
      prefixes: { query: "q: " },
      pricePerMillionTokens: 0.02,
      batchSize: 2,
      fetch: fetchMock,
    });

    const result = await embeddings.embed(["a", "bb", "ccc"], "query");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)).input).toEqual(["q: a", "q: bb"]);
    expect(result.vectors).toEqual([
      [4, 0],
      [5, 1],
      [6, 0],
    ]);
    expect(result).toMatchObject({ model: "test/model", tokens: 30, costUsd: 0.0000006 });
  });

  it("measures cosine similarity", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1);
  });
});
