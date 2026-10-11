# CLAUDE.md — Ouroboros 開発ガイド

## プロジェクト概要

Ouroboros は AI 自己修復システム。コードベースを継続的にスキャン・解析し、
パッチを生成して Pull Request を自動作成する。

**二重ターゲット** — Node.js 24（Docker / オンプレミス）を主、Cloudflare Worker を副とする。
ビジネスロジックは共有で、`src/adapters/` のプラットフォーム実装だけが入れ替わる。

**制約:**
- AI ゲートウェイは **`LlmGateway` 経由の外部プロバイダ REST**（OpenAI / Anthropic / xAI / OpenRouter）。モデル ID は `provider/model` 形式
- Workers AI は使わない。Workflows も使わない（Cloudflare の healing は Queue consumer 内で直列実行）
- 重い処理（scan / heal / code generate）は **同一プロセス/isolate 内の `RepoRunner`** が GitHub REST API と外部 AI provider を使って実行する
- キーは `.env`（Node）または Worker secret（Cloudflare）のみ。GUI は設定済み/未設定の表示だけで値は返さない

## ディレクトリ構造

```
src/                   Node / Cloudflare 共通ソース（全ビジネスロジック + アダプター）
  adapters/            プラットフォームの具体実装
    sqlite.adapter.ts      node:sqlite の DbAdapter（Node 単体実行）
    rqlite.adapter.ts      rqlite HTTP API の DbAdapter（Docker の DB サービス）
    d1.adapter.ts          Cloudflare D1 の DbAdapter（Cloudflare 専用）
    memory.queue.ts        インメモリ逐次キュー（Node 専用）
    cf.queue.ts            Cloudflare Queues のプロデューサ（Cloudflare 専用）
    memory.ratelimiter.ts  固定窗口リミッタ（共通）
    ai/                    LlmGateway + decisions（Decisions API / Laya）
  analyzers/           AI による findings のグルーピング・リスク評価
  auth/                認証・セッション・API トークン（WebCrypto PBKDF2）
  code/                Code モード（セッション管理・codegen）
  config/              設定値・言語別インスペクションルール・モデルモード定義
  db/                  SQLite リポジトリ層
    migrations/        SQL マイグレーションファイル（wrangler d1 migrations apply 用）
  healing/             RepoRunner（scan/applyFix/code）+ scanner + lifecycle
  http/                Hono ベース REST API（ルート・バリデーション・OpenAPI）
  inspection/          AI スコアリングエンジン（6 次元・32 観点）
  logging/             構造化ロガー（stdout / Workers Logs）
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
  context.ts           全 Ports + Auth の依存性注入（assemble / buildContext / buildContextFromBindings）
  env.ts               AppConfig・loadConfig()・CloudflareBindings・configFromBindings()
  cron.ts              毎時 cron（stale sweep + 定期 healing）
  app.tsx              共有ルート群（fetch/crypto のみ。CSS は引数で受け取る）
  server.ts            Node エントリポイント（node:http）
  worker.tsx           Cloudflare エントリポイント（fetch / queue / scheduled）
```

## 主要パターン

### Ports & Adapters
- `src/ports/` にインターフェース定義（`AiProvider`, `DbAdapter`, `QueueAdapter`, `RateLimiter` 等）
- `src/adapters/` にターゲット別の具体実装（Node: sqlite / memory.queue、Cloudflare: d1 / cf.queue）
- `src/context.ts` の `assemble()` が共通の組み立て。`buildContext(config)` は Node、
  `buildContextFromBindings(env)` は Cloudflare 用で、`RepoRunner` を組み立てて `Ports` に載せる

### 設定と起動
- `src/env.ts` の `loadConfig()`: `process.loadEnvFile()`（`.env` が無い場合は無視）→ 検証
- 必須: `GITHUB_TOKEN` と、`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `XAI_API_KEY` / `OPENROUTER_API_KEY` のいずれか 1 つ以上
- 未設定ならメッセージを出して起動停止
- 既定値: `PORT=3000`、`OURO_DATA_DIR=./data`、`OURO_DB_PATH=<dataDir>/ouroboros.sqlite`、`OURO_REGISTRATION_ENABLED=false`

### 自己修復フロー
```
server.ts / worker.tsx
  └─ HealingLifecycle（src/healing/lifecycle.ts、プロセス/isolate 内直列）
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
- `DbAdapter` の実装は 3 つ。`OURO_DB` 環境変数で Node 側のドライバーを切り替える:
  - `sqlite`（既定）— `node:sqlite` でプロセス内臓
  - `rqlite` — 別コンテナの rqlite（SQLite の HTTP サービス）へ接続。`OURO_RQLITE_URL`（既定 `http://127.0.0.1:4001`）
  - Cloudflare は `buildContextFromBindings()` が常に `D1Adapter` を使う
- `SqliteAdapter` の `batch` は 1 トランザクション、`RqliteAdapter` は `?transaction=true`、`D1Adapter` は `D1Database.batch()` で atomic
- マイグレーションは Node 起動時（`buildContext()` 内）に `runMigrations()` が自動実行。
  Cloudflare パスでは呼んではいけない（`0013` の `ALTER TABLE` は非冪等で、
  wrangler 適用後の二重実行で失敗する）。Cloudflare は `wrangler d1 migrations apply` を使う
- `src/db/migrations/*.sql`（0001〜0013）は `src/db/migrations.ts` の TS ミラーと id で 1:1 対応。

## 開発コマンド

```bash
npm run typecheck       # TypeScript 型チェック（tsc --noEmit）
npm run test            # Vitest ユニットテスト（src/__tests__/）
npm run build:css       # Tailwind v4 の CSS を生成 + public/assets にコピー
npm run dev             # build:css + tsx src/server.ts
npm start               # tsx src/server.ts
docker compose up --build   # Docker で起動（db は別コンテナの rqlite、ボリューム ouroboros-db に永続化）
npm run deploy          # Cloudflare へデプロイ（build → wrangler deploy）
npm run d1:migrate      # D1 マイグレーション適用（--remote）
```

> UI のスタイルは CDN ではなくビルド済み CSS（`src/ui/styles/tailwind.generated.css`）。
> Node は `server.ts` の `loadTailwindCss()` が読み、`buildApp()` に渡す。
> Cloudflare は `null` を渡し、`/assets/tailwind.css` は static assets（`public/`）が配信する。

## デプロイ

1. `.env.example` を `.env` にコピーしてキーを記入
2. `npm ci && npm run build:css`
3. `npm start`（`PORT` で listen）または `docker compose up --build`

Docker では SQLite を別コンテナの rqlite（HTTP API）で動かす。アプリは
`OURO_DB=rqlite` と `OURO_RQLITE_URL=http://db:4001`（compose が設定）で接続し、
db の healthcheck 通過後に起動してマイグレーションを適用する。rqlite は
`NODE_ID` と adv-addr を固定しないと再起動後に Raft 選挙が止まり 503 が続くため、
compose 側で `NODE_ID=1`・`HTTP_ADV_ADDR=db:4001`・`RAFT_ADV_ADDR=db:4002` を指定する。

Cloudflare Worker へデプロイする場合:

1. `npx wrangler d1 create ouroboros`
2. `scripts/resolve-d1.sh` で `database_id` を解決（コミットしない。`D1_DATABASE_ID` で直接指定もできる）
3. `npm run d1:migrate` でマイグレーション適用
4. `npx wrangler secret put GITHUB_TOKEN` と AI キーを設定
5. `npm run deploy`（Workers Builds の Deploy command にも `npm run deploy` を設定する。
   wrangler 設定内の `[build] command` は Workers Builds が無視するため書かない）

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
- ターゲット固有の実装は `src/adapters/` に置き、`src/ports/` のインターフェースを実装する
- ビジネスロジックは Node / Cloudflare バインディングに依存しない形を保つ
  （`node:fs`・`node:http`・`node:sqlite` は entry と adapter に閉じる。`crypto.randomUUID()` は共通で使える）
- テストは `src/__tests__/` に置き、`src/__tests__/helpers.ts` のモックを活用する
- 重い AI/GitHub 処理は HTTP ハンドラ内で直接回さず、キューか直列 lifecycle で実行する
  （Cloudflare は CF Queues の consumer 内で直列実行。Workflows は使わない）
