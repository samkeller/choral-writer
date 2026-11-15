# Development

## Prerequisites

- Node.js 22 or newer
- pnpm 10.32.1
- PostgreSQL
- An OpenAI-compatible LLM endpoint and credentials for real-provider use

## Setup

Copy `.env.example` to `.env` and configure `DATABASE_URL`, `APP_PASSWORD`, `COOKIE_SECRET`, `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL`. The app validates password and cookie-secret minimum lengths at startup. Do not commit `.env`.

```sh
pnpm install
pnpm build
pnpm db:migrate
pnpm dev
```

The web development server is on port 5173 and proxies `/api` to the server on port 3000. Do not expose the Vite development server to the public internet.

## Checks

```sh
pnpm typecheck
pnpm test
pnpm build
```

The server integration suite requires a **reserved test database** in `TEST_DATABASE_URL`; it applies the repository migrations and writes test data. Never point it at a development or production database.

```sh
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/choral_test pnpm --filter @choral/server test
```

Unit tests for deterministic memory, context, parsing, schedules, and LLM client behavior do not need a real provider. The 30-turn integration scenario uses a simulated provider. Real-provider coherence evaluation is separate and incurs provider cost.

## Change conventions

- Keep pure story rules in `packages/engine`; keep database, HTTP, environment, provider, and orchestration concerns in `apps/server`.
- Validate external data with Zod; prefer explicit DTOs over unchecked casts.
- Preserve event replay, branch visibility, turn recovery, budget accounting, and trace behavior.
- Add new Drizzle migrations rather than editing applied migrations.
- Add focused tests for new behavior and regression tests for changed invariants.
- Document non-obvious architecture decisions and current limitations; avoid repeating implementation details that are evident from types and code.
