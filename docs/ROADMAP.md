# Roadmap

This is a learning project. Each phase adds a real product feature **and** teaches a set of
AI-engineering concepts. Percentages are each phase's share of the whole project
(the boilerplate was the first 10%).

## Model strategy: run both, compare

Every LLM-related phase is built to run against **two backends**:

- **Local**: [Ollama](https://ollama.com) on macOS (not inside DDEV: Docker on Mac has no GPU access).
  7–8B models fit in 16 GB RAM. Free, private, offline. Reached from DDEV at
  `http://host.docker.internal:11434`.
- **Hosted**: the OpenAI API (key in a gitignored `.env`, with a spending limit set).

Switching is a config change (`"llm": "ollama"` ↔ `"llm": "openai"`). Ollama speaks the
OpenAI-compatible API, so one adapter covers both. The same eval suite runs against both, so
quality, latency and cost can be compared side by side.

| Concept                                              | Local | OpenAI | Notes                                                                           |
| ---------------------------------------------------- | ----- | ------ | ------------------------------------------------------------------------------- |
| Prompt engineering, templates, few-shot              | ✅    | ✅     | Small models react more to wording, so prompt effects are easier to see         |
| Streaming, retries, timeouts, fallbacks              | ✅    | ✅     | Natural pattern: local first, fall back to the API                              |
| Model routing                                        | ✅    | ✅     | Small ↔ large model on either side                                              |
| Prompt caching                                       | ⚠️    | ✅     | Same idea, different mechanics (local session cache vs. automatic prefix cache) |
| Token / cost tracking, tracing                       | ✅    | ✅     | Local "cost" is time and memory                                                 |
| Structured outputs (JSON schema)                     | ✅    | ✅     |                                                                                 |
| Tool calling, agentic loop                           | ⚠️    | ✅     | 8B models pick wrong tools or loop more often                                   |
| MCP                                                  | ✅    | ✅     | Lives in our harness, so it works with any model that can call tools            |
| RAG (embeddings, pgvector, hybrid search, reranking) | ✅    | ✅     | Local embeddings are good                                                       |
| Memory, summaries, context budgeting                 | ✅    | ✅     | Local context windows are smaller in practice                                   |
| Evals: simulated callers                             | ✅    | ✅     |                                                                                 |
| Evals: LLM-as-judge                                  | ⚠️    | ✅     | The judge should be stronger than the model it grades                           |
| Guardrails                                           | ✅    | ✅     | Locally, a dedicated safety model (e.g. Llama Guard)                            |
| Multi-agent, reasoning mode                          | ⚠️    | ✅     | Works locally, but slow on 16 GB                                                |
| Real-time voice (< 1 s per turn)                     | ⚠️    | ✅     | Locally only as an experiment                                                   |
| Fine-tuning (optional)                               | ✅    | ✅     | LoRA with Apple MLX vs. the OpenAI fine-tuning API                              |

⚠️ = works, but noticeably weaker or slower on local hardware. Re-check current Ollama/OpenAI
feature support when building each phase. It changes often.

## Phases

| #   | Phase                           | Concepts                                                                       | %   | Status  |
| --- | ------------------------------- | ------------------------------------------------------------------------------ | --- | ------- |
| 0   | Boilerplate                     | Monorepo, provider interfaces, mocks, DDEV                                     | 10  | ✅ Done |
| 1   | Data foundation                 | Prisma models, Postgres config store, real API routes                          | 4   | ✅ Done |
| 2   | Agent builder MVP               | React Flow canvas, typed node settings, versions                               | 9   | ✅ Done |
| 3   | Prompt engineering studio       | System prompts, templates, few-shot, voice style, playground                   | 6   |         |
| 4   | LLM harness + text simulator    | Retries, timeouts, fallback, model routing, thinking control, cost, test chat  | 8   | ✅ Done |
| 5   | Structured outputs & tools      | JSON schema output, intents, function calling, agentic loop, MCP               | 6   |         |
| 6   | RAG knowledge base              | Ingestion, chunking, embeddings, pgvector, hybrid search, reranking, citations | 9   |         |
| 7   | Memory & context                | Context budgets, rolling summaries, long-term caller memory                    | 3   |         |
| 8   | Evals                           | Golden sets, simulated callers, LLM-as-judge, RAG metrics, regression gate     | 7   |         |
| 9   | Guardrails & safety             | Prompt injection, PII redaction, output checks, grounding, escalation          | 5   |         |
| 10  | Voice in the browser            | Streaming STT → LLM → TTS, VAD, barge-in, latency budgets, LLM token streaming | 8   |         |
| 11  | Phone calls                     | Twilio media streams, routing, human transfer                                  | 5   |         |
| 12  | Dashboard & LLM analytics       | Stored LLM traces, summaries, sentiment, topic clustering, failure analysis    | 6   |         |
| 13  | Multi-agent & AI flow generator | Router + specialists, handoffs, reasoning, LLM-generated flows                 | 4   |         |
| 14  | Rollback & A/B experiments      | Rollback, traffic splits, comparing versions                                   | 3   |         |
| 15  | Businesses & auth               | Login, roles, tenant isolation, encrypted vendor keys                          | 3   |         |
| 16  | Production hardening            | CI, Playwright, deploy, error tracking, rate limits, cost per call             | 4   |         |

## Phase details

### 1. Data foundation

- Prisma models: `Business`, `Agent`, `AgentConfigVersion` (config as JSONB), `Call`, `TranscriptTurn`.
  `Agent` and `Call` carry `businessId` from day one, so multi-tenancy (phase 15) needs no data migration.
- `PrismaAgentConfigStore`: the Postgres implementation of `AgentConfigStore`, scoped to one business.
  The same contract tests run against it and the in-memory store.
- Real API routes: `GET/POST /api/agents`, `GET/POST /api/agents/:agentId/versions`.
- Seed: a demo business and a `demo` agent. `ddev start` applies migrations and seeds automatically.

### 2. Agent builder MVP

- React Flow canvas. Nodes: Start, Say, Ask, AI Response, Branch, Tool, Knowledge Lookup, Transfer, End.
- Settings panel per node type, each validated by its own Zod schema.
- Save = new version; version history list; validation errors shown on the canvas.

### 3. Prompt engineering studio

- System prompt editor (role, persona, goals, rules, examples).
- Template variables (`{{business_name}}`, `{{caller_name}}`, ...) filled at runtime.
- Few-shot examples; voice style rules (short sentences, no markdown, spoken numbers).
- Playground: prompt A vs. prompt B on the same input, side by side, with token counts.

### 4. LLM harness + text simulator ✅

- OpenAI-compatible provider (covers Ollama and OpenAI): timeouts, retries with backoff.
- Fallback model; model routing (one model for Branch decisions, another for replies).
- Thinking control for reasoning models (`reasoning_effort: "none"`).
- Token, cached-token, latency and cost accounting per request.
- Test chat: chat as the caller, active step highlighted, any installed model selectable.
- Moved: token **streaming** to phase 10 (it matters once replies are spoken) and **stored
  traces** to phase 12 (where the dashboard shows them). Prompt caching only matters for long
  prompts (OpenAI caches prompts over 1,024 tokens); cached tokens are already shown.

  **Findings** (booking agent; local models on an M3 / 16 GB, both 8B, Q4_K_M):

  |                                              | `llama3.1:8b` | `qwen3:8b` (thinking off) | `gpt-4.1-nano` | `gpt-4.1-mini`              |
  | -------------------------------------------- | ------------- | ------------------------- | -------------- | --------------------------- |
  | Branch routing (3 test callers)              | 3/3           | 3/3                       | 3/3            | 3/3                         |
  | Branch decision time (after loading)         | 0.3–0.9 s     | 0.5–0.6 s                 | 0.9–2.0 s      | 0.5–1.2 s                   |
  | First request (model loading)                | 7–15 s        | 11 s                      | n/a            | n/a                         |
  | Cost of 3 decisions                          | $0            | $0                        | $0.000046      | $0.000184                   |
  | Invents times when the tool returned nothing | 2 of 3        | 3 of 3                    | not tested     | 0 of 3 (after prompt fixes) |
  | Honest about missing opening hours           | 3/3           | 3/3                       | not tested     | 3/3                         |

  Qwen 3 with thinking **on** took 10–18 s per decision (vs 0.3–0.6 s off) for the same answer.

  Lesson: prompt wording alone can't stop small models from inventing facts when a step's
  instructions ask for data they don't have. Real tool results (phase 5) and a grounding check
  (phase 9) are the proper fix.

### 5. Structured outputs & tools

- Ask node extracts fields as Zod-validated JSON and re-asks when the answer is invalid.
- Intent classification drives Branch nodes (compared against keyword rules).
- Built-in mock tools, webhook tools (URL + JSON schema), agentic loop with iteration limits.
- MCP client: use tools from any MCP server.

### 6. RAG knowledge base

- Ingest PDFs, FAQs and URLs. Compare fixed-size, heading-based and semantic chunking.
- Embeddings in pgvector (check whether the DDEV Postgres image needs the extension added).
- Hybrid search (vector + Postgres full-text), reranking, query rewriting, citations.
- Every search scoped by `businessId`. New package: `packages/rag`.

### 7. Memory & context

- Context budget (system prompt + chunks + history) and what gets cut first.
- Rolling summary for long calls; long-term memory per caller phone number.

### 8. Evals

- Test cases per agent; LLM-simulated caller personas (including attackers).
- LLM-as-judge rubrics; RAG metrics (recall@k, faithfulness, relevance).
- Regression gate: a version can't go live if its eval score drops. New package: `packages/evals`.

### 9. Guardrails & safety

- Prompt-injection detection, PII redaction, output policy checks, grounding check.
- Low confidence or an upset caller → transfer to a human. Every guardrail gets an eval.

### 10. Voice in the browser

- `apps/voice-gateway` WebSocket server, real STT/TTS providers, sentence-level streaming.
- Voice activity detection, barge-in, latency budget per step.

### 11. Phone calls

- Twilio number → media stream → voice gateway; number-to-agent routing; human transfer.

### 12. Dashboard & LLM analytics

- Call list, transcripts, trace view per call.
- Post-call summary, sentiment, intent; topic clustering with embeddings; failure analysis.

### 13. Multi-agent & AI flow generator

- Router agent with specialist agents and handoffs; reasoning mode (latency vs. quality).
- Generate a full builder flow from a plain-English description (Zod-validated JSON).
- Flow mode vs. autonomous agent mode, and when to use which.

### 14. Rollback & A/B experiments

- One-click rollback; traffic split between versions; compare evals and live metrics.

### 15. Businesses & auth

- Login, businesses, roles, every query scoped by business, encrypted per-business vendor keys.

### 16. Production hardening

- GitHub Actions CI, Playwright end-to-end tests, deployment, error tracking, rate limits, cost per call.
- Optional: export call data as a fine-tuning dataset.
