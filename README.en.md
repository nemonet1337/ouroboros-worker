# Ouroboros

> An AI-driven self-healing system that continuously scans, fixes, and evolves your codebase.

🌐 **日本語版: [README.md](./README.md)**

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/nemonet1337/ouroboros)

Ouroboros runs **4 scanners** (CodeQL / dependencies / performance / secrets) to detect
issues, uses an LLM to analyze and generate patches, and opens pull requests automatically — with
authentication, multi-tenant API tokens, telemetry logging, and email alerting.

It is **deployment-dual**: the same shared core runs either **self-hosted via Docker Compose** or
**edge-native on Cloudflare** (Workers + D1 + R2 + Queues + Workflows + Workers AI).

> **v2 note:** the GitHub Actions execution model has been removed. Triggering is now an in-container
> scheduler (self-hosted) or a Cloudflare cron/Workflow (edge). GitHub is still used as the VCS
> backend for PRs/issues, behind a pluggable `VcsProvider`.

---

## Architecture

```
                         ┌──────────────────────────────┐
                         │      packages/core           │  runtime-agnostic
                         │  scanners · analyzer · fixer │  (shared library)
                         │  inspection · orchestrator   │
                         │  auth · db · logging         │
                         │  ports/  (the abstraction)   │
                         └───────────────┬──────────────┘
              ┌──────────────────────────┴──────────────────────────┐
              ▼                                                       ▼
   ┌────────────────────────┐                          ┌────────────────────────────┐
   │  apps/server (Docker)  │                          │   apps/worker (Cloudflare)  │
   │  Node + Hono           │                          │   Workers + Hono            │
   │  SQLite · FS logs      │                          │   D1 · R2 logs              │
   │  SMTP · in-proc queue  │                          │   MailChannels · Queues     │
   │  LocalRunner (git+CI)  │◀── dispatch /internal ───│   DispatchRunner            │
   │  AnthropicProvider     │       (heavy work)       │   WorkersAI (+Anthropic)    │
   │  interval cron         │                          │   Workflows · Rate Limiting │
   └────────────────────────┘                          └────────────────────────────┘
```

Every platform difference is hidden behind a **port** in `packages/core/src/ports`:

| Port           | Self-hosted (Node)            | Cloudflare (Worker)             |
| -------------- | ----------------------------- | ------------------------------- |
| `DbAdapter`    | `better-sqlite3`              | D1                              |
| `LogStore`     | flat `.log` files             | R2 objects                      |
| `QueueAdapter` | in-process                    | Cloudflare Queues               |
| `AiProvider`   | Anthropic (fetch)             | Workers AI (+ Anthropic fallback) |
| `Mailer`       | SMTP (nodemailer)             | MailChannels                    |
| `VcsProvider`  | GitHub (fetch)                | GitHub (fetch)                  |
| `HealingRunner`| `LocalRunner` (git/compilers) | `DispatchRunner` → self-hosted  |
| `RateLimiter`  | no-op                         | Workers Rate Limiting API       |

Edge note: Workers have no filesystem/git/compilers, so the patch+validate+commit+push step is
**dispatched over HTTP** to a self-hosted `LocalRunner` (`/internal/heal`), while a **Cloudflare
Workflow** drives the durable scan → analyze → fix → PR lifecycle.

---

## Repository layout

```
packages/core/        shared, runtime-agnostic logic + ports + db + auth + http API
apps/server/          self-hosted Node app (Docker)
apps/worker/          Cloudflare Worker (D1/R2/Queues/Workflows/AI)
web/                  Nuxt 3 GUI (built to a static SPA, served by either app)
docker-compose.yml    self-hosted deployment
wrangler.toml         Cloudflare deployment
```

---

## Quick start — Self-hosted (Docker Compose)

```bash
cp .env.example .env          # set ANTHROPIC_API_KEY, GITHUB_TOKEN, GITHUB_REPOSITORY
docker compose up --build
open http://localhost:3000     # the FIRST account you register becomes the admin
```

On the local deploy, AI gateways (e.g. the Anthropic API) are configured through
environment variables in `.env`. When running without Docker the server loads
`.env` from the working directory at startup (existing environment variables
take precedence; override the path with `OURO_ENV_FILE`).

State is local: SQLite in the `ouro-data` volume, telemetry `.log` files in `ouro-logs`.

### Run without Docker

```bash
npm install
npm run build:web
OURO_DB_PATH=./ouroboros.db OURO_LOG_DIR=./logs \
OURO_GUI_DIR=./web/.output/public npm run server
```

---

## Quick start — Cloudflare (edge)

```bash
npm install
npm run build:web                                   # GUI → web/.output/public (served via ASSETS)

wrangler d1 create ouroboros                         # paste the id into wrangler.toml
wrangler r2 bucket create ouroboros-logs
wrangler queues create ouroboros-gui-events
wrangler d1 migrations apply ouroboros               # schema from packages/core/src/db/migrations

wrangler secret put GITHUB_TOKEN
wrangler secret put GITHUB_REPOSITORY               # owner/repo
wrangler secret put RUNNER_SHARED_SECRET            # auth for the dispatched LocalRunner
# set RUNNER_URL (vars) to a reachable self-hosted /internal endpoint for healing

wrangler deploy                                      # or: wrangler dev
```

`wrangler.toml` wires D1, R2, Queues, Workflows, Workers AI, the Rate Limiting binding,
the daily cron trigger, and the static GUI assets.

> **AI gateway separation:** the Cloudflare deploy uses the **Workers AI binding
> exclusively**. External gateway tokens (Anthropic / OpenAI / Gemini / OpenRouter)
> are rejected at the API layer. Available models are discovered dynamically from
> your account's Workers AI catalog via `GET /api/v1/models`, and the GUI model
> selector lists every model it serves. If you need an external gateway, use the
> local deploy (`.env`) instead.

---

## Features

- **Self-healing loop** — parallel scanners → AI analysis/grouping → AI fix + validation →
  PR creation → optional auto-merge (CI gate + AI safety review) → escalation issues.
- **Authentication & multi-tenancy** — email/password (WebCrypto PBKDF2), httpOnly sessions,
  and scoped, revocable **API tokens** (`read` / `inspect` / `heal` / `admin`).
- **Registration control** — admin toggle for public registration; first user bootstraps as admin.
- **Telemetry** — structured logs persisted as flat `.log` files (local dir or R2).
- **Email alerts** — high-risk scans and failed fixes (SMTP self-hosted, MailChannels on edge).
- **Async orchestration (edge)** — GUI events via Cloudflare Queues; healing lifecycle via Workflows.
- **Rate limiting (edge)** — Workers Rate Limiting on public endpoints.
- **Code inspection** — AI scoring engine exposed at `POST /api/v1/inspect`.
  Scores six weighted dimensions (security / performance / redundancy / readability / design /
  correctness) per file or per function/method/class (`granularity: "function"`), and returns
  prioritised `refactorCandidates` selected heuristically from low-scoring units.

---

## API (selected)

Base path: **`/api/v1`** (`/api` is kept as a backward-compatible alias).
Full reference: **[docs/api.ja.md](./docs/api.ja.md)** · machine-readable: `GET /api/v1/openapi.json`.

| Method | Path                          | Auth            |
| ------ | ----------------------------- | --------------- |
| POST   | `/api/v1/auth/register`       | public*         |
| POST   | `/api/v1/auth/login`          | public          |
| GET    | `/api/v1/auth/me`             | session/token   |
| GET/POST/DELETE | `/api/v1/tokens`     | session/token   |
| GET/PUT | `/api/v1/config`             | admin (PUT)     |
| GET/PUT | `/api/v1/settings`           | admin (PUT)     |
| POST   | `/api/v1/inspect`             | scope `inspect` |
| POST   | `/api/v1/healing`            | scope `heal`    |
| GET    | `/api/v1/metrics`             | session/token   |
| GET    | `/api/v1/logs`                | admin           |

\* gated by the registration toggle (always allowed for the first/admin user).
Tokens are sent as `Authorization: Bearer ouro_…`. Errors use a unified
`{ "error": { "code", "message" } }` envelope.

---

## Development & testing

```bash
npm run typecheck                      # all workspaces
npm run test                           # core unit tests (vitest)
npm run dev --workspace web            # Nuxt dev server
```

---

## License

Apache-2.0 — see [LICENSE](./LICENSE).
