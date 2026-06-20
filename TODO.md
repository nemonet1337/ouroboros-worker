# Ouroboros Dual-Mode — Remaining TODO

## 1. External Runner (RUNNER_URL) — Required for Code Mode

The external runner at `RUNNER_URL` must implement these new endpoints before Code Mode can function:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/internal/code/init` | POST | Clone repo, checkout branch, set up workspace for session |
| `/internal/code/status` | POST | Get workspace status (branch, changed files) |
| `/internal/code/read` | POST | Read file contents by path |
| `/internal/code/search` | POST | Search codebase (grep/glob) |
| `/internal/code/write` | POST | Write files to workspace |
| `/internal/code/delete` | POST | Delete files from workspace |
| `/internal/code/diff` | POST | Get unified diff of working tree |
| `/internal/code/commit` | POST | Commit changes |
| `/internal/code/push` | POST | Push branch to remote |
| `/internal/code/cleanup` | POST | Remove session workspace |

**Current status:** Worker-side adapter implemented (`src/adapters/dispatch.runner.ts`), but runner service must implement endpoints.

---

## 2. Port & Adapter Extension — Partially Complete

The new Cloudflare-native binding types have been added to `src/env.ts`:

- [x] New binding types: `AnalyticsEngineDataset`, `BrowserBinding`, `FlagshipBinding`, `DynamicWorkerLoader`, `SecretsStoreSecret`, `ServiceBinding`, `SendEmailBinding`, `EmailMessage`, `VersionMetadata`
- [ ] Wire new bindings through `src/context.ts` into `Ports` object
- [x] `RunnerKind` and `CodeRunner` interfaces defined in `src/ports/runner.ts`
- [x] `NoopRunner` fallback implemented in `src/ports/runner.ts`
- [ ] `RpcRunner` (Service Binding) implemented in `src/adapters/rpc.runner.ts`
- [ ] `DispatchRunner` extended to implement `CodeRunner` interface
- [ ] Export new types from `src/ports/index.ts`

---

## 3. Runner Fallback Chain — Not Started

The current `buildContext()` always creates a `DispatchRunner` with `RUNNER_URL ?? ""`. New fallback chain:

- [x] Define `RunnerKind = "local" | "dispatch" | "rpc" | "noop"`
- [ ] Update `src/context.ts` to select runner in priority order:
  1. `env.RUNNER` (Service Binding) → `RpcRunner`
  2. `env.RUNNER_URL` (HTTP dispatch) → `DispatchRunner`
  3. neither → `NoopRunner`
- [x] Add `Env.RUNNER` binding type
- [ ] Update `InspectionResult` workflow to call `runner.applyFix()` directly instead of `triggerHealing()`

---

## 4. Self-Healing Workflow — Partially Complete

Current healing uses `Workflows` exclusively. New dual-mode architecture:

- [x] `ports/runner.ts` has `HealingRunner` + `CodeRunner` interfaces
- [ ] `src/context.ts` chooses `HealingRunner` via fallback chain
- [ ] `src/workflows/healing.ts` calls `runner.applyFix()` directly when `env.RUNNER` or `env.RUNNER_URL` is set
- [ ] Workflow remains available as the default when neither binding is configured

---

## 5. Secrets Store — Not Started

Currently using `env.WORKERS_AI_API_TOKEN` / `env.GITHUB_TOKEN` directly.

- [ ] Define `SecretsStoreSecret.get()` async resolution helper
- [ ] Add `GITHUB_TOKEN_SECRET` and `WORKERS_AI_TOKEN_SECRET` to `src/env.ts`
- [ ] Refactor `src/context.ts` to resolve secrets at startup via `SecretsStore`
- [ ] Document that only Cloudflare Secrets are accepted (external gateways rejected)

---

## 6. Email Workers (cf-email) — Not Started

- [x] `SendEmailBinding` type added to `src/env.ts`
- [ ] Create `src/adapters/cfemail.mailer.ts` implementing `Mailer` with `kind: "cf-email"`
- [ ] Update `Mailer.kind` union type in `src/ports/mailer.ts`
- [ ] Wire `env.EMAIL` (SendEmailBinding) as primary, fall back to `MailChannelsMailer`
- [ ] Enable `email()` handler on Worker when `env.EMAIL` is present

---

## 7. Version Metadata (CF_VERSION_METADATA) — Not Started

- [x] `VersionMetadata` type added to `src/env.ts`
- [ ] Expose `CF_VERSION_METADATA` via `GET /api/v1/version` endpoint
- [ ] Display version info in WebUI header
- [ ] Use `tag` for deployment tracking in healing run records

---

## 8. Flagship Flags — Not Started

- [x] `FlagshipBinding` type added to `src/env.ts`
- [ ] Create `src/flags/flag.service.ts`
- [ ] Wire `env.FLAGS` into feature flags for:
  - `code-needs-fix`
  - `code-fix-complete`
  - `code-pr-ready`
  - `code-review-required`
  - `browser-test-enabled`
  - `analytics-enabled`
- [ ] Update API routes to check flags before performing actions

---

## 9. Code Mode Complete Flow — Not Started

All Code Mode endpoints removed from `api.ts`. Must be re-added with proper implementation:

- [ ] Database migration: `code_sessions` table (status, patches, PR info)
- [ ] `src/code/session.manager.ts` — session CRUD + state machine
- [ ] `src/code/agent.ts` — AI prompt generation + patch extraction
- [ ] `src/code/prompt.templates.ts` — language-specific prompts
- [ ] API endpoints:
  - `POST /api/v1/code/sessions`
  - `GET /api/v1/code/sessions`
  - `GET /api/v1/code/sessions/:id`
  - `POST /api/v1/code/sessions/:id/generate`
  - `POST /api/v1/code/sessions/:id/apply`
  - `DELETE /api/v1/code/sessions/:id`
- [ ] Frontend: Code sessions list + detail pages

---

## 10. Refactor Mode — Stub Only

- [ ] `src/refactor/proposal.manager.ts` — parse `InspectionResult`, generate proposals
- [ ] Wire proposal status transitions (`proposed` → `approved` → `applied/dismissed`)
- [ ] Add `RefactorRepository` to `src/db/repositories.ts`
- [ ] API endpoints for proposals CRUD
- [ ] Frontend refactor page improvements

---

## 11. Tests — None Written

| File | What to test |
|------|--------------|
| `src/adapters/rpc.runner.ts` | Request signing, error handling |
| `src/adapters/dispatch.runner.ts` | HTTP dispatch, timeout behavior |
| `src/ports/runner.ts` | `NoopRunner` fallback behavior |
| `src/code/agent.ts` | `generate()` with mock runner, patch extraction |
| `src/code/session.manager.ts` | Session lifecycle, state transitions |
| `src/db/repositories.ts` (new repos) | All repository methods |
| `src/http/api.ts` (new code endpoints) | Auth, validation, error responses |

---

## 12. TypeScript — Baseline is Clean

**Current status:** `npm run typecheck` passes with 0 errors on `src/`.

Remaining work is adding new code (Code Mode, Refactor Mode) without introducing new type errors.
