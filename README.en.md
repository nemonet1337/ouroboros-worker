# Ouroboros

> An AI-driven self-healing system that continuously scans, fixes, and evolves your codebase.

🌐 **日本語版: [README.md](./README.md)**

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/nemonet1337/ouroboros)

Ouroboros detects issues, uses an LLM to analyze and generate patches, and opens pull
requests automatically — with authentication, multi-tenant API tokens, telemetry logging,
and email alerting.

It is **built exclusively for Cloudflare Workers** (Workers + D1 + R2 + Queues + Workflows +
Workers AI + Vectorize).

> **AI gateway:** Ouroboros only ever connects to LLMs hosted on **Cloudflare Workers AI**
> (default model: `minimax/m3`). Every model Workers AI serves is selectable from the GUI
> settings screen. The only AI credential is the dedicated Workers AI API token,
> **`WORKERS_AI_API_TOKEN`** (a Worker secret) — external gateway tokens (Anthropic /
> OpenAI / Gemini / OpenRouter) are rejected at the API layer.

---

## Architecture

```
src/
├── adapters/      Cloudflare service adapters (D1, R2, Queues, Workers AI, Vectorize …)
├── analytics/     AI usage tracker and cost estimator
├── analyzers/     AI analysis engine (finding grouping, risk scoring)
├── auth/          Authentication, sessions, API token management
├── code/          Code session management, version tracking, caching
├── config/        Settings and per-language rules (10 languages)
├── db/            D1/SQLite layer (7 tables, migrations)
├── flags/         Feature flag management
├── healing/       Self-healing orchestrator
├── http/          Hono-based REST API
├── inspection/    AI scoring engine (6 dimensions, 32 aspects)
├── logging/       Structured logger (R2-persisted)
├── notifications/ Email alerts and notifications
├── ports/         Adapter interfaces (Ports & Adapters pattern)
├── pr/            PR body/title generation, dedup, auto-merge
├── queues/        Cloudflare Queues handler
├── refactor/      Refactoring proposal management
├── schemas/       JSON schema definitions
├── testing/       Browser testing utilities
├── ui/            Server-side rendered UI (Hono JSX)
├── utils/         Crypto, escalator, fix cache
├── vcs/           GitHub integration (fetch-based)
├── webhook/       Webhook dispatch (Slack, Discord, GitHub, Generic)
├── workflows/     Cloudflare Workflows (durable healing lifecycle)
├── types.ts       All type definitions
├── context.ts     Dependency injection
├── env.ts         Cloudflare bindings type
└── index.tsx      Worker entry point
```

| Port           | Implementation (Cloudflare Worker)      |
| -------------- | --------------------------------------- |
| `DbAdapter`    | D1                                      |
| `LogStore`     | R2 objects                              |
| `QueueAdapter` | Cloudflare Queues                       |
| `AiProvider`   | Workers AI (the only AI gateway)        |
| `Mailer`       | MailChannels / CF Email Routing         |
| `VcsProvider`  | GitHub (fetch)                          |
| `HealingRunner`| `RpcRunner`(Service Binding) / `DispatchRunner`(HTTP) → CF Worker runner |
| `RateLimiter`  | Workers Rate Limiting API               |
| `VectorizePort`| Cloudflare Vectorize (adaptive weighting)|

Note: Workers lack a filesystem/git/compilers, so patch application, commit, and push are
**delegated via Service Binding or HTTP** to the `ouroboros-runner` Worker (GitHub API-based).
When no runner is configured, the fix step is skipped via `NoopRunner`.
A **Cloudflare Workflow** drives the durable scan → analyze → fix → PR lifecycle.

---

## Quick start — Cloudflare

The fastest path is the **Deploy to Cloudflare** button above. Manual setup:

```bash
npm install
npm run build:web                                   # GUI → web/.output/public (served via ASSETS)

wrangler d1 create ouroboros                         # paste the id into wrangler.toml
wrangler r2 bucket create ouroboros-logs
wrangler queues create ouroboros-gui-events
wrangler d1 migrations apply ouroboros               # schema from src/db/migrations/

# Vectorize index (for adaptive weighting, optional)
wrangler vectorize create ouroboros-weight-profiles --dimensions=32 --metric=cosine

wrangler secret put WORKERS_AI_API_TOKEN             # (optional) dedicated Workers AI API token
wrangler secret put GITHUB_TOKEN
wrangler secret put GITHUB_REPOSITORY               # owner/repo (auto-detected from token if omitted)
wrangler secret put RUNNER_SHARED_SECRET            # (optional) auth for the dispatched runner

wrangler deploy                                      # or: wrangler dev
```

`wrangler.toml` wires D1, R2, Queues, Workflows, Workers AI, Vectorize, the Rate Limiting binding,
the daily cron trigger, and the static GUI assets.

### Admin account

- No environment variables needed. After deploying, open the app in a browser: **while no
  user exists the login page automatically redirects to `/register`**.
- **The first registered account becomes the admin**, and public registration is locked
  afterwards (re-enable it from the Admin page toggle).

### AI models

- The default model is **`minimax/m3`**.
- `GET /api/v1/models` discovers every model from your account's Workers AI catalog, and
  **all of them are selectable from the GUI settings screen**.
- Each user can set their personal model preference via `GET/PUT /api/v1/settings/model`;
  the personal setting takes precedence during inspection (falls back to `minimax/m3` if unset).
- The only AI credential is **`WORKERS_AI_API_TOKEN`**. Combined with
  `CLOUDFLARE_ACCOUNT_ID` it routes inference through the Workers AI REST API; without it
  the in-Worker AI binding is used directly.

---

## Features

- **Self-healing loop** — scan → AI analysis/grouping → AI fix + validation →
  PR creation → optional auto-merge (CI gate + AI safety review) → escalation issues.
- **Authentication & multi-tenancy** — email/password (WebCrypto PBKDF2), httpOnly sessions,
  and scoped, revocable **API tokens** (`read` / `inspect` / `heal` / `admin`).
- **Registration control** — admin toggle for public registration; the first registered
  user becomes the admin.
- **Telemetry** — structured logs persisted as flat `.log` files in R2.
- **Email alerts** — high-risk scans and failed fixes via MailChannels.
- **Async orchestration** — GUI events via Cloudflare Queues; healing lifecycle via Workflows.
- **Rate limiting** — Workers Rate Limiting on public endpoints.
- **Code inspection** — AI scoring engine exposed at `POST /api/v1/inspect`.
  Scores six weighted dimensions (security / performance / redundancy / readability / design /
  correctness) per file or per function/method/class (`granularity: "function"`), and returns
  prioritised `refactorCandidates` selected heuristically from low-scoring units.
- **Adaptive weighting** — Vectorize stores 32-aspect scores as 32-dimensional vectors and
  automatically adjusts aspect weights based on historical performance.
- **Code sessions** — Request AI code generation by specifying repository, branch, and
  instructions. Generated patches are automatically applied as pull requests.
- **Refactoring proposals** — AI generates concrete improvement suggestions from inspection
  results and manages them with priority ranking.
- **AI usage analytics** — Analytics Engine tracks AI inference usage and costs.
- **Feature flags** — Manage gradual rollouts of experimental features.

---

## API (selected)

Base path: **`/api/v1`** (`/api` is kept as a backward-compatible alias).
Machine-readable: `GET /api/v1/openapi.json`.

| Method | Path                          | Auth            |
| ------ | ----------------------------- | --------------- |
| POST   | `/api/v1/auth/register`       | public*         |
| POST   | `/api/v1/auth/login`          | public          |
| GET    | `/api/v1/auth/me`             | session/token   |
| GET/POST/DELETE | `/api/v1/tokens`     | session/token   |
| GET/PUT | `/api/v1/config`             | admin (PUT)     |
| GET/PUT | `/api/v1/settings`           | admin (PUT)     |
| GET/PUT | `/api/v1/settings/model`     | session/token   |
| GET     | `/api/v1/models`              | session/token   |
| POST   | `/api/v1/inspect`             | scope `inspect` |
| POST   | `/api/v1/healing`            | scope `heal`    |
| GET    | `/api/v1/metrics`             | session/token   |
| GET    | `/api/v1/logs`                | admin           |
| GET/POST | `/api/v1/code/sessions`     | session/token   |
| GET     | `/api/v1/code/sessions/:id`   | session/token   |
| POST    | `/api/v1/code/sessions/:id/generate` | session/token |
| POST    | `/api/v1/code/sessions/:id/apply`    | session/token |
| GET/POST | `/api/v1/refactor/proposals` | session/token   |

\* gated by the registration toggle (always allowed for the first/admin user).
Tokens are sent as `Authorization: Bearer ouro_…`. Errors use a unified
`{ "error": { "code", "message" } }` envelope.

---

## GUI pages

- `/` — Home (dashboard)
- `/healing` — Self-healing run history
- `/inspection` — Code inspection results
- `/code` — Code session list
- `/code/new` — Create new code session
- `/code/sessions/:id` — Code session details
- `/refactor` — Refactoring proposals
- `/webhooks` — Webhook configuration
- `/tokens` — API token management
- `/settings` — Personal settings (AI model selection)
- `/admin` — Admin settings (registration toggle, user management)

---

## Development & testing

```bash
npm run typecheck                      # TypeScript type check
npm run test                           # vitest unit tests (src/__tests__/)
npm run dev --workspace web            # Nuxt dev server
npm run worker:dev                     # wrangler dev
```

---

## License

Apache-2.0 — see [LICENSE](./LICENSE).
