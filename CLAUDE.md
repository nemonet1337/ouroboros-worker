# CLAUDE.md — Ouroboros 開発ガイド

## プロジェクト概要

Ouroboros は **Cloudflare Workers 専用**のエッジネイティブな AI 自己修復システム。
コードベースを継続的にスキャン・解析し、パッチを生成して Pull Request を自動作成する。

**制約:**
- AI ゲートウェイは **Cloudflare Workers AI のみ**。Anthropic / OpenAI 等の外部キーは API レベルで拒否される
- Docker / オンプレミス対応は廃止（v2.1 で削除済み）
- Workers にはファイルシステム・git・コンパイラが無いため、重い処理は runner (`ouroboros-runner` CF Worker, GitHub API ベース) へ Service Binding / HTTP で委譲

## ディレクトリ構造

```
src/                   Worker ソース（全ビジネスロジック + CF アダプター）
  adapters/            Cloudflare サービスの具体実装（D1, R2, Queues, Workers AI …）
  analyzers/           AI による findings のグルーピング・リスク評価
  auth/                認証・セッション・API トークン（WebCrypto PBKDF2）
  config/              設定値・言語別インスペクションルール（10 言語）
  db/                  D1/SQLite リポジトリ層（7 テーブル）
    migrations/        SQL マイグレーションファイル
  healing/             自己修復オーケストレーター（5 フェーズ）
  http/                Hono ベース REST API（ルート・バリデーション・OpenAPI）
  inspection/          AI スコアリングエンジン（6 次元・32 観点）
  logging/             構造化ロガー（R2 永続化）
  notifications/       MailChannels メールアラート・Notifier
  ports/               アダプターインターフェース（Ports & Adapters）
  pr/                  PR 生成・重複排除・AI 安全レビュー・自動マージ
  queues/              Cloudflare Queues コンシューマー
  schemas/             JSON スキーマ定義（AJV バリデーション用）
  utils/               暗号化・エスカレーター（GitHub Issue）・修正キャッシュ
  vcs/                 GitHub REST API 連携（fetch ベース）
  webhook/             Webhook ディスパッチ・閾値評価・SSRF ガード
    adapters/          フォーマット変換（Slack, Discord, GitHub, Generic）
  workflows/           Cloudflare Workflows（永続・再開可能なライフサイクル）
  __tests__/           Vitest ユニットテスト
    fixtures/          テスト用フィクスチャデータ
  types.ts             全型定義（healing / inspection / webhook 統合）
  context.ts           全 Ports + Auth の依存性注入（buildContext）
  env.ts               Cloudflare バインディング・シークレット型定義
  index.ts             Worker エントリーポイント（fetch / queue / email / scheduled）
web/                   Nuxt 3 GUI（静的 SPA、ASSETS バインディングで配信）
```

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
  1. scan     → DispatchRunner/RpcRunner → runner /internal/scan
  2. analyze  → AIAnalyzer → Workers AI
  3. fix      → DispatchRunner/RpcRunner → runner /internal/heal → VCS.createPR()
  4. notify   → Notifier + AlertService
```

### DB アクセス
- `src/db/repositories.ts` に 7 つのリポジトリクラス
- `D1Adapter`（`src/adapters/d1.adapter.ts`）が `DbAdapter` インターフェースを実装
- マイグレーションは起動時に `runMigrations()` が自動実行（`src/index.ts`）

## 開発コマンド

```bash
npm run typecheck       # TypeScript 型チェック（tsc --noEmit）
npm run test            # Vitest ユニットテスト（src/__tests__/）
npm run worker:dev      # wrangler dev（ローカル開発）
npm run build:web       # Nuxt SPA ビルド → web/.output/public
npm run worker:deploy   # wrangler deploy（本番デプロイ）
```

## デプロイ

1. `wrangler.toml` を確認（D1 の `database_id` は `scripts/resolve-d1.sh` で自動解決）
2. `npm run build:web` で GUI をビルド
3. `wrangler deploy` でデプロイ（ビルドフックが `resolve-d1.sh && build:web` を実行）

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
