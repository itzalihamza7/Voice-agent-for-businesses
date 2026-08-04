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
| Open the app | https://voice-agent.ddev.site |
| Unit tests (Vitest, all workspaces, no DB) | `ddev npm test` |
| DB integration tests (`*.db.test.ts`, real Postgres) | `ddev npm run test:db` |
| Lint (ESLint) | `ddev npm run lint` |
| Type-check all workspaces | `ddev npm run typecheck` |
| Production build (type-check + `next build`) | `ddev npm run build` |
| Format / check formatting (Prettier) | `ddev npm run format` / `ddev npm run format:check` |
| Regenerate Prisma client | `ddev npm run db:generate` |
| Create + apply a DB migration after editing `schema.prisma` | `ddev npm run db:migrate -- --name <change>` |
| Apply migrations + seed demo data (idempotent) | `ddev npm run db:setup` |
| Postgres shell | `ddev psql` |
| Dev server logs | `ddev logs -s web -f` |
| Stop (DB data is kept) | `ddev stop` |

Before saying a task is done: `test`, `test:db`, `lint` and `build` must all pass.
DDEV syncs files with Mutagen: if the container doesn't see a change yet, run `ddev mutagen sync`.

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
- Adding a node type touches four places: schema in `flow.ts`, rules in `flow-validation.ts`,
  catalog entry in `apps/web/src/features/builder/node-catalog.ts`, form in `NodeSettingsPanel.tsx`.
  Exhaustive `switch`es and the catalog's mapped type make TypeScript point at any you miss.
- Agent configs are validated with `AgentConfigSchema` (Zod) on save and on read. Versions are
  never edited in place: every save creates a new version.
- Every database query is scoped by `businessId` (`PrismaAgentConfigStore` is created per business).
  Until auth exists, everything uses `DEFAULT_BUSINESS_ID` (`demo-business`).
- Database tables and columns are snake_case (`@@map` / `@map`); Prisma models are PascalCase.
- API route handlers stay thin: validate the body with a shared Zod schema (`parseJsonBody`),
  call the orchestrator, return JSON. Known errors map to status codes in `errorResponse`.
- Tests sit next to the code as `*.test.ts` and must not need the database or network; use mocks.
  Tests that need Postgres are named `*.db.test.ts`, create their own throwaway business, and delete it afterwards.
- A new `AgentConfigStore` implementation must pass `describeAgentConfigStore` (the contract tests).
- Prefix intentionally unused parameters with `_`. Dropping fields with `const { id, ...rest } = obj` is allowed.
- Secrets never go in the repo. `.env.example` lists variable names only.
- Pinned on purpose: TypeScript 6.0 (typescript-eslint does not support 7 yet), ESLint 9
  (some eslint-config-next plugins do not support 10 yet), Prisma 7 (8 is still a release candidate).
