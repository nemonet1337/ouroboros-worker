# CLAUDE.md — Ouroboros 開発ガイド

## プロジェクト概要

Ouroboros は **Cloudflare Workers 専用**のエッジネイティブな AI 自己修復システム。
コードベースを継続的にスキャン・解析し、パッチを生成して Pull Request を自動作成する。

**制約:**
- AI ゲートウェイは **Cloudflare Workers AI のみ**。Anthropic / OpenAI 等の外部キーは API レベルで拒否される
- Docker / オンプレミス対応は廃止（v2.1 で削除済み）
- 重い処理（scan / heal / code generate）は **同一 Worker 内の `RepoRunner`** が GitHub REST API と Workers AI を使って実行する
- Dynamic Workers / 別リポジトリ runner（`ouroborous-runner`）への委譲は廃止済み

## ディレクトリ構造

```
src/                   Worker ソース（全ビジネスロジック + CF アダプター）
  adapters/            Cloudflare サービスの具体実装（D1, R2, Queues, Workers AI …）
  analyzers/           AI による findings のグルーピング・リスク評価
  auth/                認証・セッション・API トークン（WebCrypto PBKDF2）
  code/                Code モード（セッション管理・codegen）
  config/              設定値・言語別インスペクションルール・モデルモード定義
  db/                  D1/SQLite リポジトリ層
    migrations/        SQL マイグレーションファイル
  healing/             RepoRunner（scan/applyFix/code）+ scanner
  http/                Hono ベース REST API（ルート・バリデーション・OpenAPI）
  inspection/          AI スコアリングエンジン（6 次元・32 観点）
  logging/             構造化ロガー（R2 永続化）
  ports/               アダプターインターフェース（Ports & Adapters）
  pr/                  PR 生成・重複排除
  queues/              Cloudflare Queues コンシューマー
  refactor/            Refactor モード（検査結果からのリファクタ提案・適用）
  retrieval/           インデックス-less コード検索（ファイル選択・chunk 分割・埋め込み順位付け）
  routing/             Clef によるモデル階層ルーティング（難易度判定 → Luna / Sol）
  schemas/             JSON スキーマ定義（AJV バリデーション用）
  ui/                  Hono JSX ベース SSR GUI（htmx + Tailwind v4）
  utils/               エスカレーター・修正キャッシュ
  vcs/                 GitHub REST API 連携（fetch ベース、git object 書き込み含む）
  workflows/           Cloudflare Workflows（永続・再開可能なライフサイクル）
  __tests__/           Vitest ユニットテスト
  types.ts             全型定義
  context.ts           全 Ports + Auth の依存性注入（buildContext）
  env.ts               Cloudflare バインディング・シークレット型定義
  index.tsx            Worker エントリーポイント
```

## 主要パターン

### Ports & Adapters
- `src/ports/` にインターフェース定義（`AiProvider`, `DbAdapter`, `LogStore` 等）
- `src/adapters/` に Cloudflare 向け具体実装
- `src/context.ts` の `buildContext()` で `RepoRunner` を組み立てて `Ports` に載せる

### 自己修復フロー
```
Workflows (healing.ts)
  1. scan     → RepoRunner.scan() → GitHub tarball + scanner
  2. analyze  → AIAnalyzer（ファイル選択 + 埋め込み順位付け）→ Workers AI
  3. fix      → RepoRunner.applyFix() → blob/tree/commit/ref → VCS.createPR()
失敗時は healing_runs.status = "failed" + summary にエラーを記録
キャンセル: POST /healing/:runId/cancel → Workflow.terminate()
```

### AI モデル解決
- テキスト生成: `users.model` → `DEFAULT_WORKERS_AI_MODEL`（`openai/gpt-6-luna`）。`AuthService.resolveModel(userId)` を必ず経由する
- Embedding: `DEFAULT_EMBEDDING_MODEL`（`@cf/qwen/qwen3-embedding-0.6b`、1024 次元）で固定。インデックスを持たないため選択 UI はない
- **codegen のみ** Clef（`@cf/cloudflare/clef-flash`）で実装難易度を判定し、`solThreshold` 以上なら `openai/gpt-6-sol`（effort=medium）、未満なら Luna（effort=low）を使う。判定できない場合は Luna にフォールバック
- inspection / healing / refactor は Luna 固定。Sol を意図的に混ぜない
- 専用画面 `/models`。判定結果は `code_sessions.difficulty` / `tier` / `route_model` に記録する
- partner モデル（`vendor/model`）は AI バインディングを第一候補にし、失敗時のみ REST へフォールバック。`reasoning_effort` と `prompt_cache_key` は partner モデルにのみ付与する

### コード検索（インデックスなし）
```
src/retrieval/
  file.selector.ts   Luna に関連ファイルを列挙させる（repoMap に無いパスは除去）
  chunk.rank.ts      選択分を chunk 化して埋め込み、Worker 内で cosine 順位付け
  chunker.ts         シンボル境界による chunk 分割
  tokenize.ts        Intl.Segmenter による日本語対応トークナイザ
  retrieve.ts        3 つの呼び出し点が共有する入口
```
Vectorize は廃止。`getRepoFiles()` の tarball から選び、`EMBED_BATCH_LIMIT`（32）ずつ
埋め込むためインデックス再構築も次元移行も不要。

### DB アクセス
- `src/db/repositories.ts` にリポジトリクラス
- `D1Adapter` が `DbAdapter` を実装
- マイグレーションは起動時に `runMigrations()` が自動実行

## 開発コマンド

```bash
npm run typecheck       # TypeScript 型チェック（tsc --noEmit）
npm run test            # Vitest ユニットテスト（src/__tests__/）
npm run build:css       # Tailwind v4 の CSS を生成
npm run worker:dev      # build:css + wrangler dev
npm run worker:deploy   # build:css + wrangler deploy
```

> UI のスタイルは CDN ではなくビルド済み CSS（`src/ui/styles/tailwind.generated.css`）。
> **`tailwind.generated.css` はビルド成果物のため git 管理対象外**（`.gitignore`）。
> Cloudflare Workers Builds では Build command に `npm run build:css` を設定すること。

## デプロイ

1. `wrangler.toml` を確認
2. DLQ を作成（初回のみ）: `wrangler queues create ouroboros-dlq`
3. `wrangler deploy` でデプロイ

必要なシークレット:
```
WORKERS_AI_API_TOKEN     （任意）GPT-6 系は binding で動くため通常不要
CLOUDFLARE_ACCOUNT_ID    Workers AI REST API 使用時に必要（任意）
GITHUB_TOKEN             PR/Issue 作成用（owner/repo はトークンから自動検出）
```

## コード規約

- 新しい型は `src/types.ts` に追加する
- Cloudflare 固有の実装は `src/adapters/` に置き、`src/ports/` のインターフェースを実装する
- ビジネスロジックは CF バインディングに依存しない形を保つ
- テストは `src/__tests__/` に置き、`src/__tests__/helpers.ts` のモックを活用する
- 重い AI/GitHub 処理は HTTP ハンドラ内で直接回さず、Workflow ステップか Queue コンシューマで実行する
