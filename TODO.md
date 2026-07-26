# TODO — 問題点分析と修正方法

調査日: 2026-07-26。修正完了: 2026-07-26。

## 実施済みサマリ

### §A runner 統合（単一 Worker）
- [x] GitHubProvider に git object 書き込み（createOrUpdateRef / getCommitTreeSha 等）を追加し §3-4/§3-5 を修正
- [x] `RepoRunner`（`src/healing/repo.runner.ts`）で HealingRunner + CodeRunner をプロセス内実装
- [x] scanner / prompt.templates を worker へ移植
- [x] context の 4 分岐（Rpc/Dispatch/Dynamic/Unconfigured）を RepoRunner 1 本に置換
- [x] wrangler.toml から `[[services]]` / `[[worker_loaders]]` / `RUNNER_URL` を削除
- [x] CLAUDE.md を単一 Worker 構成に更新

### §0 最重要
- [x] (A) 対象リポジトリが scan に伝わる（ctx.currentRepo → RepoRunner）
- [x] (B) 新規ブランチ createOrUpdateRef
- [x] (C) inspection subrequest（batch=1, 同期 reindex 廃止, maxRetries=1, AI binding 優先）
- [x] (D) REST を chat/completions へ + 401/403 時 binding フォールバック（無効トークンは運用で delete）

### §1–8 残り
- [x] デッドコード空洞化（orchestrator / 旧 runner adapters / browser.tester 等）
- [x] mountApi の createApi 1 回化
- [x] DEFAULT_APP_SETTINGS 共通化
- [x] requireAuth の getCookie 統一（index も hono/cookie）
- [x] webhook テスト送信の共通化
- [x] refactor makeProposalManager
- [x] scope 形骸化の撤去（requireAuth 引数なし）
- [x] XSS（HTML 直挿入）修正
- [x] webhook URL 作成時バリデーション + secret 暗号化
- [x] heavy エンドポイントのレートリミット
- [x] Queue max_batch_size=1 / max_retries / DLQ
- [x] schedule を time + daysOfWeek に簡素化（デフォルト 03:00 UTC）
- [x] MailChannels 廃止 → NoopMailer
- [x] OURO_PLAN_MODEL 削除（DEFAULT_WORKERS_AI_MODEL 一本）
- [x] partner model datalist / 実効モデル placeholder
- [x] healing/inspection cancel + スタック sweep
- [x] Workflow step timeout/retries
- [x] AI 120s タイムアウト
- [x] Code generate の Queue 化 + ポーリング + スタック回復
- [x] max_tokens 8192 + JSON フェンス除去
- [x] Vectorize id ハッシュ化 / INDEX_STALE 24h

### 運用メモ
- `wrangler queues create ouroboros-dlq` を初回のみ実行
- 無効な `WORKERS_AI_API_TOKEN` がある場合: `wrangler secret delete WORKERS_AI_API_TOKEN`
- 旧 `ouroborous-runner` は worker から `[[services]]` を消したデプロイ成功後にアーカイブ可
