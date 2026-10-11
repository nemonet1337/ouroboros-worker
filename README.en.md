# Ouroboros

> An AI-driven self-healing system that continuously scans, fixes, and evolves your codebase.

🌐 **Japanese: [README.md](./README.md)**

Ouroboros detects issues, uses an LLM to analyze and generate patches, and opens pull
requests automatically — with authentication, multi-tenant API tokens, and structured logging.

**Dual target** — Node.js 24 (Docker / on-premises) is the primary deployment and
Cloudflare Workers is the secondary one. The business logic is shared; only the
platform adapters under `src/adapters/` differ.

- **Node / Docker**: `node:http` + `node:sqlite` (in-process) + `LlmGateway` (external REST)
- **Cloudflare**: D1 + Queues + static assets. The same `LlmGateway` drives the AI
  (`fetch` works on Workers).

> **AI gateway:** model ids use the **`provider/model`** form (for example
> `openai/gpt-6-luna`). Keys live only in `.env` (Node) or Worker secrets (Cloudflare);
> the GUI reports whether a key is set but never its value. Startup requires
> `GITHUB_TOKEN` plus at least one AI key.

---

## Architecture

```
src/
├── adapters/      Platform adapters
│   ├── sqlite.adapter.ts     DbAdapter (node:sqlite)     ← standalone Node
│   ├── rqlite.adapter.ts     DbAdapter (rqlite HTTP API) ← Docker db service
│   ├── d1.adapter.ts         DbAdapter (Cloudflare D1)   ← Cloudflare only
│   ├── memory.queue.ts       QueueAdapter (serial queue)  ← Node only
│   ├── cf.queue.ts           QueueAdapter (CF Queues)     ← Cloudflare only
│   ├── memory.ratelimiter.ts RateLimiter (fixed window)   ← shared
│   └── ai/       LlmGateway (4 providers) and decisions (Decisions API / Laya)
├── analytics/     AI usage accumulator and cost estimator
├── analyzers/     AI analysis engine (finding grouping, risk scoring)
├── auth/          Authentication, sessions, API token management
├── code/          Code session management, version tracking, caching
├── config/        Settings and per-language rules (10 languages)
├── db/            SQLite migrations (TS mirror + .sql)
├── flags/         Feature flag management
├── healing/       Self-healing orchestrator (lifecycle = serial execution)
├── http/          Hono-based REST API
├── inspection/    AI scoring engine (6 dimensions, 32 aspects)
├── logging/       Structured logger (stdout / Workers Logs)
├── ports/         Adapter interfaces (Ports & Adapters pattern)
├── pr/            PR body/title generation, dedup
├── queues/        Serial GUI-event processing
├── refactor/      Refactoring proposal management
├── retrieval/     Index-less code search (file selector + chunk rank)
├── routing/       Model-tier routing from the difficulty decision
├── schemas/       JSON schema definitions
├── ui/            Server-side rendered UI (Hono JSX)
├── utils/         Escalator, fix cache
├── vcs/           GitHub integration (fetch-based)
├── types.ts       All type definitions
├── context.ts     Dependency injection (assemble / buildContext / buildContextFromBindings)
├── cron.ts        Hourly cron (stale sweep + scheduled healing)
├── env.ts         AppConfig, loadConfig(), CloudflareBindings
├── app.tsx        Shared routes (fetch/crypto only)
├── server.ts      Node entry point (node:http)
└── worker.tsx     Cloudflare entry point (fetch / queue / scheduled)
```

| Port            | Node / Docker                       | Cloudflare Worker            |
| --------------- | ----------------------------------- | ---------------------------- |
| `DbAdapter`     | `node:sqlite` (in-process) or `rqlite` (separate container) | D1 (`D1Adapter`)             |
| `QueueAdapter`  | In-memory serial queue (`MemoryQueue`) | CF Queues (`CfQueueAdapter`) |
| `AiProvider`    | `LlmGateway` (OpenAI / Anthropic / xAI / OpenRouter) | the same `LlmGateway` |
| `VcsProvider`   | GitHub (fetch)                      | GitHub (fetch)               |
| `HealingRunner` | `RepoRunner` (in-process, GitHub REST API) | the same `RepoRunner` |
| `RateLimiter`   | Fixed window in-memory (`MemoryRateLimiter`) | the same (isolate-scoped approximation) |

Note: scan, fix, commit, and PR creation run **in-process / in-isolate via `RepoRunner`**
using the GitHub REST API. The healing lifecycle is driven by `HealingLifecycle`
(serial). Cancelling sets `healing_runs.status = "canceled"` via
`POST /healing/:runId/cancel`, and each step checks it before starting.

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
`OURO_REGISTRATION_ENABLED` (default false). `OURO_DB=rqlite` with
`OURO_RQLITE_URL=http://127.0.0.1:4001` switches to a networked SQLite (rqlite).

When a required key is missing the process refuses to start and prints why.

### Admin account

- On a fresh install with zero users you are redirected to `/register`.
- **The first registered account becomes admin**, and public registration locks
  automatically (re-enable it from the Admin page).

---

## Quick start — Docker

```bash
cp .env.example .env        # fill in your keys
docker compose up --build
```

- Serves on `http://127.0.0.1:3000` (`GET /api/v1/health` to check).
- **SQLite runs in a separate `db` container ([rqlite](https://rqlite.io/))**. rqlite serves
  SQLite over Raft + an HTTP API, so the app connects to the DB over the network with
  `OURO_DB=rqlite` / `OURO_RQLITE_URL=http://db:4001` — the same shape as
  Worker → D1 on Cloudflare.
- Data (Raft log + SQLite files) persists in the named volume `ouroboros-db`.
  Back it up with something like
  `docker run --rm -v ouroboros-worker_ouroboros-db:/data alpine tar czf - -C /data . > backup.tgz`.
- The app starts only after the `db` healthcheck passes, then applies migrations on boot.
- The host `./data` directory is unused while `OURO_DB=rqlite`. To run with in-process
  SQLite instead, leave `OURO_DB` unset (default `sqlite`) and add
  `./data:/app/data` as a volume.

---

## Quick start — Cloudflare Worker

The secondary deployment target. It uses D1 and Queues (no Workflows).

```bash
# 1. Create the D1 database (first time only)
npx wrangler d1 create ouroboros

# 2. Write database_id into wrangler.toml (treated as a secret, never committed)
scripts/resolve-d1.sh
#   or: D1_DATABASE_ID=<uuid> scripts/resolve-d1.sh

# 3. Apply migrations (first time only; wrangler applies the .sql files in order)
npm run d1:migrate

# 4. Create the queues (first time only)
npx wrangler queues create ouroboros-gui-events
npx wrangler queues create ouroboros-dlq

# 5. Set secrets
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put OPENAI_API_KEY     # another provider also works

# 6. Build (build:css) then deploy
npm run deploy
```

- `npm run deploy` runs `npm run build && wrangler deploy`. Tailwind CSS is copied to
  `public/assets/tailwind.css` and served as a static asset (the Worker is never invoked).
- With **Workers Builds**, set the Deploy command to `npm run deploy`. Wrangler's
  `[build] command` is intentionally absent because Workers Builds ignores it.
- Migrations are applied by `wrangler d1 migrations apply` alone. `runMigrations()`
  (the TS mirror) only runs on Node boot and is never called on the Cloudflare path
  (`0013` contains a non-idempotent `ALTER TABLE` that fails on a double apply).

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
- **Telemetry** — structured logs on stdout / Workers Logs; prompt cache hits show in the
  heal history.
- **Async orchestration** — GUI events are processed asynchronously (Node: in-memory serial
  queue, Cloudflare: CF Queues). Failures retry with exponential backoff up to 3 times,
  then log. Unprocessed events are lost on shutdown but recoverable via
  `healing_runs.status` / `code_sessions.status`.
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
npm run build:css                      # build Tailwind and copy to public/assets
npm run dev                            # build:css + tsx src/server.ts
npm start                              # tsx src/server.ts
npx wrangler deploy --dry-run --outdir dist   # verify the Cloudflare build (no auth needed)
npm run deploy                         # deploy to Cloudflare
npm run d1:migrate                     # apply D1 migrations (--remote)
```

CI runs two jobs: `test` (typecheck + vitest) and `deploy-dry-run`
(`wrangler deploy --dry-run` to catch Cloudflare bundle regressions). The dry run needs
no authentication, so no Cloudflare secrets are required in CI.

---

## Risks and caveats

- `node:sqlite` is Stability 1.2 (release candidate). It is confined behind `DbAdapter`, so
  swapping it out is easy.
- Docker can run SQLite in a separate rqlite container (`OURO_DB=rqlite`). Even as a single
  node, rqlite carries a Raft log, so writes are slower than in-process SQLite (healing is
  not bottlenecked by it).
- The rqlite `db` service pins `NODE_ID` and the advertised addresses in compose because a
  container's hostname (its container ID) changes on every restart. Without that, the node
  stops matching its Raft configuration, election stops, and `/db/execute` keeps
  returning 503 (no leader).
- On Cloudflare, healing runs **serially inside a Queue consumer**, so one invocation must
  stay within the 10–15 minute CPU limit (Workflows are not used).
- The Cloudflare `RateLimiter` is an **isolate-scoped approximation** (the Workers Rate
  Limiting API is not used).
- The Cloudflare path never calls `runMigrations()`. `0013` contains a non-idempotent
  `ALTER TABLE` that fails if applied a second time after wrangler already ran it.
- `database_id` in `wrangler.toml` is treated as a secret and never committed; resolve it
  with `scripts/resolve-d1.sh` before deploying.
- Anthropic / xAI cannot serve the Decisions API; the router model must be `openai/*` or
  `openrouter/*`.
- Anthropic cannot serve embeddings.
- Decision `score` answers are level-index based (0-based) probability-weighted averages, so
  every backend applies a +1 normalization.
- Laya is weak with `choice` sets larger than 20; file selection therefore uses batched
  `noul` scoring.
- `/v1/systemone/batch` requires laya-serve 0.3.22+. Older versions return 404 and trigger
  the fallback.
- The in-memory queue loses unprocessed events on restart (Cloudflare keeps them in CF Queues).
- There is no local DLQ (log output only; Cloudflare uses the `ouroboros-dlq` queue).
- Keys only live in `.env` / Worker secrets, so the GUI cannot add one; changing keys
  requires a restart.

---

## Out of scope

- Workflows-based orchestration (replaced by serial execution in the Queue consumer)
- The Workers Rate Limiting API (approximated with the fixed-window in-memory limiter)
- Migrating D1 data (D1 is built fresh from the schema)
- Multi-process / horizontal scaling
- A static pricing catalog (live fetching only)

---

## License

Apache-2.0 — see [LICENSE](./LICENSE).
