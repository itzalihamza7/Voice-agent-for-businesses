# Contributing

Learning project: a platform where businesses build AI voice agents for phone support.
No real AI vendors or API keys yet: the pipeline uses mocks. Agents and config versions are stored in Postgres.
See ARCHITECTURE.md for the structure and docs/ROADMAP.md for the planned phases.

## Commands

Run everything through DDEV (Docker). `node_modules` is installed inside the Linux
container, so plain `npm ...` on macOS will fail on native binaries.

| Task | Command |
|---|---|
| Start everything (installs deps, migrates + seeds DB, runs Next.js) | `ddev start` |
| Open the app (sign in as demo@example.com / demo-password) | https://voice-agent.ddev.site |
| Unit tests (Vitest, all workspaces, no DB) | `ddev npm test` |
| DB integration tests (`*.db.test.ts`, real Postgres) | `ddev npm run test:db` |
| Lint (ESLint) | `ddev npm run lint` |
| Type-check all workspaces | `ddev npm run typecheck` |
| Production build (type-check + `next build`) | `ddev npm run build` |
| Format / check formatting (Prettier) | `ddev npm run format` / `ddev npm run format:check` |
| Regenerate Prisma client | `ddev npm run db:generate` |
| Start Ollama (runs on the Mac, not in DDEV) | `brew services start ollama` |
| Download the local model | `ollama pull llama3.1:8b` |
| Download the local embedding model (knowledge base) | `ollama pull nomic-embed-text` |
| Create + apply a DB migration after editing `schema.prisma` | `ddev npm run db:migrate -- --name <change>` |
| Apply migrations + seed demo data (idempotent) | `ddev npm run db:setup` |
| Add the example knowledge documents (only while the knowledge base is empty) | `ddev npm run kb:seed` |
| Simulated phone call through the voice gateway | `ddev exec -d /var/www/html/apps/voice-gateway npm run fake-call` |
| Postgres shell | `ddev psql` |
| Dev server logs | `ddev logs -s web -f` |
| End-to-end tests (Playwright, against DDEV) | `npm run test:e2e` |
| Production images and stack | `docker compose up --build` |
| Stop (DB data is kept) | `ddev stop` |

Before saying a task is done: `test`, `test:db`, `lint` and `build` must all pass.
DDEV syncs files with Mutagen: if the container doesn't see a change yet, run `ddev mutagen sync`.
If the dev server reports a new export from a workspace package as `undefined`, its module cache is
stale: run `ddev restart`.
Right after code changes sync in, open pages reload (several times for server code): wait for it to
settle before testing in the browser.

## Layout

- `apps/web`: Next.js App Router frontend + thin API routes in `src/app/api`.
  `src/features/builder/` is the React Flow agent builder; `src/features/agents/` the agent list.
  Server-only wiring (Prisma client, store per business, HTTP helpers) lives in `src/server/`.
- `packages/shared`: types + Zod schemas used by both the UI and the pipeline.
- `packages/pipeline`: STT -> LLM -> TTS behind provider interfaces; `registry.ts` maps names to implementations.
- `packages/agent-config`: versioned agent config storage. `AgentConfigStore` interface, in-memory and
  Prisma implementations, and `store.contract.ts` (tests every implementation must pass).
- `packages/orchestrator`: use cases between the web app and the rest (agents, sessions) and the
  conversation engine (`conversation.ts`: walks a flow turn by turn, pure functions). No HTTP code.
- `packages/tools`: tools agents can call (built-in booking mock, webhooks, MCP client, SSRF guard).
- `packages/rag`: the knowledge base: extraction, chunking, embedding, `KnowledgeStore` (pgvector +
  full-text) and `searchKnowledge()` (hybrid, rewrite, rerank). The page is `apps/web/src/app/knowledge`.
- `packages/db`: Prisma 7 + PostgreSQL. Schema, migrations and seed in `prisma/`.
  Generated client goes to `src/generated/` (gitignored).
- `.ddev/config.voice-agent.yaml`: our DDEV settings. Don't put them in `config.yaml`: `ddev config` rewrites it.

## Conventions

- TypeScript strict mode everywhere (`tsconfig.base.json`, plus `noUncheckedIndexedAccess`).
- Workspace packages are named `@voice-agent/<name>` and export TypeScript source from
  `src/index.ts` (no build step). When `apps/web` starts importing a new package, add it
  to `transpilePackages` in `apps/web/next.config.ts` and to `apps/web/package.json`.
- Dependencies point one way: `web -> orchestrator -> pipeline / agent-config -> db / shared`.
  `shared` imports nothing internal. UI code never imports `pipeline` or `db` directly
  (only `apps/web/src/server/` wires up the database).
- Every external vendor sits behind an interface in `packages/pipeline/src/providers/<step>/types.ts`.
  A new vendor = a new file implementing the interface + one line in `registry.ts`.
  Each interface keeps a `mock.ts` for tests.
- Flow checks have two levels. Zod schemas (`packages/shared/src/flow.ts`) check *shape* only and accept
  unfinished drafts, so work in progress can always be saved. `validateFlow()` (`flow-validation.ts`)
  checks the flow is *complete enough to run*; the builder shows its issues live.
- Adding a node type (latest: Hand off) touches four places: schema in `flow.ts`, rules in `flow-validation.ts`,
  catalog entry in `apps/web/src/features/builder/node-catalog.ts`, form in `NodeSettingsPanel.tsx`.
  Exhaustive `switch`es and the catalog's mapped type make TypeScript point at any you miss.
- Agent configs are validated with `AgentConfigSchema` (Zod) on save and on read. Versions are
  never edited in place: every save creates a new version.
- Every database query is scoped by `businessId`. Server code gets it with `currentBusinessId()`
  (set by the proxy from the session) or explicitly (phone calls: the agent's business). Never
  read a business id from the request body or the client's headers.
- Database tables and columns are snake_case (`@@map` / `@map`); Prisma models are PascalCase.
- API route handlers stay thin: validate the body with a shared Zod schema (`parseJsonBody`),
  call the orchestrator, return JSON. Known errors map to status codes in `errorResponse`.
- Tests sit next to the code as `*.test.ts` and must not need the database or network; use mocks.
  Tests that need Postgres are named `*.db.test.ts`, create their own throwaway business, and delete it afterwards.
- A new `AgentConfigStore` implementation must pass `describeAgentConfigStore` (the contract tests).
- Prefix intentionally unused parameters with `_`. Dropping fields with `const { id, ...rest } = obj` is allowed.
- Secrets never go in the repo. They go in `.ddev/.env.web` (git-ignored, loaded into the web
  container); `.env.example` lists variable names only. Never print a key in logs or output.
- Language models are created through `packages/pipeline/src/registry.ts` from a provider plus an
  optional model (`{ provider: "ollama", model: "qwen3:8b" }`). OpenAI models must be in the
  `OPENAI_MODELS` allow-list; when adding one, also add its price to `pricing.ts` (with the date
  checked). Prompts live in `packages/orchestrator/src/prompts.ts`.
- Any model pulled with `ollama pull ...` shows up in the test chat's pickers without a restart.
- Prompt settings and `buildSystemPrompt()` live in `packages/shared/src/prompt.ts`, used by both
  the editor preview and the server. New built-in variables go in `BUILT_IN_VARIABLES` and
  `builtInVariables()`. Platform rules (`PLATFORM_RULES`) are not user-editable on purpose.
- Fields added to `AgentConfig` after versions exist need a Zod `.default(...)` so older stored
  versions still parse (as done for `prompt`).
- "The AI understands, the code calculates and checks": ask models for structured JSON
  (`jsonSchema` option), never trust the content without validating it in code, and do maths
  (dates, times) in code. Put a `reason` field before the decision field in JSON schemas.
- Prompt changes are measured, not guessed: run the same cases against Ollama and OpenAI models
  before and after a change (see the findings in docs/ROADMAP.md).
- Tools live in `packages/tools` (built-in, webhook, MCP) and run through
  `packages/orchestrator/src/tool-runner.ts`. Tool results that decide a path use Branch rules
  (variable equals value), not the AI. Branch decisions ask the model for the path's label text,
  not a number.
- Webhook and MCP URLs go through the SSRF guard (`assertPublicUrl`). Only DDEV sets
  `TOOLS_ALLOW_PRIVATE_HOSTS=true`; never enable it in production.
- The built-in booking tools keep bookings in memory: `ddev restart` empties the mock calendar.
  Browser tests use their own fixture agents, never the real agents.
- Knowledge base: documents belong to a business (shared by its agents) and every chunk is
  embedded with every model in `EMBEDDING_MODELS`; calls use the first. Documents added before an
  embedding model was added have no vectors for it (no re-embed button yet: delete and re-add). Vector searches must name the embedding model, and every
  knowledge query filters by `businessId`. Reranking stays on by default: it is what drops
  irrelevant passages, so the agent says "I don't know" instead of inventing an answer.
- pgvector comes from `.ddev/db-build/Dockerfile`. The `vector` column is `Unsupported` in Prisma:
  read and write embeddings with raw SQL in `packages/rag/src/store.ts`.
- Memory & context: AI prompts get the call through `buildContext` / `decisionContext`
  (`packages/orchestrator/src/context.ts`), never the raw transcript. Branch decisions get only the
  last few spoken messages: more context made routing worse. New per-call state fields need a Zod
  `.default(...)` so states from older browsers still parse.
- Caller memory facts are written by the AI and checked by code (`checkFacts`): never store
  payment details, and keep the Forget button working (callers can ask to be forgotten).
- LangGraph runs the call lifecycle (`call-graph.ts`: one thread per call, `interrupt()` to wait
  for the caller, Postgres checkpoints); our engine (`runTurn`) runs the flow's steps. Model and
  RAG code stay our own on purpose. Never put API clients or keys into graph state or
  `configurable`: compile the graph per request with them in a closure.
- Guardrails (`guardrails.ts`) run in code on every call and aren't configurable per agent. New
  checks get a `guardrail` event and an eval case.
- Unit tests never call a real language model: use a scripted fake (see `conversation.test.ts`).
  Model behaviour is checked by hand or with live runs against both Ollama and OpenAI.
- Pinned on purpose: TypeScript 6.0 (typescript-eslint does not support 7 yet), ESLint 9
  (some eslint-config-next plugins do not support 10 yet), Prisma 7 (8 is still a release candidate).
