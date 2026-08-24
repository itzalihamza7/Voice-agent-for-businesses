import { describe, expect, it } from "vitest";
import { htmlToText } from "./extract";
import { reciprocalRankFusion } from "./search";
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
