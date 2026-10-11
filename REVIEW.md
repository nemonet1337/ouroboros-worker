# REVIEW.md

## What matters in this repository
- Preserve tenant isolation: every query that reads or writes user data (SQLite or D1) must include `user_id`.
- The AI gateway is `LlmGateway` (external REST providers: OpenAI / Anthropic / xAI / OpenRouter). Workers AI is not used. Never log or return API key values.
- Auth is session-cookie **plus** scoped API tokens in `src/auth/`. Both must stay covered: sessions for the GUI, tokens (`Authorization: Bearer ouro_…`) for the API.
- Platform bindings stay in `src/adapters/`; business logic talks to `src/ports/`. Keep `src/app.tsx`, `src/http/`, `src/ui/`, `src/db/`, `src/healing/`, `src/routing/` free of `node:fs` / `node:http` / `node:sqlite` imports (only `src/server.ts`, `src/env.ts`, and the Node adapters may use them).
- `DbAdapter` has three implementations that must stay behaviourally aligned: `SqliteAdapter` (in-process), `RqliteAdapter` (HTTP, Docker db service), and `D1Adapter` (Cloudflare). New SQL must stay portable (single statement per call, no vendor-only functions).
- Heavy scan/heal/code work runs in the serial queue or the serial `HealingLifecycle`, never directly in an HTTP handler. On Cloudflare that means the Queue consumer (Workflows are not used).
- Treat `GITHUB_TOKEN`, healing auto-PR, and account deletion as high-risk.
- Prefer small, explicit fixes over broad refactors.

## Severity calibration
- Critical: cross-tenant reads, key/token leak, unauthorized GitHub write, user-data wipe.
- Warning: missing `user_id` on a query, untested healing step, breaking the Node/Cloudflare port symmetry (a `node:` import leaking into shared code), non-idempotent migration applied on both paths.
- Do not flag generated Tailwind CSS or formatting already covered by `typecheck`.

## Verification expectations
- New business rules need Vitest assertions on the observable result (`npm run typecheck` / `npm run test`). The baseline is 306 passing tests.
- DB changes need a migration under `src/db/migrations/` **and** its id in the TS mirror (`src/db/migrations.ts`). `0013`-style non-idempotent `ALTER TABLE` statements must stay out of the Node `runMigrations()` path on Cloudflare.
- `src/worker.tsx` and `src/context.ts` changes must keep both targets working: verify with `npm run test` (Node) and `npx wrangler deploy --dry-run --outdir dist` (Cloudflare bundle).
- Healing, PR, and VCS paths should assert run status, dedup, and the GitHub write that actually happens.
