import { describe, expect, it } from "vitest";
import { htmlToText } from "./extract";
import type { LanguageModelProvider } from "@voice-agent/pipeline";
import { reciprocalRankFusion, searchKnowledge } from "./search";
import type { KnowledgeHit } from "./types";

const hit = (id: string): KnowledgeHit => ({
  chunkId: id,
  documentId: "d",
  documentTitle: "FAQ",
  heading: null,
  content: id,
  score: 0,
});

describe("reciprocalRankFusion", () => {
  it("ranks items found by both methods first, then by rank", () => {
    const keyword = [hit("prices"), hit("hours"), hit("parking")];
    const vector = [hit("hours"), hit("walk-ins"), hit("prices")];
    const fused = reciprocalRankFusion([keyword, vector]);
    expect(fused.map((h) => h.chunkId)).toEqual(["hours", "prices", "walk-ins", "parking"]);
    expect(fused[0]!.score).toBeCloseTo(1 / 62 + 1 / 61);
  });

  it("works with one empty list", () => {
    expect(reciprocalRankFusion([[], [hit("a"), hit("b")]]).map((h) => h.chunkId)).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("htmlToText", () => {
  it("keeps headings and list items, drops scripts and navigation, decodes entities", () => {
    const html = `<html><head><title>Shine &amp; Co</title><script>evil()</script></head>
      <body><nav>Home | About</nav><h1>Prices</h1><p>Haircut: &pound;30</p>
      <ul><li>Beard trim &ndash; ask us</li></ul><footer>© 2026</footer></body></html>`;
    expect(htmlToText(html)).toEqual({
      title: "Shine & Co",
      text: "# Prices\nHaircut: £30\n- Beard trim – ask us",
    });
  });
});

describe("searchKnowledge reranking", () => {
  const store = {
    keywordSearch: async () => [hit("prices"), hit("parking")],
    vectorSearch: async () => [],
  };
  const reranker = (scores: { id: number; relevance: number }[]): LanguageModelProvider => ({
    name: "fake",
    model: "fake",
    complete: async () => ({
      text: JSON.stringify({ scores }),
      model: "fake",
      latencyMs: 1,
      usage: null,
      costUsd: 0,
    }),
  });

  it("reorders by the AI's relevance and drops results rated below the minimum", async () => {
    const outcome = await searchKnowledge(store, {
      query: "how much",
      mode: "keyword",
      limit: 3,
      embedding: null,
      rerankWith: reranker([
        { id: 1, relevance: 3 },
        { id: 2, relevance: 9 },
      ]),
    });
    expect(outcome.results.map((h) => [h.chunkId, h.score])).toEqual([["parking", 9]]);
  });

  it("returns nothing when no result is relevant, so the AI isn't handed unrelated text", async () => {
    const outcome = await searchKnowledge(store, {
      query: "do you do tattoos",
      mode: "keyword",
      limit: 3,
      embedding: null,
      rerankWith: reranker([
        { id: 1, relevance: 0 },
        { id: 2, relevance: 2 },
      ]),
    });
    expect(outcome.results).toEqual([]);
  });

  it("keeps the search order when the reranker's answer can't be read", async () => {
    const outcome = await searchKnowledge(store, {
      query: "how much",
      mode: "keyword",
      limit: 3,
      embedding: null,
      rerankWith: reranker([]),
    });
    expect(outcome.results.map((h) => h.chunkId)).toEqual(["prices", "parking"]);
  });
});
