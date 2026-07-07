# CLAUDE.md — Ouroboros 開発ガイド

## プロジェクト概要

Ouroboros は **Cloudflare Workers 専用**のエッジネイティブな AI 自己修復システム。
コードベースを継続的にスキャン・解析し、パッチを生成して Pull Request を自動作成する。

**制約:**
- AI ゲートウェイは **Cloudflare Workers AI のみ**。Anthropic / OpenAI 等の外部キーは API レベルで拒否される
- Docker / オンプレミス対応は廃止（v2.1 で削除済み）
- Workers にはファイルシステム・git・コンパイラが無いため、重い処理は runner (`ouroboros-runner` CF Worker, GitHub API ベース) へ Service Binding / HTTP で委譲。
  runner 未設定時は Worker Loader（`LOADER` バインディング、Dynamic Workers）で動的 Worker を生成して実行し、
  それも不可なら `UnconfiguredRunner` が明示エラーを返す（黙って空結果を返さない）。
  Dynamic Workers は **Workers 有料プランが必須**（無料プランは deploy 時に code 10195 で拒否される）。
  無料プランでは wrangler.toml の `[[worker_loaders]]` をコメントアウトしておくこと

## ディレクトリ構造

```
src/                   Worker ソース（全ビジネスロジック + CF アダプター）
  adapters/            Cloudflare サービスの具体実装（D1, R2, Queues, Workers AI, DynamicRunner …）
  analyzers/           AI による findings のグルーピング・リスク評価
  auth/                認証・セッション・API トークン（WebCrypto PBKDF2）
  code/                Code モード（セッション管理・Plan/Coding 2 フェーズ生成）
  config/              設定値・言語別インスペクションルール・モデルモード定義
  db/                  D1/SQLite リポジトリ層
    migrations/        SQL マイグレーションファイル
  healing/             自己修復オーケストレーター
  http/                Hono ベース REST API（ルート・バリデーション・OpenAPI）
  inspection/          AI スコアリングエンジン（6 次元・32 観点）
  logging/             構造化ロガー（R2 永続化）
  notifications/       MailChannels メールアラート・Notifier
  ports/               アダプターインターフェース（Ports & Adapters）
  pr/                  PR 生成・重複排除・AI 安全レビュー・自動マージ
  queues/              Cloudflare Queues コンシューマー
  refactor/            Refactor モード（検査結果からのリファクタ提案・適用）
  schemas/             JSON スキーマ定義（AJV バリデーション用）
  ui/                  Hono JSX ベース SSR GUI（htmx + Tailwind v4 + daisyUI 5）
    pages/             各画面（login / settings / code / healing …）
    components/        共有コンポーネント（Sidebar 等）
    styles/            注入 CSS + Tailwind ビルド（tailwind.source.css → tailwind.generated.css）
  utils/               暗号化・エスカレーター（GitHub Issue）・修正キャッシュ・findings 正規化
  vcs/                 GitHub REST API 連携（fetch ベース）
  vectorize/           Vectorize コードインデックス（埋め込み RAG）
  webhook/             Webhook ディスパッチ・閾値評価・SSRF ガード
    adapters/          フォーマット変換（Slack, Discord, GitHub, Generic）
  workflows/           Cloudflare Workflows（永続・再開可能なライフサイクル）
  __tests__/           Vitest ユニットテスト
    fixtures/          テスト用フィクスチャデータ
  types.ts             全型定義（healing / inspection / webhook 統合）
  context.ts           全 Ports + Auth の依存性注入（buildContext）
  env.ts               Cloudflare バインディング・シークレット型定義
  index.tsx            Worker エントリーポイント（fetch / queue / email / scheduled + SSR ルート）
runner/                ouroboros-runner Worker（GitHub API ベースの scan/heal/code 実行）
```

> 注: 旧 `web/` Nuxt 3 SPA は廃止済み。GUI は `src/ui/` の Hono JSX SSR。

## 主要パターン

### Ports & Adapters
- `src/ports/` にインターフェース定義（`AiProvider`, `DbAdapter`, `LogStore` 等）
- `src/adapters/` に Cloudflare 向け具体実装
- `src/context.ts` の `buildContext()` でアダプターを組み立てて `Ports` オブジェクトを返す

### 型定義
- **全型を `src/types.ts` に集約**（healing 型 + inspection 型 + webhook 型）
- 他のファイルから `import type { ... } from "../types"` でインポート

### 自己修復フロー
```
Workflows (healing.ts)
  1. scan     → RpcRunner/DispatchRunner/DynamicRunner → runner /internal/scan
  2. analyze  → AIAnalyzer（Vectorize コードインデックスの関連スニペットを RAG 注入）→ Workers AI
  3. fix      → RpcRunner/DispatchRunner/DynamicRunner → runner /internal/heal → VCS.createPR()
  4. notify   → Notifier + AlertService
失敗時は healing_runs.status = "failed" + summary にエラーを記録
```

### AI モデル解決（モード別）
- モード: `coding` / `plan` / `refactor` / `healing` / `inspection`（`src/config/model.modes.ts`）
- 解決順: `users.mode_models[mode]` → `users.model`（グローバル）→ `DEFAULT_WORKERS_AI_MODEL`
- 呼び出しは `AuthService.resolveModel(userId, mode)` を必ず経由する
- GUI: `/settings` のモデル設定フォーム → `PUT /api/v1/settings/models`

### DB アクセス
- `src/db/repositories.ts` に 7 つのリポジトリクラス
- `D1Adapter`（`src/adapters/d1.adapter.ts`）が `DbAdapter` インターフェースを実装
- マイグレーションは起動時に `runMigrations()` が自動実行（`src/index.ts`）

## 開発コマンド

```bash
npm run typecheck       # TypeScript 型チェック（tsc --noEmit）
npm run test            # Vitest ユニットテスト（src/__tests__/）
npm run build:css       # Tailwind v4 + daisyUI 5 の CSS を生成（ローカル開発・デプロイ前に実行）
npm run worker:dev      # build:css + wrangler dev（ローカル開発）
npm run worker:deploy   # build:css + wrangler deploy（本番デプロイ）
# runner/ 配下にも typecheck / test / deploy がある（cd runner && npm run ...）
```

> UI のスタイルは CDN ではなくビルド済み CSS（`src/ui/styles/tailwind.generated.css`）を
> Worker が `/assets/tailwind.css` として配信する。テーマ定義は `tailwind.source.css` の
> `@plugin "daisyui/theme"`（winter / night）。
>
> **`tailwind.generated.css` はビルド成果物のため git 管理対象外**（`.gitignore`）。
> ローカルは `npm run worker:dev`/`worker:deploy` が `build:css` を前段実行する。
> Cloudflare Workers Builds（Git 連携デプロイ）では、ダッシュボードの
> **Settings → Builds → Build command** に `npm run build:css` を設定しておくこと
> （Deploy command 実行前にこのコマンドが走り、生成物が作られる）。
> 型チェックは `src/css.d.ts` の ambient module 宣言で解決するため、
> ファイル未生成でも `npm run typecheck` は失敗しない。

## デプロイ

1. `wrangler.toml` を確認
2. Vectorize インデックスを作成（初回のみ）:
   `wrangler vectorize create ouroboros-weight-profiles --dimensions=32 --metric=cosine`
   `wrangler vectorize create ouroboros-code-index --dimensions=768 --metric=cosine`
3. `wrangler deploy` でデプロイ（GUI は SSR なのでフロントエンドビルド不要）

必要なシークレット:
```
WORKERS_AI_API_TOKEN     Workers AI 専用 Cloudflare API トークン（任意、未設定時は AI バインディング直接使用）
CLOUDFLARE_ACCOUNT_ID    Workers AI REST API 使用時に必要（任意）
GITHUB_TOKEN             PR/Issue 作成用
GITHUB_REPOSITORY        owner/repo 形式
RUNNER_URL               runner Worker の URL（Service Binding 未設定時のフォールバック、任意）
RUNNER_SHARED_SECRET     runner 認証（RUNNER_URL 設定時のみ必要）
OURO_ALERT_EMAILS        メールアラート送信先（カンマ区切り、任意）
```

## コード規約

- 新しい型は `src/types.ts` に追加する
- Cloudflare 固有の実装は `src/adapters/` に置き、`src/ports/` のインターフェースを実装する
- ビジネスロジック（`healing/`, `inspection/`, `pr/` 等）は CF バインディングに依存しない形を保つ
- テストは `src/__tests__/` に置き、`src/__tests__/helpers.ts` のモックを活用する
