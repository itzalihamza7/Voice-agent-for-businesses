import type { LanguageModelProvider } from "@voice-agent/pipeline";
import { renderTemplate, type FlowNode, type LlmCallInfo } from "@voice-agent/shared";
import type { ToolTurn } from "./tool-runner";

// Knowledge lookup steps (RAG): search the business's knowledge base for what the caller asked
// and give the results to later AI steps as numbered sources in the transcript.
// The search itself (pgvector, full-text, rewriting, reranking) is in @voice-agent/rag; the
// engine only needs this interface, so it stays free of database code.

export interface KnowledgeSearcher {
  search(options: {
    query: string;
    context?: string;
    mode: "hybrid" | "vector" | "keyword";
    limit: number;
    rewriteWith: LanguageModelProvider | null;
    rerankWith: LanguageModelProvider | null;
  }): Promise<{
    searchQuery: string;
    results: { documentTitle: string; heading: string | null; content: string; score: number }[];
    latencyMs: number;
    llm: LlmCallInfo[];
  }>;
}

// Keeps a long passage from filling the model's context.
const MAX_PASSAGE_CHARS = 700;

type LookupNode = Extract<FlowNode, { type: "knowledgeLookup" }>;

/** What a lookup step searches for: the caller's last words, or the step's topic. */
function lookupRequest(
  turn: ToolTurn,
  node: LookupNode,
  variables: Readonly<Record<string, string>>,
) {
  const callerSaid =
    [...turn.transcript].reverse().find((entry) => entry.role === "caller")?.text ?? "";
  const topic = renderTemplate(node.data.query, variables).trim();
  return { query: callerSaid || topic, topic };
}

function searchOptions(
  node: LookupNode,
  query: string,
  topic: string,
  llm: LanguageModelProvider | null,
) {
  return {
    query,
    ...(topic && topic !== query ? { context: topic } : {}),
    mode: node.data.mode,
    limit: node.data.limit,
    rewriteWith: node.data.rewrite ? llm : null,
    rerankWith: node.data.rerank ? llm : null,
  };
}

/**
 * Starts the searches of lookup steps a Branch may lead to, while the Branch is still being
 * decided: the decision and the search are each about a second or two, so a knowledge answer
 * comes that much sooner. If another path wins, the search is simply not used.
 */
export function prefetchLookups(
  turn: ToolTurn,
  nodes: readonly LookupNode[],
  variables: Readonly<Record<string, string>>,
  searcher: KnowledgeSearcher | null,
  llm: LanguageModelProvider | null,
) {
  if (!searcher) return;
  turn.prefetched ??= new Map();
  for (const node of nodes) {
    const { query, topic } = lookupRequest(turn, node, variables);
    if (!query) continue;
    // A failed early search isn't an error yet: the step searches again if it runs.
    const outcome = searcher.search(searchOptions(node, query, topic, llm)).catch(() => null);
    turn.prefetched.set(node.id, { query, outcome });
  }
}

export async function lookUpKnowledge(
  turn: ToolTurn,
  node: LookupNode,
  variables: Readonly<Record<string, string>>,
  searcher: KnowledgeSearcher | null,
  llm: LanguageModelProvider | null,
): Promise<void> {
  const { query, topic } = lookupRequest(turn, node, variables);
  const base = { type: "knowledgeLookup" as const, nodeId: node.id, query, searchQuery: query };

  if (!searcher || !query) {
    const error = searcher ? "Nothing to search for." : "The knowledge base isn't available.";
    turn.events.push({ ...base, results: [], latencyMs: 0, error });
    turn.transcript.push({
      role: "system",
      text: `The knowledge base search failed (${error}). Don't guess what it would have said.`,
    });
    return;
  }

  try {
    const early = turn.prefetched?.get(node.id);
    turn.prefetched?.delete(node.id);
    const outcome =
      (early?.query === query ? await early.outcome : null) ??
      (await searcher.search(searchOptions(node, query, topic, llm)));
    const results = outcome.results.map((hit) => ({
      documentTitle: hit.documentTitle,
      heading: hit.heading,
      excerpt: hit.content.slice(0, MAX_PASSAGE_CHARS),
      score: hit.score,
    }));
    const llmTotal = sumCalls(outcome.llm);
    turn.events.push({
      ...base,
      searchQuery: outcome.searchQuery,
      results,
      latencyMs: outcome.latencyMs,
      ...(llmTotal ? { llm: llmTotal } : {}),
    });
    turn.transcript.push({
      role: "system",
      text: results.length
        ? [
            `Knowledge base results for "${outcome.searchQuery}" (use only these facts; say which source if helpful):`,
            ...results.map(
              (hit, i) =>
                `[${i + 1}] ${hit.documentTitle}${hit.heading ? ` › ${hit.heading}` : ""}: ${hit.excerpt}`,
            ),
          ].join("\n")
        : `The knowledge base was searched for "${outcome.searchQuery}" and returned NO RESULT. Don't state facts it would have contained.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    turn.events.push({ ...base, results: [], latencyMs: 0, error: message });
    turn.transcript.push({
      role: "system",
      text: `The knowledge base search failed (${message}). Don't guess what it would have said.`,
    });
  }
}

function sumCalls(calls: LlmCallInfo[]): LlmCallInfo | null {
  if (calls.length === 0) return null;
  const sum = (pick: (c: LlmCallInfo) => number | null) =>
    calls.every((c) => pick(c) === null) ? null : calls.reduce((t, c) => t + (pick(c) ?? 0), 0);
  return {
    ...calls.at(-1)!,
    latencyMs: calls.reduce((t, c) => t + c.latencyMs, 0),
    inputTokens: sum((c) => c.inputTokens),
    outputTokens: sum((c) => c.outputTokens),
    cachedInputTokens: sum((c) => c.cachedInputTokens),
    costUsd: sum((c) => c.costUsd),
  };
}
