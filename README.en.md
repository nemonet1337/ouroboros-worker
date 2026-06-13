# Ouroboros

> An AI-driven self-healing system that continuously scans, fixes, and evolves your codebase.

🌐 **日本語版: [README.md](./README.md)**

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/nemonet1337/ouroboros)

Ouroboros detects issues, uses an LLM to analyze and generate patches, and opens pull
requests automatically — with authentication, multi-tenant API tokens, telemetry logging,
and email alerting.

It is **built exclusively for Cloudflare Workers** (Workers + D1 + R2 + Queues + Workflows +
Workers AI). The Docker / on-premises implementations were removed in v2.1.

> **AI gateway:** Ouroboros only ever connects to LLMs hosted on **Cloudflare Workers AI**
> (default model: `minimax/m3`). Every model Workers AI serves is selectable from the GUI
> settings screen. The only AI credential is the dedicated Workers AI API token,
> **`WORKERS_AI_API_TOKEN`** (a Worker secret) — external gateway tokens (Anthropic /
> OpenAI / Gemini / OpenRouter) are rejected at the API layer.

---

## Architecture

```
   ┌──────────────────────────────┐
   │      packages/core           │  shared library
   │  analyzer · inspection       │
   │  orchestrator · auth · db    │
   │  logging · HTTP API (Hono)   │
   │  ports/  (the abstraction)   │
   └───────────────┬──────────────┘
                   ▼
   ┌────────────────────────────┐
   │   apps/worker (Cloudflare)  │
   │   Workers + Hono            │
   │   D1 · R2 logs              │
   │   MailChannels · Queues     │
   │   Workers AI (minimax/m3)   │
   │   Workflows · Rate Limiting │
   │   DispatchRunner ──HTTP──▶ external runner (optional heavy git/CI work)
   └────────────────────────────┘
```

| Port           | Implementation (Cloudflare Worker)      |
| -------------- | --------------------------------------- |
| `DbAdapter`    | D1                                      |
| `LogStore`     | R2 objects                              |
| `QueueAdapter` | Cloudflare Queues                       |
| `AiProvider`   | Workers AI (the only AI gateway)        |
| `Mailer`       | MailChannels                            |
| `VcsProvider`  | GitHub (fetch)                          |
| `HealingRunner`| `DispatchRunner` → external runner (optional) |
| `RateLimiter`  | Workers Rate Limiting API               |

Note: Workers have no filesystem/git/compilers, so the patch+validate+commit+push step can be
**dispatched over HTTP** to an external runner (`/internal/heal`, optional via `RUNNER_URL`),
while a **Cloudflare Workflow** drives the durable scan → analyze → fix → PR lifecycle.

---

## Repository layout

```
packages/core/        shared logic + ports + db + auth + http API
apps/worker/          Cloudflare Worker (D1/R2/Queues/Workflows/Workers AI)
web/                  Nuxt 3 GUI (built to a static SPA, served via ASSETS)
wrangler.toml         Cloudflare deployment
```

---

## Quick start — Cloudflare

The fastest path is the **Deploy to Cloudflare** button above. Manual setup:

```bash
npm install
npm run build:web                                   # GUI → web/.output/public (served via ASSETS)

wrangler d1 create ouroboros                         # paste the id into wrangler.toml
wrangler r2 bucket create ouroboros-logs
wrangler queues create ouroboros-gui-events
wrangler d1 migrations apply ouroboros               # schema from packages/core/src/db/migrations

wrangler secret put WORKERS_AI_API_TOKEN             # (optional) dedicated Workers AI API token
wrangler secret put GITHUB_TOKEN
wrangler secret put GITHUB_REPOSITORY               # owner/repo
wrangler secret put RUNNER_SHARED_SECRET            # (optional) auth for the dispatched runner

wrangler deploy                                      # or: wrangler dev
```

`wrangler.toml` wires D1, R2, Queues, Workflows, Workers AI, the Rate Limiting binding,
the daily cron trigger, and the static GUI assets.

### Admin account

- No environment variables needed. After deploying, open the app in a browser: **while no
  user exists the login page automatically redirects to `/register`**.
- **The first registered account becomes the admin**, and public registration is locked
  afterwards (re-enable it from the Admin page toggle).

### AI models

- The default model is **`minimax/m3`** (`OURO_WORKERS_AI_MODEL` in `wrangler.toml`).
- `GET /api/v1/models` discovers every model from your account's Workers AI catalog, and
  **all of them are selectable from the GUI settings screen**.
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
| GET    | `/api/v1/models`              | session/token   |
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
npm run worker:dev                     # wrangler dev
```

---

## License

Apache-2.0 — see [LICENSE](./LICENSE).
