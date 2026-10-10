# Ouroboros

> An AI-driven self-healing system that continuously scans, fixes, and evolves your codebase.

🌐 **Japanese: [README.md](./README.md)**

Ouroboros detects issues, uses an LLM to analyze and generate patches, and opens pull
requests automatically — with authentication, multi-tenant API tokens, and structured logging.

It is **built exclusively for Node.js 24+** (`node:http` + `node:sqlite` + external AI
providers over REST). Docker / on-premises deployments were removed.

> **AI gateway:** model ids use the **`provider/model`** form (for example
> `openai/gpt-6-luna`). Keys live only in `.env`; the GUI reports whether a key is set
> but never its value. Startup requires `GITHUB_TOKEN` plus at least one AI key.

---

## Architecture

```
src/
├── adapters/      Platform adapters (sqlite, memory.queue, memory.ratelimiter, ai/)
│   └── ai/        LlmGateway (4 providers) and decisions (Decisions API / Laya)
├── analytics/     AI usage accumulator and cost estimator
├── analyzers/     AI analysis engine (finding grouping, risk scoring)
├── auth/          Authentication, sessions, API token management
├── code/          Code session management, version tracking, caching
├── config/        Settings and per-language rules (10 languages)
├── db/            node:sqlite layer (migrations)
├── flags/         Feature flag management
├── healing/       Self-healing orchestrator (lifecycle = serial execution)
├── http/          Hono-based REST API
├── inspection/    AI scoring engine (6 dimensions, 32 aspects)
├── logging/       Structured logger (stdout)
├── ports/         Adapter interfaces (Ports & Adapters pattern)
├── pr/            PR body/title generation, dedup
├── queues/        Serial GUI-event processing
├── refactor/      Refactoring proposal management
├── retrieval/     Index-less code search (file selector + chunk rank)
├── routing/       Model-tier routing from the difficulty decision
├── schemas/       JSON schema definitions
├── testing/       Browser testing utilities
├── ui/            Server-side rendered UI (Hono JSX)
├── utils/         Escalator, fix cache
├── vcs/           GitHub integration (fetch-based)
├── types.ts       All type definitions
├── context.ts     Dependency injection
├── cron.ts        Hourly cron (stale sweep + scheduled healing)
├── env.ts         AppConfig and loadConfig()
├── app.tsx        App routes
└── server.ts      node:http entry point
```

| Port           | Implementation (Node 24)                        |
| -------------- | ----------------------------------------------- |
| `DbAdapter`    | `node:sqlite` (`SqliteAdapter`)                 |
| `QueueAdapter` | In-memory serial queue (`MemoryQueue`)          |
| `AiProvider`   | `LlmGateway` (OpenAI / Anthropic / xAI / OpenRouter) |
| `VcsProvider`  | GitHub (fetch)                                  |
| `HealingRunner`| `RepoRunner` (in-process, GitHub REST API)      |
| `RateLimiter`  | Fixed window in-memory (`MemoryRateLimiter`)    |

Note: scan, fix, commit, and PR creation run **in-process via `RepoRunner`** using the
GitHub REST API. The healing lifecycle is driven by `HealingLifecycle` (serial, in-process).
Cancelling sets `healing_runs.status = "canceled"` via `POST /healing/:runId/cancel`, and
each step checks it before starting.

---

## Quick start — Node

```bash
npm install
cp .env.example .env        # fill in your keys

npm run build:css           # build Tailwind (GUI styles)
npm run dev                 # build:css + tsx src/server.ts
# or
npm start                   # tsx src/server.ts
```

Required `.env` entries:

| Key | Required | Purpose |
| --- | --- | --- |
| `GITHUB_TOKEN` | yes | PR / Issue creation. `owner/repo` is auto-detected from the token when unset |
| `OPENAI_API_KEY` | one or more | `openai/*` models |
| `ANTHROPIC_API_KEY` | 〃 | `anthropic/*` models |
| `XAI_API_KEY` | 〃 | `xai/*` models |
| `OPENROUTER_API_KEY` | 〃 | `openrouter/*` models |
| `LAYA_API_KEY` | no | Only when local Laya needs bearer auth |

Optional: `PORT` (default 3000), `OURO_DATA_DIR` (default `./data`),
`OURO_DB_PATH` (default `<dataDir>/ouroboros.sqlite`),
`OURO_REGISTRATION_ENABLED` (default false).

When a required key is missing the process refuses to start and prints why.

### Admin account

- On a fresh install with zero users you are redirected to `/register`.
- **The first registered account becomes admin**, and public registration locks
  automatically (re-enable it from the Admin page).

### AI models

Model ids are `provider/model`: `openai/*`, `anthropic/*`, `xai/*`, `openrouter/*`.
OpenRouter-hosted models are double-prefixed: `openrouter/openai/gpt-6-luna`.

`/models` picks three roles (system-wide, shared).

| Role | Default | Purpose |
| --- | --- | --- |
| Efficiency | `openai/gpt-6-luna` | Easy tasks; also inspection / healing / refactor |
| Performance | `openai/gpt-6-sol` | Code generation when the decision says "hard" |
| Embed | `openai/text-embedding-3-small` | Embeddings for code search |

Catalog models are fetched live from each provider's `GET /models` (60-minute TTL cache);
providers without a key never appear as candidates. Anthropic has no embedding models, so it
is rejected as `embedModel`.

### Difficulty decisions (Decisions API / local Laya)

Before code generation a decision model rates the implementation difficulty (1–5) and the
tier; anything at or above `solThreshold` uses Performance, below it uses Efficiency.
`/models` → "Difficulty decision" card switches the backend.

| Backend | Endpoint | Constraints |
| --- | --- | --- |
| `remote` (default) | OpenAI Decisions API (`POST /v1/decisions`, model `gpt-6-luna` only, limited preview) or OpenRouter Decisions (`POST /api/alpha/decisions`, `openrouter/typesafe/jev-1.13`) | `anthropic/*` and `xai/*` cannot serve decisions |
| `local` | Local laya-serve (`POST {url}/v1/systemone`, Jev-compatible) | Default `http://127.0.0.1:8000`, model `typed-decisions` |

Local Laya setup:

```bash
pip install "laya[serve]"
LAYA_DEVICE=cpu laya-serve          # listens on http://127.0.0.1:8000 by default
```

Switch the backend to **local Laya** in the GUI card and press "Connection test"
(it POSTs without questions; HTTP 400 means alive).

On failure it falls back to **remote → Efficiency tier**. Whether Laya also picks related
files is controlled by `localFileSelection` (`false` restores the old text-model path).

---

## Features

- **Self-healing loop** — scan → AI analysis and grouping → AI fix + verification → PR →
  escalation Issue (only for groups that could not be auto-fixed).
- **Auth and multi-tenancy** — email/password (WebCrypto PBKDF2), httpOnly sessions, and
  expirable, scoped **API tokens** (`read` / `inspect` / `heal` / `admin`).
- **Registration control** — admin toggle; the first user is the admin.
- **Telemetry** — structured logs on stdout; prompt cache hits show in the heal history.
- **Async orchestration** — GUI events go through an in-memory serial queue (concurrency 1).
  Failures retry with exponential backoff up to 3 times, then log. Unprocessed events are lost
  on shutdown but recoverable via `healing_runs.status` / `code_sessions.status`.
- **Rate limiting** — fixed window in-memory limiter.
- **Code inspection** — AI scoring via `POST /api/v1/inspect`. Weighted scores across
  6 dimensions (security / performance / redundancy / readability / design / correctness),
  per file or per function/method/class (`granularity: "function"`), plus prioritized
  `refactorCandidates` for the weakest units.
- **Automatic model tiering** — before code generation the decision model rates the task
  difficulty; above the threshold it uses Performance, below it Efficiency. The decision is
  recorded on the session.
- **Code sessions** — point at a repo/branch plus an instruction, and the generated patch is
  applied as a PR automatically.
- **Refactoring proposals** — AI-generated, prioritized improvements from inspection results.
- **AI usage analytics** — DB-backed usage summarized at `/api/v1/metrics`.
- **Feature flags** — staged rollout of experimental features.

---

## API (excerpt)

Base path: **`/api/v1`** (`/api` is kept as a backwards-compatible alias).
Machine-readable: `GET /api/v1/openapi.json`.

| Method | Path                        | Auth               |
| ------ | --------------------------- | ------------------ |
| POST   | `/api/v1/auth/register`     | public*            |
| POST   | `/api/v1/auth/login`        | public             |
| GET    | `/api/v1/auth/me`           | session/token      |
| GET/POST/DELETE | `/api/v1/tokens`   | session/token      |
| GET    | `/api/v1/config`            | session/token      |
| GET/PUT | `/api/v1/settings`         | admin (PUT)        |
| GET/PUT | `/api/v1/settings/model`   | session/token      |
| GET    | `/api/v1/models`            | session/token      |
| POST   | `/api/v1/inspect`           | scope `inspect`    |
| POST   | `/api/v1/healing`           | scope `heal`       |
| GET    | `/api/v1/metrics`           | session/token      |
| GET    | `/api/v1/logs`              | admin              |
| GET/POST | `/api/v1/code/sessions`   | session/token      |
| GET    | `/api/v1/code/sessions/:id` | session/token      |
| POST   | `/api/v1/code/sessions/:id/generate` | session/token |
| POST   | `/api/v1/code/sessions/:id/apply`    | session/token |
| GET/POST | `/api/v1/refactor/proposals` | session/token   |
| POST   | `/api/v1/settings/decision-test` | admin          |

\* Gated by the registration toggle (the first/admin user is always allowed).
Tokens are sent as `Authorization: Bearer ouro_…`. Errors use the unified shape
`{ "error": { "code", "message" } }`.

---

## GUI pages

- `/` — home (dashboard)
- `/healing` — healing run history
- `/inspection` — code inspection results
- `/code` — code session list
- `/code/new` — create a code session
- `/code/sessions/:id` — code session detail
- `/refactor` — refactoring proposals
- `/tokens` — API token management
- `/settings` — personal settings (AI model)
- `/models` — system-wide model roles and the difficulty-decision backend
- `/admin` — admin settings (registration toggle, user management)

---

## Development and tests

```bash
npm run typecheck                      # TypeScript type check
npm run test                           # vitest unit tests (src/__tests__/)
npm run build:css                      # build Tailwind
npm run dev                            # build:css + tsx src/server.ts
npm start                              # tsx src/server.ts
```

---

## Risks and caveats

- `node:sqlite` is Stability 1.2 (release candidate). It is confined behind `DbAdapter`, so
  swapping it out is easy.
- Anthropic / xAI cannot serve the Decisions API; the router model must be `openai/*` or
  `openrouter/*`.
- Anthropic cannot serve embeddings.
- Decision `score` answers are level-index based (0-based) probability-weighted averages, so
  every backend applies a +1 normalization.
- Laya is weak with `choice` sets larger than 20; file selection therefore uses batched
  `noul` scoring.
- `/v1/systemone/batch` requires laya-serve 0.3.22+. Older versions return 404 and trigger
  the fallback.
- The in-memory queue loses unprocessed events on restart.
- There is no local DLQ (log output only).
- Keys only live in `.env`, so the GUI cannot add one; changing keys requires a restart.

---

## Out of scope

- Migrating D1 data (a fresh SQLite database starts over)
- Multi-process / horizontal scaling
- A static pricing catalog (live fetching only)

---

## License

Apache-2.0 — see [LICENSE](./LICENSE).
