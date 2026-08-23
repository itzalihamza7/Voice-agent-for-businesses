import { cosineSimilarity } from "@voice-agent/pipeline";

// Splitting a document into chunks: the pieces that get embedded and returned by search.
// Chunks that are too big mix topics (and waste the model's context); too small and they lose
// the context that makes them understandable. Three strategies, to compare:
//   - fixed:    every ~N characters, with some overlap so a sentence cut in half isn't lost
//   - headings: one chunk per section (markdown "#" headings, or FAQ questions)
//   - semantic: start a new chunk where the meaning changes (consecutive sentences whose
//               embeddings are least similar)

export const CHUNKING_STRATEGIES = ["fixed", "headings", "semantic"] as const;
export type ChunkingStrategy = (typeof CHUNKING_STRATEGIES)[number];

export interface Chunk {
  heading: string | null;
  content: string;
}

const MAX_CHARS = 1_000;

/** Fixed-size chunks of about `size` characters, cut at a word boundary, overlapping. */
export function fixedChunks(text: string, size = 800, overlap = 120): Chunk[] {
  const clean = normalize(text);
  const chunks: Chunk[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      // Back up to the last space so a word isn't cut in half.
      const space = clean.lastIndexOf(" ", end);
      if (space > start + size / 2) end = space;
    }
    chunks.push({ heading: null, content: clean.slice(start, end).trim() });
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
    // Start the overlap at a word boundary too.
    const space = clean.indexOf(" ", start);
    if (space !== -1 && space < end) start = space + 1;
  }
  return chunks.filter((chunk) => chunk.content);
}

/**
 * One chunk per section. A section starts at a markdown heading ("## Prices") or at an FAQ
 * question (a line that starts with "Q:" or ends with "?"). Long sections are split further.
 */
export function headingChunks(text: string): Chunk[] {
  const sections: Chunk[] = [];
  let heading: string | null = null;
  let lines: string[] = [];
  const flush = () => {
    const content = normalize(lines.join("\n"));
    if (content) sections.push({ heading, content });
    lines = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const markdown = /^#{1,6}\s+(.+)$/.exec(line);
    const question = /^(?:Q:\s*)?(.+\?)$/i.exec(line);
    if (markdown) {
      flush();
      heading = markdown[1]!.trim();
    } else if (question && line.length <= 200) {
      flush();
      heading = question[1]!.trim();
    } else {
      lines.push(line.replace(/^A:\s*/i, ""));
    }
  }
  flush();
  // A very long section still has to fit: split it with the fixed strategy, keeping the heading.
  return sections.flatMap((section) =>
    section.content.length <= MAX_CHARS
      ? [section]
      : fixedChunks(section.content).map((chunk) => ({
          heading: section.heading,
          content: chunk.content,
        })),
  );
}

/**
 * Splits where the meaning changes. Sentences are embedded; a new chunk starts at the biggest
 * drops in similarity between neighbouring sentences (below the given percentile).
 */
export async function semanticChunks(
  text: string,
  embed: (sentences: string[]) => Promise<number[][]>,
  { percentile = 25, maxChars = MAX_CHARS } = {},
): Promise<Chunk[]> {
  const sentences = splitSentences(normalize(text));
  if (sentences.length <= 2)
    return sentences.length ? [{ heading: null, content: sentences.join(" ") }] : [];
  const vectors = await embed(sentences);
  const similarities = sentences
    .slice(1)
    .map((_, i) => cosineSimilarity(vectors[i]!, vectors[i + 1]!));
  const sorted = [...similarities].sort((a, b) => a - b);
  const threshold = sorted[Math.floor((sorted.length - 1) * (percentile / 100))]!;

  const chunks: Chunk[] = [];
  let current: string[] = [sentences[0]!];
  sentences.slice(1).forEach((sentence, i) => {
    const length = current.join(" ").length + sentence.length;
    if (similarities[i]! <= threshold || length > maxChars) {
      chunks.push({ heading: null, content: current.join(" ") });
      current = [];
    }
    current.push(sentence);
  });
  chunks.push({ heading: null, content: current.join(" ") });
  return chunks;
}

export function splitSentences(text: string): string[] {
  return (text.match(/[^.!?\n]+(?:[.!?]+|$)/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 1);
}

/** Collapses runs of spaces and blank lines, keeping single line breaks. */
function normalize(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
