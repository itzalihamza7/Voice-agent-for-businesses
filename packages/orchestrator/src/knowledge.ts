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

export async function lookUpKnowledge(
  turn: ToolTurn,
  node: Extract<FlowNode, { type: "knowledgeLookup" }>,
  variables: Readonly<Record<string, string>>,
  searcher: KnowledgeSearcher | null,
  llm: LanguageModelProvider | null,
): Promise<void> {
  const callerSaid =
    [...turn.transcript].reverse().find((entry) => entry.role === "caller")?.text ?? "";
  const topic = renderTemplate(node.data.query, variables).trim();
  const query = callerSaid || topic;
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
    const outcome = await searcher.search({
      query,
      ...(topic && topic !== query ? { context: topic } : {}),
      mode: node.data.mode,
      limit: node.data.limit,
      rewriteWith: node.data.rewrite ? llm : null,
      rerankWith: node.data.rerank ? llm : null,
    });
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
