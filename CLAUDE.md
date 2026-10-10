# CLAUDE.md — Ouroboros 開発ガイド

## プロジェクト概要

Ouroboros は **Node.js 24+ 専用**の AI 自己修復システム。
コードベースを継続的にスキャン・解析し、パッチを生成して Pull Request を自動作成する。

**制約:**
- AI ゲートウェイは **`LlmGateway` 経由の外部プロバイダ REST**（OpenAI / Anthropic / xAI / OpenRouter）。モデル ID は `provider/model` 形式
- Cloudflare Workers 対応は廃止（Workers AI・D1・Queues・Workflows・wrangler すべて削除済み）。Docker / オンプレミスも廃止
- 重い処理（scan / heal / code generate）は **同一プロセス内の `RepoRunner`** が GitHub REST API と外部 AI provider を使って実行する
- キーは `.env` のみ。GUI は設定済み/未設定の表示だけで値は返さない

## ディレクトリ構造

```
src/                   Node ソース（全ビジネスロジック + アダプター）
  adapters/            プラットフォームの具体実装
    sqlite.adapter.ts      node:sqlite の DbAdapter
    memory.queue.ts        インメモリ逐次キュー
    memory.ratelimiter.ts  固定窗口リミッタ
    ai/                    LlmGateway + decisions（Decisions API / Laya）
  analyzers/           AI による findings のグルーピング・リスク評価
  auth/                認証・セッション・API トークン（WebCrypto PBKDF2）
  code/                Code モード（セッション管理・codegen）
  config/              設定値・言語別インスペクションルール・モデルモード定義
  db/                  SQLite リポジトリ層
    migrations/        SQL マイグレーションファイル
  healing/             RepoRunner（scan/applyFix/code）+ scanner + lifecycle
  http/                Hono ベース REST API（ルート・バリデーション・OpenAPI）
  inspection/          AI スコアリングエンジン（6 次元・32 観点）
  logging/             構造化ロガー（stdout のみ）
  ports/               アダプターインターフェース（Ports & Adapters）
  pr/                  PR 生成・重複排除
  queues/              GUI イベントの逐次処理
  refactor/            Refactor モード（検査結果からのリファクタ提案・適用）
  retrieval/           インデックス-less コード検索（ファイル選択・chunk 分割・埋め込み順位付け）
  routing/             難易度判定によるモデル階層ルーティング
  schemas/             JSON スキーマ定義（AJV バリデーション用）
  ui/                  Hono JSX ベース SSR GUI（htmx + Tailwind v4）
  utils/               エスカレーター・修正キャッシュ
  vcs/                 GitHub REST API 連携（fetch ベース、git object 書き込み含む）
  __tests__/           Vitest ユニットテスト
  types.ts             全型定義
  context.ts           全 Ports + Auth の依存性注入（buildContext）
  env.ts               AppConfig と loadConfig()
  cron.ts              毎時 cron（stale sweep + 定期 healing）
  app.tsx              ルート群
  server.ts            node:http エントリーポイント
```

## 主要パターン

### Ports & Adapters
- `src/ports/` にインターフェース定義（`AiProvider`, `DbAdapter`, `QueueAdapter`, `RateLimiter` 等）
- `src/adapters/` に Node 向け具体実装
- `src/context.ts` の `buildContext(config: AppConfig)` で `RepoRunner` を組み立てて `Ports` に載せる

### 設定と起動
- `src/env.ts` の `loadConfig()`: `process.loadEnvFile()`（`.env` が無い場合は無視）→ 検証
- 必須: `GITHUB_TOKEN` と、`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `XAI_API_KEY` / `OPENROUTER_API_KEY` のいずれか 1 つ以上
- 未設定ならメッセージを出して起動停止
- 既定値: `PORT=3000`、`OURO_DATA_DIR=./data`、`OURO_DB_PATH=<dataDir>/ouroboros.sqlite`、`OURO_REGISTRATION_ENABLED=false`

### 自己修復フロー
```
server.ts
  └─ HealingLifecycle（src/healing/lifecycle.ts、プロセス内直列）
      1. scan     → RepoRunner.scan() → GitHub tarball + scanner
      2. analyze  → AIAnalyzer（ファイル選択 + 埋め込み順位付け）→ LlmGateway
      3. fix      → RepoRunner.applyFix() → blob/tree/commit/ref → VCS.createPR()
   各ステップの前に healing_runs.status === "canceled" をチェック
失敗時は healing_runs.status = "failed" + summary にエラーを記録
キャンセル: POST /healing/:runId/cancel → status を canceled にして次ステップで停止
```

### AI モデル解決
`/models` で用途ごとに 3 つ選択する（システム全体で共有、admin のみ変更可）:

| 役割 | 既定 | 用途 |
| --- | --- | --- |
| Efficiency | `openai/gpt-6-luna` | 判定が容易とした codegen。inspection / healing / refactor もここ |
| Performance | `openai/gpt-6-sol` | 判定が `solThreshold` 以上とした codegen |
| Embed | `openai/text-embedding-3-small` | コード検索の埋め込み |

- モデル ID は `provider/model`。`openai/*` `anthropic/*` `xai/*` `openrouter/*`
- 保存先: `settings.routing_config`（`src/config/routing.ts` の `RoutingConfig`）。不正値は既定へ落ちる
- モデル一覧は各プロバイダの `GET /models` を live 取得（60 分 TTL）。キー未設定プロバイダは候補に出さない
- テキスト生成の解決は `AuthService.resolveModel(userId)` → `remapRetiredModel()`（`@cf/…`・GLM は `null` にして既定へフォールバック）

### 難易度判定（Decisions API / ローカル Laya）
`codegen` の前に判定モデルが難易度（1〜5）とティアを決める。`src/routing/model.router.ts`:

- `decisionBackend: "remote"`（既定）→ OpenAI Decisions API（`POST /v1/decisions`、モデルは `openai/gpt-6-luna` のみ）または OpenRouter Decisions（`POST /api/alpha/decisions`、`openrouter/typesafe/jev-1.13`）
- `decisionBackend: "local"` → ローカル laya-serve の `POST {url}/v1/systemone`（Jev 互換）。既定 `http://127.0.0.1:8000`、モデルは `typed-decisions`
- 順序: **local（有効時）→ remote → Efficiency フォールバック**。`anthropic/*`・`xai/*` は decisions 非対応
- Laya の `state` は 1500 文字に切り詰め（`typed-decisions` の context 1024 tokens 対策）
- `score` は level index 0 起点の確率重み平均なので、全バックエンドで `+1` 正規化して 1〜5 にする
- `localFileSelection: true` なら関連ファイル選択も `POST /v1/systemone/batch`（laya-serve 0.3.22+）。404 や 0 件なら従来の `ai.complete` 経路へフォールバック

### コード検索（インデックスなし）
```
src/retrieval/
  file.selector.ts   判定モデル / テキストモデルに関連ファイルを選ばせる
  chunk.rank.ts      選択分を chunk 化して埋め込み、Worker 内で cosine 順位付け
  chunker.ts         シンボル境界による chunk 分割
  tokenize.ts        Intl.Segmenter による日本語対応トークナイザ
```
Vectorize は廃止。`getRepoFiles()` の tarball から選び、`EMBED_BATCH_LIMIT`（32）ずつ
埋め込むためインデックス再構築も次元移行も不要。

### DB アクセス
- `src/db/repositories.ts` にリポジトリクラス
- `SqliteAdapter`（`node:sqlite`）が `DbAdapter` を実装。`batch` は 1 トランザクション
- マイグレーションは `buildContext()` 内で `runMigrations()` が自動実行

## 開発コマンド

```bash
npm run typecheck       # TypeScript 型チェック（tsc --noEmit）
npm run test            # Vitest ユニットテスト（src/__tests__/）
npm run build:css       # Tailwind v4 の CSS を生成
npm run dev             # build:css + tsx src/server.ts
npm start               # tsx src/server.ts
```

> UI のスタイルは CDN ではなくビルド済み CSS（`src/ui/styles/tailwind.generated.css`）。
> 未ビルド時は `src/app.tsx` が空文字を返すのでスタイル無しで動く。

## デプロイ

1. `.env.example` を `.env` にコピーしてキーを記入
2. `npm ci && npm run build:css`
3. `npm start`（`PORT` で listen）

必要なキー:
```
GITHUB_TOKEN             PR/Issue 作成用（owner/repo はトークンから自動検出）
OPENAI_API_KEY / ANTHROPIC_API_KEY / XAI_API_KEY / OPENROUTER_API_KEY
                         いずれか 1 つ以上必須
LAYA_API_KEY             （任意）ローカル Laya の Bearer 認証が必要な場合だけ
```

ローカル Laya を使う場合:
```bash
pip install "laya[serve]"
LAYA_DEVICE=cpu laya-serve
# /models の「難易度判定」でバックエンドを「ローカル Laya」にして接続テスト
```

## コード規約

- 新しい型は `src/types.ts` に追加する
- Node 固有の実装は `src/adapters/` に置き、`src/ports/` のインターフェースを実装する
- ビジネスロジックは Node バインディングに依存しない形を保つ
- テストは `src/__tests__/` に置き、`src/__tests__/helpers.ts` のモックを活用する
- 重い AI/GitHub 処理は HTTP ハンドラ内で直接回さず、インメモリキューか直列 lifecycle で実行する
