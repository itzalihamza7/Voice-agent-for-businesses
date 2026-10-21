# Voice Agent Platform

A platform for businesses to build AI phone agents: design the conversation in a visual
builder, give the agent the business's documents and tools, test it by text, voice or a phone
call, check it with automated evals before it goes live, and follow every call in a dashboard.

It runs language models locally with [Ollama](https://ollama.com) or through the OpenAI API, and
most features were measured on both: the findings are in [docs/ROADMAP.md](docs/ROADMAP.md).

## What it does

- **Agent builder:** a drag-and-drop flow editor (React Flow) with Say, Ask, AI response,
  Branch, Tool, Knowledge lookup, Transfer, Hand off and End steps, live checks, and versions
  that are never edited in place.
- **Prompt studio:** role, persona, rules, voice style and examples per agent, with a live
  preview of the system prompt and an A/B playground.
- **Language model harness:** one provider for OpenAI and Ollama with retries, timeouts,
  fallback models, routing (a small model for decisions, a stronger one for replies), cost
  tracking and structured outputs.
- **Tools:** built-in booking tools, webhooks and MCP servers, called by steps or by the AI in
  an agentic loop.
- **Knowledge base (RAG):** web pages, PDFs and pasted text, chunked three ways, embedded with
  local and OpenAI models into pgvector, searched with hybrid keyword + vector search, query
  rewriting and reranking.
- **Memory and context:** a context budget, a rolling summary for long calls, and per-caller
  memory between calls.
- **Evals:** scripted and simulated callers (including attackers), an LLM judge with a rubric,
  retrieval metrics, and a gate that stops a version going live if its score drops.
- **Guardrails:** card-number redaction, prompt-injection detection, grounding checks on prices,
  policy checks, and hand-over to a person when the caller asks.
- **Voice and phone:** hands-free voice in the browser with barge-in, and a Twilio media-stream
  gateway for real phone numbers.
- **Dashboard:** every call with its transcript, step-by-step trace, AI cost, post-call analysis
  (summary, sentiment, intent, outcome) and topics.
- **Multi-agent and generation:** agents hand calls to each other; a new agent's flow can be
  generated from a plain-English description.
- **Releases:** go-live through the eval gate, one-click rollback, and A/B traffic splits.
- **Businesses and access:** sign-in, owner/editor/viewer roles, everything scoped by business,
  encrypted per-business API keys.

## How it fits together

```
 Browser ──▶ apps/web (Next.js: pages + API routes) ──▶ packages/orchestrator ──▶ LangGraph call threads
                                                         │   conversation engine, guardrails,
 Phone ──▶ Twilio ──▶ apps/voice-gateway ──────────────▶│   memory, context, analysis
                                                         ▼
          packages/pipeline (LLM, embeddings, speech)   packages/rag (knowledge base)
          packages/evals · packages/tools · packages/agent-config · packages/db (Prisma)
                                                         ▼
                                              PostgreSQL + pgvector
```

| Folder                  | What it holds                                                               |
| ----------------------- | --------------------------------------------------------------------------- |
| `apps/web`              | Next.js app: builder, knowledge base, dashboard, settings, API routes       |
| `apps/voice-gateway`    | WebSocket server for Twilio phone calls                                     |
| `packages/orchestrator` | Conversation engine, LangGraph call sessions, guardrails, memory, generator |
| `packages/pipeline`     | Language, embedding and speech providers                                    |
| `packages/rag`          | Chunking, extraction, the knowledge store and search                        |
| `packages/evals`        | Eval runner, judge, retrieval metrics, go-live gate                         |
| `packages/tools`        | Built-in tools, webhooks, MCP client                                        |
| `packages/agent-config` | Versioned agent configs, rollback and A/B logic                             |
| `packages/shared`       | Types and Zod schemas shared by everything                                  |
| `packages/db`           | Prisma schema, migrations and seed                                          |

More detail, including the design decisions, is in [ARCHITECTURE.md](ARCHITECTURE.md).

## Tech stack

TypeScript (strict) · Next.js 16 and React 19 · Tailwind CSS · React Flow · Zod · Prisma 7 and
PostgreSQL 17 with pgvector · LangGraph (call sessions) · OpenAI API and Ollama · Twilio media
streams · Vitest and Playwright · DDEV for development, Docker for production.

## Getting started

You need [DDEV](https://ddev.com) (with Docker). For local models, install
[Ollama](https://ollama.com) on the host and pull `qwen3:8b`, `llama3.1:8b` and
`nomic-embed-text`. For OpenAI models and speech, put your key in `.ddev/.env.web`:

```bash
echo "OPENAI_API_KEY=sk-..." > .ddev/.env.web
ddev start
```

`ddev start` installs dependencies, applies migrations, seeds a demo business and starts the app
and the voice gateway. Open https://voice-agent.ddev.site and sign in as `demo@example.com` /
`demo-password`.

The demo business is a hair salon, High Street Hair: a question-answering agent with example
documents and eval cases. Open it, press **Test**, and ask about prices or opening hours, by
typing or with **Voice**.

## Testing

```bash
ddev npm test            # unit tests
ddev npm run test:db     # database integration tests
ddev npm run lint
ddev npm run build
npm run test:e2e         # Playwright, against the running app
```

To try a phone call without a Twilio number, run a simulated call through the gateway:

```bash
ddev exec -d /var/www/html/apps/voice-gateway npm run fake-call
```

## Running in production

```bash
cp .env.example .env     # fill in OPENAI_API_KEY, APP_SECRET, GATEWAY_SECRET, DEMO_PASSWORD
docker compose up --build
```

This starts PostgreSQL with pgvector, applies migrations, and runs the web app on port 3000
and the voice gateway on port 8080. For real phone calls, expose the gateway publicly, set
`PUBLIC_HOST` and the `TWILIO_*` variables, and point your Twilio number's voice webhook at
`https://<host>/twilio/voice`.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md): how each part works and why.
- [docs/ROADMAP.md](docs/ROADMAP.md): the sixteen phases and what each experiment showed.
- [CONTRIBUTING.md](CONTRIBUTING.md): commands, layout and conventions.
