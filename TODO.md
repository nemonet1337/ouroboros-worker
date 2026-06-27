# Ouroboros Dual-Mode — Remaining TODO

## 1. External Runner (RUNNER_URL) — Complete

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
| `/internal/code/generate` | POST | AI code generation (Code Mode patches) |

**Current status:** All Code Mode endpoints implemented in runner (`runner/src/index.ts`). Worker-side adapters (`RpcRunner`, `DispatchRunner`, `NoopRunner`, `DynamicRunner`) all implement `CodeRunner.generate()`.

---

## 2. Port & Adapter Extension — Complete

The new Cloudflare-native binding types have been added to `src/env.ts`:

- [x] New binding types: `AnalyticsEngineDataset`, `BrowserBinding`, `FlagshipBinding`, `DynamicWorkerLoader`, `SecretsStoreSecret`, `ServiceBinding`, `SendEmailBinding`, `EmailMessage`, `VersionMetadata`
- [x] Wire new bindings through `src/context.ts` into `Ports` object
- [x] `RunnerKind` and `CodeRunner` interfaces defined in `src/ports/runner.ts`
- [x] `NoopRunner` fallback implemented in `src/ports/runner.ts`
- [x] `RpcRunner` (Service Binding) implemented in `src/adapters/rpc.runner.ts`
- [x] `DispatchRunner` implements `CodeRunner` interface
- [x] Export new types from `src/ports/index.ts`

---

## 3. Runner Fallback Chain — Complete

- [x] Define `RunnerKind = "local" | "dispatch" | "rpc" | "noop"`
- [x] `src/context.ts` selects runner in priority order: Service Binding → RUNNER_URL → NoopRunner
- [x] `Env.RUNNER` binding type added
- [x] Healing workflow calls `runner.applyFix()` via `HealingRunner` interface

---

## 4. Self-Healing Workflow — Complete

- [x] `ports/runner.ts` has `HealingRunner` + `CodeRunner` interfaces
- [x] `src/context.ts` chooses `HealingRunner` via fallback chain
- [x] `src/workflows/healing.ts` calls `runner.applyFix()` directly when runner configured
- [x] Workflow remains available as the default when neither binding is configured

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

## 9. Code Mode Complete Flow — Complete

- [x] Database migration: `code_sessions` table (status, patches, PR info)
- [x] `src/code/session.manager.ts` — session CRUD + state machine
- [x] AI generation delegated to runner (`CodeRunner.generate()`) — no local `CodeAgent`
- [x] `src/code/prompt.templates.ts` — Worker-side copy deleted; prompt logic moved to runner
- [x] Runner `codeGenerate` uses `AI.run()` with `OURO_CODE_MODEL` (default: `@cf/meta/llama-3.1-8b-instruct`)
- [x] API endpoints:
  - `POST /api/v1/code/sessions`
  - `GET /api/v1/code/sessions`
  - `GET /api/v1/code/sessions/:id`
  - `POST /api/v1/code/sessions/:id/generate` (passes user model pref to runner)
  - `POST /api/v1/code/sessions/:id/apply`
  - `DELETE /api/v1/code/sessions/:id`
- [ ] Frontend: Code sessions list + detail pages

---

## 10. Refactor Mode — Complete

- [x] `src/refactor/proposal.manager.ts` — parse `InspectionResult`, generate proposals
- [x] Wire proposal status transitions (`proposed` → `approved` → `applied/dismissed`)
- [x] `applyProposal` uses `runner.generate()` instead of `CodeAgent`
- [x] `generateProposal` (summary generation) uses Worker `ai.complete()` (plan model)
- [x] `RefactorRepository` queries via `DbAdapter`
- [x] API endpoints for proposals CRUD
- [ ] Frontend refactor page improvements

---

## 11. Tests

| File | What to test | Status |
|------|--------------|--------|
| `src/adapters/rpc.runner.ts` | Request signing, error handling | Not started |
| `src/adapters/dispatch.runner.ts` | HTTP dispatch, timeout behavior | Not started |
| `src/ports/runner.ts` | `NoopRunner` fallback behavior | Not started |
| `src/code/session.manager.ts` | Session lifecycle, state transitions | Partial |
| `src/db/repositories.ts` (new repos) | All repository methods | Not started |
| `src/http/api.ts` (new code endpoints) | Auth, validation, error responses | Partial |
| `runner/src/__tests__/routes.test.ts` | All internal endpoints (codeGenerate included) | Done |

---

## 12. TypeScript

**Current status:** `npm run typecheck` passes with 0 errors on both `src/` and `runner/`.

---

## 13. Runner デプロイ (GH Actions)

- [x] `.github/workflows/deploy-runner.yml` — `push` to `main` (`runner/**` 変更時) + `workflow_dispatch`
- [x] Secrets Store `ouroboros-secrets` (`github-token`) 参照済み (`runner/wrangler.toml`)
- [x] Service Binding `[[services]]` 再有効化 (`wrangler.toml:61-65`)
- [ ] 初回デプロイ: runner を先にデプロイし、その後に Worker を再デプロイ
- [ ] `CLOUDFLARE_API_TOKEN` GitHub secret の設定 (前提)
- [ ] `RUNNER_SHARED_SECRET` の `wrangler secret put` 設定 (前提)

---

## 14. AI モデル分離

- [x] Worker: `OURO_PLAN_MODEL` 環境変数 (`wrangler.toml` + `src/env.ts`)、デフォルト `minimax/m3`
- [x] Worker: `src/context.ts` の `WorkersAiProvider` が `OURO_PLAN_MODEL` 優先
- [x] Worker: `AIAnalyzer`/`ProposalManager.generateProposal`/`InspectionEngine` がプランモデル使用
- [x] Runner: `OURO_CODE_MODEL` 環境変数 (`runner/wrangler.toml` + `runner/src/env.ts`)、デフォルト `@cf/meta/llama-3.1-8b-instruct`
- [x] Runner: `codeGenerate` が `OURO_CODE_MODEL` + 実行時 override 対応
- [x] Runner: `applyFix` のハードコードモデルを `OURO_CODE_MODEL` に変更
- [x] Worker: `/code/sessions/:id/generate` がユーザー設定モデルを runner に転送
