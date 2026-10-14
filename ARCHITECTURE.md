# Architecture

This document explains how the project is organised and why. Agents and their versioned
configs are stored in PostgreSQL and served by real API routes. The voice pipeline still uses
mocks: nothing talks to a real AI vendor or a real phone line yet. The planned phases are in
[docs/ROADMAP.md](docs/ROADMAP.md).

## What we are building

A platform where a business can:

1. **Design** a voice agent's conversation in a drag-and-drop editor (the _builder_).
2. **Run** that agent on phone calls: caller speech → text → AI reply → speech (the _pipeline_).
3. **Monitor** calls afterwards: logs, transcripts, sentiment (the _dashboard_).
4. **Version** each agent's design, so it can roll back to an old version or A/B test two versions.

## The big picture

```
            Browser                                   Server side
 ┌──────────────────────────────┐      ┌───────────────────────────────────────────────┐
 │ apps/web (Next.js pages)     │ HTTP │ apps/web/src/app/api   (thin route handlers)  │
 │  - builder (canvas)          │─────▶│        │                                      │
 │  - dashboard (calls)         │      │        ▼                                      │
 └──────────────────────────────┘      │ packages/orchestrator  (sessions, the "glue") │
                                       │        │                    │                 │
                                       │        ▼                    ▼                 │
                                       │ packages/pipeline    packages/agent-config    │
                                       │  STT → LLM → TTS      versioned configs       │
                                       │  (provider interfaces)      │                 │
                                       │                             ▼                 │
                                       │                      packages/db (Prisma)     │
                                       │                             │                 │
                                       └─────────────────────────────┼─────────────────┘
                                                                     ▼
                                                              PostgreSQL (DDEV)

 packages/shared: types + schemas that every box above imports.
```

## The structure we chose: a monorepo with npm workspaces

One Git repository holds one app (`apps/web`) and five small packages (`packages/*`).
npm workspaces link them, so `import { AgentConfig } from "@voice-agent/shared"` works anywhere.

Why:

- **Shared types are the main requirement.** The builder (in the browser) and the pipeline
  (on the server) must agree on what an agent config looks like. Putting the types and schemas
  in one package that both import means they cannot drift apart.
- **The voice pipeline will outgrow Next.js.** Real phone audio arrives over a long-lived
  WebSocket (for example from Twilio), which serverless Next.js routes handle badly. Because
  the pipeline and orchestrator are plain TypeScript packages with no Next.js code, a separate
  voice server can import them later without rewriting anything.
- **Clear boundaries help learning.** Each package has one job and one `index.ts` entry point,
  so it is easy to see what depends on what.
- **No build step for internal packages.** Each package exports its TypeScript source directly.
  Next.js compiles the ones it uses (`transpilePackages`), and Vitest runs TypeScript as-is.

Dependencies only point one way:

```
web → orchestrator → pipeline, agent-config, tools → db, shared
```

`shared` imports nothing internal. The UI never imports `pipeline` or `db` directly. It goes
through the API. Only `apps/web/src/server/` creates the database client and the store.

## What each folder is for

| Folder                   | Purpose                                                                                                                                                                                                                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/`              | The **frontend**: a Next.js (App Router) app with React and Tailwind CSS.                                                                                                                                                                                                                                              |
| `apps/web/src/app/`      | Pages, one folder per URL. `/` lists agents and creates new ones, `agents/[agentId]/builder` is the builder, `knowledge` is the knowledge base, `dashboard/calls` is the dashboard.                                                                                                                                    |
| `apps/web/src/app/api/`  | **Server-side** route handlers: the HTTP edge of the orchestration layer. They validate the request with a shared Zod schema and call the orchestrator. `/api/agents`, `/api/agents/:agentId/versions`, `/api/simulate` (test calls) and `/api/knowledge/*` work; `/api/calls` and `/api/sessions` still return `501`. |
| `apps/web/src/server/`   | Server-only wiring: one shared Prisma client, the business-scoped config store, the knowledge base and caller memory stores, and HTTP helpers (body validation, error → status code).                                                                                                                                  |
| `apps/web/src/features/` | React components grouped by feature: `builder/` (the React Flow agent builder, prompt studio, test chat), `agents/` (create-agent form), `knowledge/` (documents, search playground), `dashboard/`. Pages stay small and import from here.                                                                             |
| `packages/shared/`       | Types and **Zod** schemas used everywhere: `AgentConfig` (the versioned JSON), the flow's node and edge types (`flow.ts`), `validateFlow()` (`flow-validation.ts`), prompt settings and `buildSystemPrompt()` (`prompt.ts`), and `CallLog`, `TranscriptTurn`, `Sentiment`.                                             |
| `packages/pipeline/`     | The voice pipeline. One folder per step (`providers/stt`, `llm`, `tts`), each with an interface (`types.ts`) and a fake implementation (`mock.ts`). `registry.ts` picks implementations by name. `pipeline.ts` runs one turn.                                                                                          |
| `packages/agent-config/` | Storing and versioning agent configs. `AgentConfigStore` is the interface, with two implementations: `InMemoryAgentConfigStore` (tests) and `PrismaAgentConfigStore` (Postgres). `store.contract.ts` holds the tests both must pass. `versioning.ts` is the placeholder for rollback / A/B logic.                      |
| `packages/orchestrator/` | The "glue": agent use cases (create, list, save a version) and sessions (load the agent's config, build its providers). Later it drives the conversation and saves call logs. Has no HTTP code.                                                                                                                        |
| `packages/rag/`          | The knowledge base (RAG): text extraction from web pages and PDFs, chunking, embedding, the business-scoped `KnowledgeStore` (pgvector + full-text search) and `searchKnowledge()` (hybrid search, rewriting, reranking).                                                                                              |
| `packages/evals/`        | Evals: running test cases (scripted or simulated callers) against an agent version, the AI judge, retrieval metrics and the go-live gate.                                                                                                                                                                              |
| `packages/tools/`        | Tools agents can call: built-in booking tools (mock), webhook tools, MCP client, argument checks against JSON Schema, SSRF guard.                                                                                                                                                                                      |
| `packages/db/`           | Database access with **Prisma 7** and PostgreSQL. `prisma/schema.prisma` (tables: businesses, agents, agent_config_versions, calls, transcript_turns, knowledge_documents, knowledge_chunks, knowledge_embeddings, caller_memories, eval_cases, eval_runs), `prisma/migrations/`, and an idempotent `prisma/seed.ts`.  |
| `apps/voice-gateway/`    | The phone door: a WebSocket server for Twilio media streams (audio conversion, utterances, barge-in, transfers). Runs the agent through the web app's phone API.                                                                                                                                                       |
| `.ddev/`                 | DDEV config: the Docker-based development environment (Node 22 + PostgreSQL 17). Our settings live in `config.voice-agent.yaml`, because `ddev config` rewrites `config.yaml`.                                                                                                                                         |

## How "swap a vendor without code changes" works

Each pipeline step depends only on an interface, never on a vendor:

```ts
interface SpeechToTextProvider {
  readonly name: string;
  transcribe(audio: Uint8Array): Promise<{ text: string }>;
}
```

Every agent config names the implementation for each step:

```json
"providers": { "stt": "mock", "llm": "mock", "tts": "mock" }
```

`createProviders()` in `registry.ts` turns those names into objects. To add a real vendor,
write one class that implements the interface and add one line to the registry. After that,
switching an agent from one vendor to another is a config change, not a code change.

## How versioned configs work

- An agent's whole design (flow + provider choices) is one JSON document, `AgentConfig`.
- `AgentConfigSchema` (Zod) validates it before it is saved, so broken configs never get stored,
  and again when it is read back, so the rest of the code can trust its type.
- Saving never overwrites. Every save creates version 1, 2, 3, and so on: one row in
  `agent_config_versions`, with the JSON in a JSONB column.
- Two saves at the same moment must not get the same number. Each save locks the agent's row
  (`SELECT ... FOR UPDATE`), so saves for one agent run one after another. A unique index on
  `(agent_id, version)` is the safety net, and a short retry covers two saves creating the
  same new agent at once.
- Every query is scoped by `businessId`. A store instance belongs to one business, so one
  business can never read or overwrite another's agents. Until login exists, everything uses the
  seeded `demo-business`.
- `schemaVersion` records the version of the JSON _format_ itself, so old configs can be
  upgraded if the format changes.
- **Rollback** = make an old version live again. **A/B test** = send some calls to version A
  and some to version B, and record on each `CallLog` which `agentVersion` handled it.

## How the agent builder works

The builder (`/agents/:agentId/builder`) has three columns: a **palette** of steps on the left,
the **canvas** (React Flow) in the middle, and **settings** for the selected step on the right.
With nothing selected, the right column shows the flow's issues and the version history.

**Node types.** Each step is a node with its own settings, defined once in
`packages/shared/src/flow.ts`:

| Node             | Settings                               | Outputs                          |
| ---------------- | -------------------------------------- | -------------------------------- |
| Start            | none                                   | 1                                |
| Say              | text                                   | 1                                |
| Ask              | question, variable to store the answer | 1                                |
| AI response      | instructions for the LLM               | 1                                |
| Branch           | a list of paths ("when the caller...") | one per path + "Otherwise"       |
| Tool             | tool name                              | 1                                |
| Knowledge lookup | topic, search mode, passages, rerank   | 1                                |
| Transfer         | phone number, message                  | none (the call leaves the agent) |
| End              | goodbye message                        | none                             |

All of them run in the test chat ("How a test call works"); speech and phone calls come in later
phases (see the roadmap).

**Two levels of checking.**

1. **Shape** (Zod schemas in `flow.ts`): is it a known node type with the right field types?
   Checked when saving. Unfinished drafts pass, so work in progress can always be saved.
2. **Completeness** (`validateFlow()` in `flow-validation.ts`): is every step filled in,
   connected and reachable from Start? Does every Branch path lead somewhere? Checked live in
   the browser: problem steps get a red outline and the issues are listed. Because it lives in
   `shared`, the server can later use the same function to refuse to put an incomplete flow live.

**Canvas rules.** Start can't be deleted and has no input. End and Transfer have no output.
Each output has at most one connection: drawing a new one replaces the old one. Removing a
Branch path also removes its connection.

**Saving.** "Save version" sends the flow to `POST /api/agents/:agentId/versions` and creates
the next version. Opening an old version from the history loads it into the canvas, and saving
it then creates a new version with that content (old versions are never changed).

**Adding a node type** touches four files: `flow.ts` (schema), `flow-validation.ts` (rules),
`node-catalog.ts` (label, colour, defaults) and `NodeSettingsPanel.tsx` (form). TypeScript points
at any of them you forget.

## How the prompt studio works

The builder has two modes, switched in the header: **Flow** (the canvas) and **Prompt**. The
Prompt mode edits how the AI talks in AI response steps, and its settings are saved with the
agent's next version, next to the flow.

**Prompt settings** (`packages/shared/src/prompt.ts`, part of `AgentConfig`):

| Setting                  | Purpose                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------- |
| Business name            | Fills `{{business_name}}` everywhere (prompt, Say, Ask, ...)                           |
| Role, Personality, Goals | Who the agent is, its tone, what a good call achieves                                  |
| Business rules           | Facts and limits, e.g. prices or "never promise refunds"                               |
| Voice style              | Switchable rules: short replies, no formatting, spoken numbers, one question at a time |
| Example exchanges        | Few-shot examples of the wanted style                                                  |

`buildSystemPrompt()` turns the settings into the system prompt, always in the same order:
role → personality → goals → business rules → voice style → **platform rules** → examples →
the step's task → what is known (variables). The platform rules (never invent facts; say so when
information is missing) can't be edited: they protect callers whatever the prompt says. The
function lives in `shared`, so the editor's live preview shows exactly what the server sends.

**Template variables:** `{{business_name}}` and `{{today}}` are built in; every Ask step adds
its own (e.g. `{{caller_name}}`). `validateFlow()` and the prompt editor flag unknown names, so
a typo like `{{caller_nam}}` is caught before a caller hears it.

**Playground:** runs one AI reply twice with the same caller message and model: **A** with the
saved prompt of the open version and **B** with the edits on screen
(`POST /api/prompt-playground`). It shows both replies, their system prompts, tokens and cost.
With no edits, A and B show how much replies vary on their own.

**Older versions** (saved before prompt settings existed) get the default settings when read:
`AgentConfigSchema` fills them in, so no data migration was needed.

## How answers and decisions are understood (structured outputs)

The guiding principle: **the AI understands, the code calculates and checks.**

**Ask steps** have an expected answer type: text, name, phone, email, date, time, number or
yes/no (`packages/orchestrator/src/extraction.ts`):

1. **Plain rules first** (phone, email, number, yes/no, and spoken digits like "oh three
   hundred" → 0300). Free, instant, predictable.
2. Otherwise the language model returns a small **JSON object matching a JSON Schema**
   (structured output, `response_format: json_schema`). For dates it only _classifies_ what
   was said (`{ kind: "weekday", weekday: "friday" }`); **code computes the actual date**.
3. **Every value is validated in code.** Invalid JSON gets one retry with the error message.
   Model claims are checked against the caller's words (e.g. "am"/"pm" only counts if the caller
   said am, pm, morning, ...).
4. Still not understood → the agent asks again (up to 2 times), then keeps the answer as said.

Dates and times also save a spoken version (`{{preferred_date_spoken}}` = "Friday, October 23").
The decisions model does this work: it is the one meant for short, exact jobs.

**Branch decisions** come back as JSON `{ "reason": ..., "path": n }` with `path` limited to the
offered numbers. **`reason` comes first on purpose**: models write JSON in order, so the model
explains before it commits. With `path` first, gpt-4.1-nano once wrote "the caller asked about
services" as the reason for choosing the change/cancel path.

**Keywords** (optional, per Branch path) route calls without AI and are shown next to the AI's
choice for comparison. They are a baseline: "I need to move my _appointment_" matches a
booking keyword.

## How tools work

Tools let an agent do things: check availability, create a booking, look something up.
Code: `packages/tools` (the tools) and `packages/orchestrator/src/tool-runner.ts` (running them).

**Where tools come from** (`resolveTools`, per call):

| Source     | What it is                                                                                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Built-in   | `checkAvailability`, `createBooking`, `findBooking`, `updateBooking` on a mock booking system (Mon–Sat 9:00–17:00, demo booking `ABC123`; bookings live in memory until a restart) |
| Webhook    | The business's own URL: we POST `{ "arguments": {...} }` and use the JSON object it returns                                                                                        |
| MCP server | Any Model Context Protocol server (Streamable HTTP). Its tools are discovered live and named `server_tool`. The app includes a demo server at `/api/demo-mcp`                      |

Webhooks and MCP servers are saved with the agent's version (the builder's **Tools** tab).

**Tool steps:** arguments come from templates (`date = {{preferred_date}}`). Required arguments
left empty are filled in by the AI from the conversation (function calling with a forced tool
choice). Arguments are checked against the tool's JSON Schema before the call. With "save
result as" `availability`, the result's fields become `{{availability_freeTimes}}` etc., plus
`{{availability_ok}}` and `{{availability_error}}`. The full result always goes into the
transcript, so later steps and the AI can see it.

**AI response steps with tools (the agentic loop):** the model may call the allowed tools, read
the results and call again, up to 4 rounds; the last round offers no tools, so it must answer.
Tools that weren't allowed for the step are refused.

**Branch rules:** a path can say "take me when `{{variable}}` equals a value", checked in code
before any AI. Use them for tool results (`availability_requestedTimeFree = true`): in testing,
gpt-4.1-nano read `requestedTimeFree: false` as free, even with a focused prompt. Language is for
the AI; true/false data is for code.

**Safety (SSRF):** webhook and MCP URLs are user input, but our server makes the request. Private
addresses (localhost, 10.x, 192.168.x, 169.254.169.254 cloud metadata, ...) are blocked and
redirects aren't followed. `TOOLS_ALLOW_PRIVATE_HOSTS=true` (set in DDEV only) allows them for
local testing. Known limit: DNS rebinding between the check and the request.

## How the knowledge base works (RAG)

A business adds its FAQ, price list, web pages or PDFs once (page `/knowledge`); every agent of
the business can then answer from them in **Knowledge lookup** steps. Code: `packages/rag`.

```
Adding a document (/knowledge)                 During a call (Knowledge lookup step)
  pasted text / web page / PDF                   caller: "where can I leave my car?"
  → extract the text        (extract.ts)         → rewrite as a search query (AI, optional)
  → split into chunks       (chunking.ts)        → keyword search + vector search  (store.ts)
  → embed every chunk with every model           → fuse the two rankings (RRF)     (search.ts)
  → knowledge_documents / _chunks / _embeddings  → AI rates the passages 0–10, drops those < 5
                                                 → passages go into the transcript for the AI
```

**Chunking** (`chunking.ts`), chosen per document, with a preview before saving:

| Strategy | Splits                                                   | Good for                    |
| -------- | -------------------------------------------------------- | --------------------------- |
| Headings | at `#` headings and FAQ questions                        | FAQs, structured pages      |
| Fixed    | every ~800 characters at a word, overlapping 120         | anything; can mix topics    |
| Semantic | where neighbouring sentences' embeddings are least alike | long prose without headings |

**Embeddings.** `EMBEDDING_MODELS` lists the models (`ollama/nomic-embed-text`,
`openai/text-embedding-3-small`). Each chunk is embedded once per model, one row each in
`knowledge_embeddings`, so models can be compared; calls use the first. Vectors from different
models can't be compared, so every vector search names its model. nomic-embed-text expects the
prefixes `search_query:` / `search_document:`; the provider adds them.

**Search** (`searchKnowledge`, in `search.ts`):

- **Keyword**: Postgres full-text search (`to_tsvector` / `ts_rank`), with the words OR-ed,
  because a caller's sentence rarely contains every word of the passage. Finds exact words
  (names, prices), misses paraphrases ("leave my car" vs "parking").
- **Vector**: cosine distance (pgvector `<=>`) between the question's and the chunks' embeddings.
  Finds meaning, but always returns _something_, even for questions the documents can't answer.
- **Hybrid**: Reciprocal Rank Fusion. Each list votes `1 / (60 + rank)` for its results. It uses
  ranks because cosine similarity and `ts_rank` aren't on the same scale.
- **Query rewriting** (optional): the AI turns "uh hi, how much for my little boy" into
  "child haircut price".
- **Reranking** (on by default): the AI rates the top 6 passages from 0 to 10 and those under 5
  are dropped. This is what lets the agent say "I don't know": similarity scores of answerable
  and unanswerable questions overlap, rerank scores barely do. If the AI's ratings can't be read,
  the search order is kept.

**In a call** (`packages/orchestrator/src/knowledge.ts`): the step searches with the caller's
last message (its topic setting is context for rewriting). The passages go into the transcript
as a note ("use only these facts"), or a note that nothing relevant was found, so the next AI
response step answers from the documents or says it doesn't know. The test chat shows the
sources (`[1] FAQ › Prices`), the search query and the time taken.

**Example documents.** `packages/rag/src/examples.ts` holds four documents for the demo
business, a hair salon called High Street Hair: an FAQ, a price list, a booking policy and an
"about us" page, each chunked a different way. The seeded `demo` agent answers questions from
them in a loop (`packages/db/prisma/demo-agent.ts`). They are added on `ddev start` while the
knowledge base is empty (`npm run kb:seed`), or with **Add example documents** on `/knowledge`.
Some topics (nails, tattoos, massages) are left out on purpose, to test "I don't know".

**Scope and safety.** Chunks carry their `businessId` and every query filters by it
(`KnowledgeStore` is created per business). Web pages are fetched through the SSRF guard, with
every redirect checked again.

**pgvector.** DDEV's Postgres image doesn't include it: `.ddev/db-build/Dockerfile` installs
`postgresql-17-pgvector` and the migration runs `CREATE EXTENSION vector`. The vector column has
no fixed size (models differ), so there is no ANN index: exact search is fast enough for a
business's few hundred chunks.

## How voice works (browser)

The test chat has a **Voice** switch. In the browser (`useVoice.ts`) the microphone is watched
with an audio level meter: speech starts a recording, ~0.9 s of silence ends it, and talking
over the agent stops its audio (barge-in). Each recording goes to
`POST /api/test-calls/:callId/voice`, which runs one voice turn on the server:

```
recording ─▶ speech-to-text ─▶ the call's next turn (LangGraph) ─▶ text-to-speech ─▶ MP3 back
```

The reply carries what was heard, the turn's events, the audio and the time each step took.
Speech providers sit behind the pipeline's `SpeechToTextProvider` / `TextToSpeechProvider`
interfaces (`VOICE_STT` / `VOICE_TTS`, default `openai`: `gpt-4o-mini-transcribe` and
`gpt-4o-mini-tts`). Local providers (whisper.cpp, Piper) fit the same interfaces later.

## How phone calls work

```
caller ─▶ Twilio number ─▶ POST /twilio/voice (TwiML: stream the audio)
                           wss /twilio/stream ◀──▶ apps/voice-gateway ──▶ web app phone API
                             μ-law 8 kHz frames      utterances, barge-in    agent, STT, TTS
```

- **`apps/voice-gateway`** is a small Node server (`ws`) that speaks Twilio's media-stream
  protocol. It converts audio (μ-law 8 kHz ↔ 16-bit PCM, 24 kHz text-to-speech down to 8 kHz),
  cuts the caller's audio into utterances by loudness, clears Twilio's audio queue when the
  caller talks over the agent (barge-in), and keeps speech that arrives while a turn is running.
- **The web app runs the agent.** The gateway calls `POST /api/phone/calls` (start: the agent for
  the dialled number, its live version, caller memory by the caller's number) and
  `POST /api/phone/calls/:callId/turn` (one utterance as WAV). Both need the shared
  `GATEWAY_SECRET`.
- **Numbers to agents:** each agent can have one phone number (builder header; `agents.phone_number`).
- **Transfer and hang-up:** a Transfer step moves the live call to a person through Twilio's REST
  API (`TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`; without them it is only logged); an End step
  hangs up after the goodbye has played.
- **Testing without Twilio:** `npm run fake-call -w @voice-agent/voice-gateway` plays Twilio's
  part: it speaks the caller's lines with text-to-speech, sends them as μ-law frames and saves
  the agent's side as `agent-audio.wav`. For a real number: expose port 8080 (e.g. ngrok), set
  `PUBLIC_HOST`, and point the Twilio number's voice webhook at `https://<host>/twilio/voice`.

## How the call log and dashboard work

- **Recording.** Each call is a LangGraph thread whose state keeps every event with its time
  (the trace). When a call ends (test chat, browser voice or phone), `recordIfEnded`
  (`apps/web/src/server/call-log.ts`) saves it once: transcript, trace, AI cost summed from the
  trace, and flags for problems (guardrails, model errors, a stuck flow, re-asks, cut prompts).
- **Post-call analysis** (`packages/orchestrator/src/analysis.ts`) runs in the background: a
  summary plus sentiment, intent and outcome as structured output. What the trace shows wins
  over the model's reading (a transfer is "transferred", a model error is "failed").
- **Dashboard** (`/dashboard/calls`): totals (resolved, transferred, average length and AI cost),
  topics, calls that need a look, and the log. Each call has a page with its analysis,
  transcript and trace (every step with model, time, tokens and cost).
- **Topics** group calls by intent label, then merge labels that mean the same by the
  similarity of their embeddings (`clusterByEmbedding`).

## How multi-agent hand-offs and the flow generator work

- **Hand off step** (multi-agent): passes the call to another agent of the business. The engine
  loads that agent's live version (`loadAgent`), says the hand-off message and continues at the
  other agent's Start, in the same call: same caller, transcript, variables and memory. The
  call's state remembers the agent (`agentId`), so later turns run its flow and prompt. A
  reception agent with a Branch and a few Hand off steps routes callers to specialists.
- **AI flow generator** (`packages/orchestrator/src/flow-generator.ts`, "Generate agent" on the
  home page): the model fills in a simple outline (steps with their text, answer types, paths
  and next steps) as structured output; code turns it into nodes and edges, lays them out by
  distance from the Start, and checks the flow with `validateFlow`. If issues remain, the model
  gets them and one more try. The agent opens in the builder for review.
- **Flow mode vs. agent mode:** flows keep the call on rails (bookings, anything with rules);
  AI response steps with tools act as small autonomous agents inside a flow, for the parts that
  need judgement.

## How releases, rollback and A/B tests work

Versions are never edited; what callers get is a pointer. The builder's **Releases** tab:

- **Live version:** set from the Evals tab through the eval gate. Every change is a row in
  `releases` (live, rollback, split, split-stopped).
- **Rollback:** one click back to the version that was live before (`rollbackTarget`), without
  the gate, because it is for when something is wrong right now.
- **A/B test:** a share of new phone calls (5–50%) gets a candidate version, which needs a
  finished eval run. `versionForCall` hashes the call id, so the choice is stable for a call
  and evenly spread; each later turn keeps the version the call started with.
- **Compare versions:** per version, the latest eval score next to live numbers from the call
  log (calls, resolved, transferred, unhappy callers, AI cost per call).

Code: `packages/agent-config/src/versioning.ts`, `apps/web/src/server/releases.ts`.

## How memory and context work

Code: `packages/orchestrator/src/context.ts`, `summary.ts` and `memory.ts`.

**Context budget.** Every AI request gets the call as text, and calls grow: each knowledge
lookup adds a few hundred tokens of passages. Local models run with a small context window
(Ollama: 4,096 tokens for prompt and answer) and cut a prompt that doesn't fit without an error:
in testing, a ~6,000-token prompt was cut to its last ~2,048 tokens, so the system prompt (the
agent's instructions) went first. So the engine decides what each request sees
(`buildContext`), within a budget (2,500 tokens by default, which with the system prompt and
the answer stays inside that window; the test chat can change it):

1. Earlier knowledge and tool notes are shortened to their first line.
2. The oldest messages are left out; the rolling summary keeps their gist.
3. Never cut: the system prompt, the summary and the last four messages.

When a model reports far fewer prompt tokens than were sent, the provider marks the request
`promptCut` and the test chat shows a warning under it.

**Branch decisions see less on purpose** (`decisionContext`): the summary and the last four
spoken messages, without notes (a tool result the decision depends on is passed separately).
With the whole call, gpt-4.1-nano ended the demo call on a new question in every run; with the
short context it routed 50/50 turns right. More context isn't better context.

**Rolling summary.** When the messages after the summary pass 60% of the budget, the decisions
model folds all but the last six into a short summary (at most 120 words). The browser keeps
the full transcript in the call's state; only what the AI sees gets shorter.

**Caller memory.** With a caller number (caller ID; the test chat has a field for it), the
caller's facts are loaded at the start of the call and given to AI replies ("What you remember
about this caller..."). When the call ends, the decisions model updates them. Code then checks
them: only facts the AI marked as about the caller (not the business), at most 8, each under
200 characters, and nothing that looks like a card number. Memories live in the
`caller_memories` table, per business and normalized phone number. The test chat shows them
with a **Forget this caller** button (`DELETE /api/callers/:phone/memory`).

## How guardrails work

Code: `packages/orchestrator/src/guardrails.ts`, applied by the engine on every call whatever
the agent's prompt says (like the platform rules in the system prompt).

| Where          | Check                                                                                  | What happens                                                         |
| -------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Caller's words | Card numbers                                                                           | Replaced by "[card number removed]" before storing or any model call |
| Caller's words | Prompt injection ("ignore your instructions", "read me your prompt")                   | Flagged; the AI is told to stay in its role                          |
| Caller's words | Asks for a person, or is clearly fed up                                                | The call goes to the flow's Transfer step (if it has one)            |
| AI reply       | Grounding: every price or percentage (digits or words) appears in what it was given    | Written again once with the problem explained, then a safe reply     |
| AI reply       | Policy: promising a discount the business didn't offer; talking about its instructions | Same as above                                                        |

Every intervention is a `guardrail` event, shown in the test chat with the reply that was
stopped. The demo agent's evals include a case per guardrail.

## How evals work

Code: `packages/evals`, the builder's **Evals** tab, and `apps/web/src/server/evals.ts`.

- **Cases per agent** (`eval_cases`). A _scripted_ case has fixed caller lines and code checks:
  how the call ends, saved answers, phrases the agent must or must never say ("£30|thirty" means
  either), steps it must pass. A _simulated_ case gives a model a persona and a goal, and it plays
  the caller for up to N turns.
- **AI judge.** A (preferably stronger) model grades every call against a rubric: helpful,
  grounded (no invented facts; it sees the notes the agent saw), on script, phone manner, plus
  case-specific lines ("never promises a discount"). Each line gets a reason, then 0/1/2.
- **Score.** A case's score averages the share of checks passed and of judge points; it fails if
  a check fails or the judge gives a 0. A run's score is the average, 0–100.
- **Runs** (`eval_runs`) are started for a saved version and models; the browser then runs each
  case with its own request, and the server computes and stores the result.
- **Regression gate.** `POST /api/agents/:id/live` makes a version live only if it has a finished
  run and its score isn't more than 3 points below the live version's.
- **Retrieval test.** On the knowledge page: recall@1, recall@3 and MRR of keyword, vector and
  hybrid search on 18 spoken questions about the example documents.

## How a test call works

The builder's **Test** button opens a chat where you play the caller. It lets you check a flow's
logic before any speech or phone line exists.

```
Browser (TestChat)                          Server
  start: flow + settings ── POST /api/test-calls ──────────▶ new LangGraph thread (call id)
  caller's words         ── POST /api/test-calls/:callId ──▶ resume the thread
  new state + events     ◀───────────────────────────────── runs until it needs the caller
```

- **LangGraph keeps the call** (`packages/orchestrator/src/call-graph.ts`). Each call is a
  thread; a small graph runs a turn, then waits for the caller with `interrupt()`; the next
  request resumes it with `Command({ resume })`. Postgres keeps every step (the
  `@langchain/langgraph-checkpoint-postgres` saver, in its own `langgraph` schema), so a call
  survives restarts and can be inspected later. The graph is compiled per request with that
  request's models and tools, so no API client or key is ever saved in a checkpoint.
  (`/api/simulate` is a stateless variant that takes the state in the request, for scripts.)
- **The conversation engine** (`packages/orchestrator/src/conversation.ts`) runs each turn step
  after step until the flow needs the caller: an **Ask** step (waits for an answer, stores it in
  its variable) or a **Branch**. Say, Tool, Knowledge lookup and AI response steps don't wait.
- **Each response** carries the new state (the step it is waiting at, the answers so far, the
  transcript) and a list of events ("said X", "AI chose path Y in 0.8 s"), which the chat turns
  into messages.
- **Models are picked in the chat**, one per job (**model routing**): a model for **Branch
  decisions**, a model for **AI replies**, and an optional **fallback**. The list comes from
  `GET /api/models`: every model installed in Ollama (asked live) plus the allowed OpenAI models.
  - At a **Branch**, the engine waits for what the caller says, then asks the decisions model
    which path fits (it answers with JSON `{ reason, path }`, the path's label; anything unreadable
    means "Otherwise"). Branch rules (variable equals value) are checked first, in code.
  - **AI response** steps are written by the replies model, following the step's instructions.
  - **Tool** steps call real tools ("How tools work"); **Knowledge lookup** steps search the
    business's documents ("How the knowledge base works").
  - If a model fails, the fallback model answers and the chat says so. Without a fallback,
    Branches fall back to picking by hand.
  - Every AI request shows its model, time, tokens (and cached tokens) and estimated cost.
- **It runs on the server on purpose:** the OpenAI API key must never reach the browser.
- **Prompts** live in `packages/orchestrator/src/prompts.ts`. The conversation is sent as one
  transcript in a single message, not as separate chat turns, because chat templates differ
  between models (Llama mis-handled a conversation ending in a system note and leaked an
  "assistant" header into its reply).
- `{{variable}}` placeholders are filled with the answers collected so far (`renderTemplate`).
- Safety: a loop of steps that never waits for the caller stops after 200 steps, and a step with
  nothing connected after it ends the call with an explanation.

### Language models

`packages/pipeline/src/providers/llm/` holds the language model code:

- `openai-compatible.ts` talks to any server that speaks OpenAI's Chat Completions API, so **one
  class covers OpenAI and Ollama**. Plain `fetch` (no SDK), a timeout per attempt, and up to 2
  retries with exponential backoff for temporary failures (network, timeout, HTTP 429/5xx).
  Requests the server rejects (other 4xx) fail at once. It reports token usage, cached input
  tokens and an estimated cost, and can send `reasoning_effort`.
- `fallback.ts` wraps a main model and a backup: the backup answers when the main one fails,
  and the result records `fellBackFrom` so a fallback is never silent.
- `pricing.ts` has OpenAI's per-token prices (with the date they were checked). Local models
  cost $0.

**Reasoning ("thinking") models.** Qwen 3 writes hidden reasoning before answering. Through
Ollama's OpenAI-compatible API that took 10–18 s for one Branch decision; with
`reasoning_effort: "none"` it took 0.3–0.6 s with the same answer. Ollama models therefore get
`OLLAMA_REASONING_EFFORT=none` (models without a thinking mode, like Llama, ignore it).

`registry.ts` creates a model from a provider name plus an optional model name
(`{ provider: "ollama", model: "qwen3:8b" }`) and lists what can be picked. Settings come from
environment variables:

| Variable                  | Where it is set                                     | Default                                                                                                               |
| ------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `OLLAMA_BASE_URL`         | `.ddev/config.voice-agent.yaml`                     | `http://host.docker.internal:11434/v1` (the Mac, seen from DDEV)                                                      |
| `OLLAMA_MODEL`            | `.ddev/config.voice-agent.yaml`                     | `llama3.1:8b` (default when no model is named)                                                                        |
| `OLLAMA_REASONING_EFFORT` | `.ddev/config.voice-agent.yaml`                     | not sent (we set `none`)                                                                                              |
| `OPENAI_MODEL`            | `.ddev/config.voice-agent.yaml`                     | `gpt-4.1-mini`                                                                                                        |
| `OPENAI_MODELS`           | `.ddev/config.voice-agent.yaml`                     | `OPENAI_MODEL` only. **Allow-list**: other OpenAI models are refused, so an expensive one can't be picked by accident |
| `EMBEDDING_MODELS`        | `.ddev/config.voice-agent.yaml`                     | `ollama/nomic-embed-text` (comma-separated; documents are embedded with each, calls use the first)                    |
| `OPENAI_API_KEY`          | `.ddev/.env.web` (**git-ignored**, never committed) | none                                                                                                                  |

Ollama runs directly on macOS, not in DDEV: Docker on a Mac has no access to the GPU.

## Development environment: DDEV + Docker + PostgreSQL

`ddev start` creates two Docker containers:

- **web**: Node 22. Runs `npm install`, applies database migrations, seeds demo data (a
  `demo-business`, a `demo` Q&A agent and, while the knowledge base is empty, the example
  documents), then starts the Next.js dev server at
  https://voice-agent.ddev.site. Every step is safe to repeat, so this happens on every start.
- **db**: PostgreSQL 17 with pgvector (user/password/database are all `db`). Data survives
  `ddev stop`.

All npm commands run inside the container (`ddev npm test`), so every developer gets the same
Node version and the same Linux binaries, and nobody needs Postgres installed locally.
`DATABASE_URL` is set for you inside the container.

There are two kinds of tests:

- **Unit tests** (`npm test`) never need the database. They use the in-memory mocks, so they
  also run without Postgres, like `npm run lint` and `npm run build`.
- **Integration tests** (`npm run test:db`, files named `*.db.test.ts`) run against the real
  Postgres. Each test creates its own throwaway business and deletes it afterwards, so your dev
  data is never touched.

## Tools

| Tool                              | Why                                                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| TypeScript 6.0, strict mode       | Catch mistakes at compile time. Pinned to 6.0 because typescript-eslint does not support 7 yet.                |
| Next.js 16 (App Router), React 19 | Pages and API routes in one app.                                                                               |
| React Flow 12 (`@xyflow/react`)   | The drag-and-drop canvas: nodes, connections, zoom, minimap.                                                   |
| Tailwind CSS 4                    | Styling without writing separate CSS files.                                                                    |
| Zod 4                             | One schema gives both runtime validation and TypeScript types.                                                 |
| Prisma 7                          | Typed database access and migrations for PostgreSQL.                                                           |
| Vitest 5                          | Fast tests that run TypeScript directly; one config for all workspaces.                                        |
| ESLint 9 + Prettier               | Code-quality rules and automatic formatting. ESLint 9 because some Next.js lint plugins do not support 10 yet. |
| DDEV (on Docker)                  | One-command dev environment with Node and PostgreSQL.                                                          |
| Ollama + `llama3.1:8b`            | Free local language model for development and comparison.                                                      |
| OpenAI API (`gpt-4.1-mini`)       | Hosted language model, the quality and speed reference.                                                        |

## Alternatives we considered

| Alternative                                               | Why we did not pick it (for now)                                                                                                                                                                                      |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A single Next.js app** with everything under `src/lib/` | Simpler at first, but the pipeline would be tied to Next.js, and moving it to a separate voice server later would be a big refactor.                                                                                  |
| **Turborepo / Nx / pnpm**                                 | Good tools for large monorepos (caching, faster installs). Too much extra to learn for six small workspaces. Easy to add later.                                                                                       |
| **A separate backend now** (Express, Fastify, NestJS)     | Not needed until real-time phone audio arrives. Next.js API routes are enough as the thin layer today.                                                                                                                |
| **Hand-written JSON Schema + Ajv**                        | We would have to keep the schema and the TypeScript types in sync by hand. Zod gives both from one source (and can export JSON Schema if we ever need it).                                                            |
| **Drizzle** instead of Prisma                             | Lighter and closer to SQL, with schemas in TypeScript. Prisma was chosen for its mature docs, migrations and Prisma Studio. Both would work, because the rest of the code only sees the `AgentConfigStore` interface. |
| **Plain docker-compose** instead of DDEV                  | DDEV already runs on Docker and adds HTTPS URLs, a managed Postgres, `ddev psql`, and one-command start. A separate compose file would be a second way to do the same thing.                                          |
| **Building packages to `dist/`**                          | Extra build steps and watch processes. Exporting TypeScript source keeps things simple while everything lives in one repo.                                                                                            |

## Where future features will live

| Feature                                                               | Where                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Agent builder** (drag-and-drop canvas)                              | Done (MVP): `apps/web/src/features/builder/`, page `apps/web/src/app/agents/[agentId]/builder/`. Node types: `packages/shared/src/flow.ts`. See "How the agent builder works".                                                            |
| **Monitoring dashboard** (logs, transcripts, sentiment)               | UI: `apps/web/src/features/dashboard/`. Pages: `apps/web/src/app/dashboard/calls/`. Data: `apps/web/src/app/api/calls/`. Types: `packages/shared/src/call.ts`. Tables: `Call` and `TranscriptTurn` in `packages/db/prisma/schema.prisma`. |
| **Voice pipeline** (STT → LLM → TTS)                                  | `packages/pipeline/`. Real vendors go in `providers/<step>/<vendor>.ts` and get registered in `registry.ts`. Streaming and interruptions go in `pipeline.ts`.                                                                             |
| **Versioned configs** (rollback, A/B)                                 | Schema: `packages/shared/src/agent-config.ts`. Storage (done): `PrismaAgentConfigStore` in `packages/agent-config/`, using the `agent_config_versions` table. Rollback / A/B logic: `packages/agent-config/src/versioning.ts`.            |
| **Orchestration**                                                     | `packages/orchestrator/` holds the logic. `apps/web/src/app/api/` is its HTTP door today. A future `apps/voice-gateway/` (WebSocket server for phone calls) would be a second door into the same package.                                 |
| **Sentiment analysis**                                                | A new provider interface in `packages/pipeline/src/providers/sentiment/` when it is needed. The `Sentiment` type already exists in `shared`.                                                                                              |
| **AI features** (prompts, LLM harness, tools, RAG, evals, guardrails) | See [docs/ROADMAP.md](docs/ROADMAP.md). `packages/rag`, `packages/tools` and `packages/evals` exist. Every LLM feature runs against both a local model (Ollama) and the OpenAI API, so they can be compared.                              |
