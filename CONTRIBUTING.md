# Contributing

Learning project: a platform where businesses build AI voice agents for phone support.
Currently boilerplate only: stubs and mocks, no real vendors, no API keys.
See ARCHITECTURE.md for the structure and the reasons behind it.

## Commands

Run everything through DDEV (Docker). `node_modules` is installed inside the Linux
container, so plain `npm ...` on macOS will fail on native binaries.

| Task | Command |
|---|---|
| Start everything (installs deps, runs Next.js + Postgres) | `ddev start` |
| Open the app | https://voice-agent.ddev.site |
| Tests (Vitest, all workspaces) | `ddev npm test` |
| Lint (ESLint) | `ddev npm run lint` |
| Type-check all workspaces | `ddev npm run typecheck` |
| Production build (type-check + `next build`) | `ddev npm run build` |
| Format / check formatting (Prettier) | `ddev npm run format` / `ddev npm run format:check` |
| Regenerate Prisma client | `ddev npm run db:generate` |
| Create + apply a DB migration | `ddev npm run db:migrate` |
| Postgres shell | `ddev psql` |
| Dev server logs | `ddev logs -s web -f` |
| Stop (DB data is kept) | `ddev stop` |

Before saying a task is done: `test`, `lint` and `build` must all pass.

## Layout

- `apps/web`: Next.js App Router frontend (builder, dashboard) + thin API routes in `src/app/api`.
- `packages/shared`: types + Zod schemas used by both the UI and the pipeline.
- `packages/pipeline`: STT -> LLM -> TTS behind provider interfaces; `registry.ts` maps names to implementations.
- `packages/agent-config`: versioned agent config storage (`AgentConfigStore` interface).
- `packages/orchestrator`: session logic between the web app and the pipeline (no HTTP code).
- `packages/db`: Prisma 7 + PostgreSQL. Generated client goes to `src/generated/` (gitignored).

## Conventions

- TypeScript strict mode everywhere (`tsconfig.base.json`, plus `noUncheckedIndexedAccess`).
- Workspace packages are named `@voice-agent/<name>` and export TypeScript source from
  `src/index.ts` (no build step). When `apps/web` starts importing a new package, add it
  to `transpilePackages` in `apps/web/next.config.ts` and to `apps/web/package.json`.
- Dependencies point one way: `web -> orchestrator -> pipeline / agent-config -> shared`.
  `shared` imports nothing internal. UI code never imports `pipeline` or `db` directly.
- Every external vendor sits behind an interface in `packages/pipeline/src/providers/<step>/types.ts`.
  A new vendor = a new file implementing the interface + one line in `registry.ts`.
  Each interface keeps a `mock.ts` for tests.
- Agent configs are validated with `AgentConfigSchema` (Zod) before saving. Versions are
  never edited in place: every save creates a new version.
- API route handlers stay thin: parse the request, call the orchestrator, return JSON.
- Tests sit next to the code as `*.test.ts`. Tests must not need the database or network; use mocks.
- Prefix intentionally unused parameters with `_`.
- Secrets never go in the repo. `.env.example` lists variable names only.
- Pinned on purpose: TypeScript 6.0 (typescript-eslint does not support 7 yet), ESLint 9
  (some eslint-config-next plugins do not support 10 yet), Prisma 7 (8 is still a release candidate).
