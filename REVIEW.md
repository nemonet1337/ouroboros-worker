# REVIEW.md

## What matters in this repository
- Preserve tenant isolation: every D1 query that reads or writes user data must include `user_id`.
- AI gateway is Cloudflare Workers AI only. External Anthropic/OpenAI/Gemini keys must stay rejected at the API layer.
- Auth is session-cookie only. Do not reintroduce API tokens.
- Cloudflare bindings stay in `src/adapters/`; business logic talks to `src/ports/`.
- Heavy scan/heal/code work runs in Workflows or Queue consumers, not in HTTP handlers.
- Treat `GITHUB_TOKEN`, `WORKERS_AI_API_TOKEN`, healing auto-PR/merge, and account deletion as high-risk.
- Prefer small, explicit fixes over broad refactors.

## Severity calibration
- Critical: cross-tenant reads, token leak, unauthorized GitHub write, Vectorize or user-data wipe.
- Warning: missing `user_id` on a query, untested healing step, embedding dimension mismatch (768), unsafe defaults.
- Do not flag generated Tailwind CSS or formatting already covered by `typecheck`.

## Verification expectations
- New business rules need Vitest assertions on the observable result (`npm run typecheck` / `npm run test`).
- D1 changes need a migration under `src/db/migrations/` and rollback-aware review.
- Healing, PR, and VCS paths should assert run status, dedup, and the GitHub write that actually happens.
