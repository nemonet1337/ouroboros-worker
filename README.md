# Ouroboros

> AI を使ってコードベースを継続的にスキャン・修正・進化させる自己修復型システム

🌐 **English: [README.en.md](./README.en.md)**

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/nemonet1337/ouroboros)

Ouroboros は **4 種のスキャナー**（CodeQL / 依存関係 / パフォーマンス / シークレット）で
問題を検出し、LLM が解析してパッチを生成、Pull Request を自動作成します。認証・マルチテナントな
API トークン・テレメトリログ・メールアラートを備えています。

**デュアルデプロイ**対応 — 同一の共有コアが、**Docker Compose によるセルフホスト**でも、
**Cloudflare 上のエッジネイティブ**（Workers + D1 + R2 + Queues + Workflows + Workers AI）でも動作します。

> **v2 の変更点:** GitHub Actions 実行モデルは廃止しました。トリガーはコンテナ内スケジューラ
> （セルフホスト）または Cloudflare の cron / Workflow（エッジ）に移行。PR/Issue のバックエンドは
> 引き続き GitHub ですが、差し替え可能な `VcsProvider` の背後に抽象化されています。

---

## アーキテクチャ

```
                         ┌──────────────────────────────┐
                         │      packages/core           │  ランタイム非依存
                         │  scanners · analyzer · fixer │  （共有ライブラリ）
                         │  inspection · orchestrator   │
                         │  auth · db · logging         │
                         │  ports/  （抽象化レイヤー）   │
                         └───────────────┬──────────────┘
              ┌──────────────────────────┴──────────────────────────┐
              ▼                                                       ▼
   ┌────────────────────────┐                          ┌────────────────────────────┐
   │  apps/server (Docker)  │                          │   apps/worker (Cloudflare)  │
   │  Node + Hono           │                          │   Workers + Hono            │
   │  SQLite · ファイルログ │                          │   D1 · R2 ログ              │
   │  SMTP · 内部キュー     │                          │   MailChannels · Queues     │
   │  LocalRunner (git+CI)  │◀── dispatch /internal ───│   DispatchRunner            │
   │  AnthropicProvider     │      （重い処理を委譲）   │   WorkersAI (+Anthropic)    │
   │  インターバル cron     │                          │   Workflows · レート制限    │
   └────────────────────────┘                          └────────────────────────────┘
```

プラットフォーム差分はすべて `packages/core/src/ports` の**ポート**に隠蔽されています:

| ポート          | セルフホスト (Node)            | Cloudflare (Worker)              |
| -------------- | ----------------------------- | -------------------------------- |
| `DbAdapter`    | `better-sqlite3`              | D1                               |
| `LogStore`     | フラット `.log` ファイル       | R2 オブジェクト                   |
| `QueueAdapter` | 内部（インプロセス）           | Cloudflare Queues                |
| `AiProvider`   | Anthropic (fetch)             | Workers AI（+ Anthropic フォールバック） |
| `Mailer`       | SMTP (nodemailer)             | MailChannels                     |
| `VcsProvider`  | GitHub (fetch)                | GitHub (fetch)                   |
| `HealingRunner`| `LocalRunner`（git/コンパイラ）| `DispatchRunner` → セルフホストへ |
| `RateLimiter`  | なし（no-op）                  | Workers Rate Limiting API        |

エッジの注記: Workers にはファイルシステム/git/コンパイラが無いため、パッチ適用＋検証＋commit＋push は
セルフホストの `LocalRunner`（`/internal/heal`）へ **HTTP で委譲**します。一方で **Cloudflare Workflow**
が「スキャン → 解析 → 修正 → PR」という永続的なライフサイクルを駆動します。

---

## ディレクトリ構成

```
packages/core/        共有・ランタイム非依存ロジック + ports + db + auth + HTTP API
apps/server/          セルフホスト Node アプリ（Docker）
apps/worker/          Cloudflare Worker（D1/R2/Queues/Workflows/AI）
web/                  Nuxt 3 GUI（静的 SPA としてビルドされ、各アプリが配信）
docker-compose.yml    セルフホストデプロイ
wrangler.toml         Cloudflare デプロイ
```

---

## クイックスタート — セルフホスト（Docker Compose）

```bash
cp .env.example .env          # ANTHROPIC_API_KEY, GITHUB_TOKEN, GITHUB_REPOSITORY を設定
docker compose up --build
open http://localhost:3000     # 最初に登録したアカウントが管理者になります
```

ローカルデプロイの AI ゲートウェイ（Anthropic API など）は `.env` の環境変数で
設定します。Docker を使わない場合もサーバー起動時にカレントディレクトリの
`.env` が自動で読み込まれます（既存の環境変数が優先。`OURO_ENV_FILE` でパスを変更可能）。

状態はローカルに保存されます: SQLite は `ouro-data` ボリューム、テレメトリ `.log` は `ouro-logs` ボリューム。

### Docker を使わない場合

```bash
npm install
npm run build:web
OURO_DB_PATH=./ouroboros.db OURO_LOG_DIR=./logs \
OURO_GUI_DIR=./web/.output/public npm run server
```

---

## クイックスタート — Cloudflare（エッジ）

最短経路は README 冒頭の **Deploy to Cloudflare** ボタンです（リポジトリを Fork して
Workers にデプロイ）。手動でセットアップする場合:

```bash
npm install
npm run build:web                                   # GUI → web/.output/public（ASSETS で配信）

wrangler d1 create ouroboros                         # 出力された id を wrangler.toml に貼り付け
wrangler r2 bucket create ouroboros-logs
wrangler queues create ouroboros-gui-events
wrangler d1 migrations apply ouroboros               # スキーマ: packages/core/src/db/migrations

wrangler secret put GITHUB_TOKEN
wrangler secret put GITHUB_REPOSITORY               # owner/repo
wrangler secret put RUNNER_SHARED_SECRET            # 委譲先 LocalRunner の認証用
# 自己修復を使う場合、RUNNER_URL (vars) に到達可能なセルフホスト /internal エンドポイントを設定

wrangler deploy                                      # または: wrangler dev
```

`wrangler.toml` が D1・R2・Queues・Workflows・Workers AI・レート制限バインディング・
日次 cron トリガー・静的 GUI アセットを配線します。

> **AI ゲートウェイの分離:** Cloudflare デプロイでは **Workers AI バインディングのみ**が
> AI ゲートウェイとして使われます。外部ゲートウェイ（Anthropic / OpenAI / Gemini /
> OpenRouter）のトークンは API レベルで拒否されます。利用可能なモデルは
> `GET /api/v1/models` がアカウントの Workers AI から動的に検出し、GUI のモデル
> セレクタに全モデルが表示されます。外部ゲートウェイを使いたい場合はローカル
> デプロイ（`.env`）を選択してください。

> **Deploy ボタンの注意:** D1 / R2 / Queues / Workflows のリソースは初回に作成が必要です
> （上記 `wrangler` コマンド、または Cloudflare ダッシュボードから）。

---

## 主な機能

- **自己修復ループ** — 並列スキャナー → AI による解析・グルーピング → AI 修正＋検証 →
  PR 作成 → 任意の自動マージ（CI ゲート＋AI 安全レビュー）→ エスカレーション Issue。
- **認証とマルチテナント** — メール/パスワード（WebCrypto PBKDF2）、httpOnly セッション、
  スコープ付きで失効可能な **API トークン**（`read` / `inspect` / `heal` / `admin`）。
- **登録制御** — 公開登録の管理者トグル。最初のユーザーが管理者として初期化されます。
- **テレメトリ** — 構造化ログをフラット `.log` ファイルに永続化（ローカルディレクトリまたは R2）。
- **メールアラート** — 高リスクなスキャンや修正失敗を通知（セルフホスト=SMTP、エッジ=MailChannels）。
- **非同期オーケストレーション（エッジ）** — GUI イベントは Cloudflare Queues、自己修復ライフサイクルは Workflows。
- **レート制限（エッジ）** — 公開エンドポイントに Workers Rate Limiting。
- **コードインスペクション** — AI スコアリングエンジンを `POST /api/v1/inspect` で提供。
  6 次元（セキュリティ / パフォーマンス / 冗長性 / 可読性 / 設計 / 正確性）の重み付きスコアを、
  ファイル単位または関数・メソッド・クラス単位（`granularity: "function"`）で算出し、
  低スコアのユニットをヒューリスティックに選別した改修候補（`refactorCandidates`）を優先度付きで返します。

---

## API（抜粋）

ベースパス: **`/api/v1`**（`/api` は後方互換エイリアスとして維持）。
詳細リファレンス: **[docs/api.ja.md](./docs/api.ja.md)** · 機械可読: `GET /api/v1/openapi.json`。

| メソッド | パス                          | 認証              |
| ------- | ----------------------------- | ---------------- |
| POST    | `/api/v1/auth/register`       | 公開*            |
| POST    | `/api/v1/auth/login`          | 公開             |
| GET     | `/api/v1/auth/me`             | セッション/トークン |
| GET/POST/DELETE | `/api/v1/tokens`     | セッション/トークン |
| GET/PUT | `/api/v1/config`             | admin（PUT）      |
| GET/PUT | `/api/v1/settings`           | admin（PUT）      |
| POST    | `/api/v1/inspect`             | scope `inspect`  |
| POST    | `/api/v1/healing`            | scope `heal`     |
| GET     | `/api/v1/metrics`             | セッション/トークン |
| GET     | `/api/v1/logs`                | admin            |

\* 登録トグルで制御されます（最初/管理者ユーザーは常に許可）。
トークンは `Authorization: Bearer ouro_…` で送信します。エラーは統一形式
`{ "error": { "code", "message" } }` で返されます。

---

## 開発・テスト

```bash
npm run typecheck                      # 全ワークスペース
npm run test                           # core ユニットテスト（vitest）
npm run dev --workspace web            # Nuxt 開発サーバー
```

---

## ライセンス

Apache-2.0 — [LICENSE](./LICENSE) を参照してください。
