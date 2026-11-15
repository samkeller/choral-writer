# Choral Writer

## Project shape

- pnpm monorepo: `apps/server` (Fastify/PostgreSQL), `apps/web` (React/Vite), and `packages/engine` (shared TypeScript engine).
- The server owns HTTP, persistence, turn orchestration, configuration, budgets, and provider access. The engine owns deterministic contracts, context rules, memory reduction/replay, and narration parsing.
- Keep the current modular-monolith deployment. Do not add services, database normalization, or a UI framework without a demonstrated need.

## Invariants

- Events are append-only and memory changes go through the engine reducer. Branch projections must remain replayable from their mutation events.
- Keep analysis-agent context visibility restrictions intact; do not expose private facts through history, summaries, or recent prose.
- Preserve explicit turn status/recovery behavior, project locks, budget reservations, and trace persistence.
- Add database changes as new Drizzle migrations; never edit an already-applied migration.
- LLM and user input are untrusted. Validate with existing Zod schemas and surface failures.
- LLM prompts, responses, and debug traces are persisted; do not log or expose them outside authenticated flows.

## Workflow

- Install: `pnpm install`
- Develop: `pnpm dev` (requires the root `.env` and PostgreSQL)
- Validate: `pnpm typecheck`, `pnpm test`, `pnpm build`
- PostgreSQL integration tests require a reserved database in `TEST_DATABASE_URL`; they apply migrations.
- Keep pure rules in `packages/engine` and persistence/provider orchestration in `apps/server`.
