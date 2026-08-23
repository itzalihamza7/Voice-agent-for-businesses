import { describe, expect, it } from "vitest";
import { fixedChunks, headingChunks, semanticChunks, splitSentences } from "./chunking";

describe("fixedChunks", () => {
  it("cuts at word boundaries with overlap and loses no text", () => {
    const text = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const chunks = fixedChunks(text, 100, 20);
    expect(chunks.length).toBeGreaterThan(3);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(100);
      expect(chunk.content).toMatch(/^word\d+/); // starts with a whole word
      expect(chunk.content).toMatch(/word\d+$/); // ends with a whole word
    }
    // Every word appears in some chunk, and neighbours share words (overlap).
    for (let i = 0; i < 60; i++)
      expect(chunks.some((c) => c.content.split(" ").includes(`word${i}`))).toBe(true);
    const [first, second] = chunks;
    expect(first!.content.split(" ").some((w) => second!.content.split(" ").includes(w))).toBe(
      true,
    );
  });
});

describe("headingChunks", () => {
  it("makes one chunk per markdown section and per FAQ question", () => {
    const text = [
      "# Prices",
      "A haircut costs £30.",
      "A beard trim costs £15.",
      "## Opening hours",
      "Monday to Saturday, 9am to 5pm.",
      "Q: Do you take walk-ins?",
      "A: Yes, when a chair is free.",
      "Can I bring my dog?",
      "Small dogs are welcome.",
    ].join("\n");
    expect(headingChunks(text)).toEqual([
      { heading: "Prices", content: "A haircut costs £30.\nA beard trim costs £15." },
      { heading: "Opening hours", content: "Monday to Saturday, 9am to 5pm." },
      { heading: "Do you take walk-ins?", content: "Yes, when a chair is free." },
      { heading: "Can I bring my dog?", content: "Small dogs are welcome." },
    ]);
  });
});

describe("semanticChunks", () => {
  it("splits where neighbouring sentences are least similar", async () => {
    const text = "Haircuts cost £30. Beard trims cost £15. We open at 9am. We close at 5pm.";
    // Fake embeddings: price sentences point one way, opening-hours sentences another.
    const embed = async (sentences: string[]) =>
      sentences.map((s) => (s.includes("cost") ? [1, 0.1] : [0.1, 1]));
    expect(await semanticChunks(text, embed)).toEqual([
      { heading: null, content: "Haircuts cost £30. Beard trims cost £15." },
      { heading: null, content: "We open at 9am. We close at 5pm." },
    ]);
  });

  it("splits text into sentences", () => {
    expect(splitSentences("Hi! How are you? Fine.\nNew line")).toEqual([
      "Hi!",
      "How are you?",
      "Fine.",
      "New line",
    ]);
  });
});
