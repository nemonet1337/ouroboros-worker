# Ouroboros

> AI を使ってコードベースを継続的にスキャン・修正・進化させる自己修復型システム

🌐 **English: [README.en.md](./README.en.md)**

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/nemonet1337/ouroboros)

Ouroboros は問題を検出し、LLM が解析してパッチを生成、Pull Request を自動作成します。
認証・マルチテナントな API トークン・テレメトリログ・メールアラートを備えています。

**Cloudflare Workers 特化** — Workers + D1 + R2 + Queues + Workflows + Workers AI の
エッジネイティブ構成だけをサポートします。

> **AI ゲートウェイ:** Ouroboros が接続する LLM は **Cloudflare Workers AI 上の
> モデルに限定**されます（デフォルト: `minimax/m3`）。利用可能な全モデルは GUI の
> 設定画面から選択できます。AI の認証情報は Workers AI 専用の API トークン
> **`WORKERS_AI_API_TOKEN`**（Worker シークレット）のみで管理され、Anthropic /
> OpenAI などの外部ゲートウェイのトークンは API レベルで拒否されます。

---

## アーキテクチャ

```
src/
├── adapters/      Cloudflare サービスアダプター（D1, R2, Queues, Workers AI …）
├── analyzers/     AI 解析エンジン（findings のグルーピング・リスク評価）
├── auth/          認証・セッション・API トークン管理
├── config/        設定・言語別ルール（10 言語対応）
├── db/            D1/SQLite レイヤー（7 テーブル・マイグレーション）
├── healing/       自己修復オーケストレーター
├── http/          Hono ベース REST API
├── inspection/    AI スコアリングエンジン（6 次元・32 観点）
├── logging/       構造化ロガー（R2 永続化）
├── notifications/ メールアラート・通知
├── ports/         アダプターインターフェース（Ports & Adapters パターン）
├── pr/            PR タイトル・本文生成・重複排除・自動マージ
├── queues/        Cloudflare Queues ハンドラー
├── schemas/       JSON スキーマ定義
├── utils/         暗号化・エスカレーター・修正キャッシュ
├── vcs/           GitHub 連携（fetch ベース）
├── webhook/       Webhook ディスパッチ（Slack, Discord, GitHub, Generic）
├── workflows/     Cloudflare Workflows（永続的な自己修復ライフサイクル）
├── types.ts       全型定義
├── context.ts     依存性注入
├── env.ts         Cloudflare バインディング型
└── index.ts       Worker エントリーポイント
web/               Nuxt 3 GUI（静的 SPA としてビルドされ ASSETS で配信）
```

| ポート          | 実装（Cloudflare Worker）         |
| -------------- | -------------------------------- |
| `DbAdapter`    | D1                               |
| `LogStore`     | R2 オブジェクト                   |
| `QueueAdapter` | Cloudflare Queues                |
| `AiProvider`   | Workers AI（唯一の AI ゲートウェイ）|
| `Mailer`       | MailChannels                     |
| `VcsProvider`  | GitHub (fetch)                   |
| `HealingRunner`| `DispatchRunner` → 外部 runner（任意）|
| `RateLimiter`  | Workers Rate Limiting API        |

注記: Workers にはファイルシステム/git/コンパイラが無いため、パッチ適用＋検証＋commit＋push は
`RUNNER_URL` で指定した外部 runner（`/internal/heal`）へ **HTTP で委譲**できます（任意）。
**Cloudflare Workflow** が「スキャン → 解析 → 修正 → PR」という永続的なライフサイクルを駆動します。

---

## クイックスタート — Cloudflare

最短経路は README 冒頭の **Deploy to Cloudflare** ボタンです（リポジトリを Fork して
Workers にデプロイ）。手動でセットアップする場合:

```bash
npm install
npm run build:web                                   # GUI → web/.output/public（ASSETS で配信）

wrangler d1 create ouroboros                         # 出力された id を wrangler.toml に貼り付け
wrangler r2 bucket create ouroboros-logs
wrangler queues create ouroboros-gui-events
wrangler d1 migrations apply ouroboros               # スキーマ: src/db/migrations/

wrangler secret put WORKERS_AI_API_TOKEN             # （任意）Workers AI 専用 API トークン
wrangler secret put GITHUB_TOKEN
wrangler secret put GITHUB_REPOSITORY               # owner/repo
wrangler secret put RUNNER_SHARED_SECRET            # （任意）委譲先 runner の認証用

wrangler deploy                                      # または: wrangler dev
```

`wrangler.toml` が D1・R2・Queues・Workflows・Workers AI・レート制限バインディング・
日次 cron トリガー・静的 GUI アセットを配線します。

### 管理者アカウント

- 環境変数は不要です。デプロイ後にブラウザでアプリを開くと、**ユーザーが 0 人の
  初回のみ自動的に登録画面（`/register`）へ誘導**されます。
- **最初に登録したアカウントが管理者**になり、以降の公開登録は自動的に
  ロックされます（Admin ページのトグルで再有効化可能）。

### AI モデル

- デフォルトモデルは **`minimax/m3`**（`wrangler.toml` の `OURO_WORKERS_AI_MODEL`）。
- `GET /api/v1/models` がアカウントの Workers AI から全モデルを動的に検出し、
  **GUI の設定画面で Workers AI が提供するすべてのモデルを選択**できます。
- AI の認証情報は **`WORKERS_AI_API_TOKEN`** のみ。`CLOUDFLARE_ACCOUNT_ID` と併用
  すると Workers AI REST API 経由で推論し、未設定なら AI バインディングを直接使用します。

---

## 主な機能

- **自己修復ループ** — スキャン → AI による解析・グルーピング → AI 修正＋検証 →
  PR 作成 → 任意の自動マージ（CI ゲート＋AI 安全レビュー）→ エスカレーション Issue。
- **認証とマルチテナント** — メール/パスワード（WebCrypto PBKDF2）、httpOnly セッション、
  スコープ付きで失効可能な **API トークン**（`read` / `inspect` / `heal` / `admin`）。
- **登録制御** — 公開登録の管理者トグル。最初に登録したユーザーが管理者になります。
- **テレメトリ** — 構造化ログをフラット `.log` ファイルとして R2 に永続化。
- **メールアラート** — 高リスクなスキャンや修正失敗を MailChannels で通知。
- **非同期オーケストレーション** — GUI イベントは Cloudflare Queues、自己修復ライフサイクルは Workflows。
- **レート制限** — 公開エンドポイントに Workers Rate Limiting。
- **コードインスペクション** — AI スコアリングエンジンを `POST /api/v1/inspect` で提供。
  6 次元（セキュリティ / パフォーマンス / 冗長性 / 可読性 / 設計 / 正確性）の重み付きスコアを、
  ファイル単位または関数・メソッド・クラス単位（`granularity: "function"`）で算出し、
  低スコアのユニットをヒューリスティックに選別した改修候補（`refactorCandidates`）を優先度付きで返します。

---

## API（抜粋）

ベースパス: **`/api/v1`**（`/api` は後方互換エイリアスとして維持）。
機械可読: `GET /api/v1/openapi.json`。

| メソッド | パス                          | 認証              |
| ------- | ----------------------------- | ---------------- |
| POST    | `/api/v1/auth/register`       | 公開*            |
| POST    | `/api/v1/auth/login`          | 公開             |
| GET     | `/api/v1/auth/me`             | セッション/トークン |
| GET/POST/DELETE | `/api/v1/tokens`     | セッション/トークン |
| GET/PUT | `/api/v1/config`             | admin（PUT）      |
| GET/PUT | `/api/v1/settings`           | admin（PUT）      |
| GET     | `/api/v1/models`              | セッション/トークン |
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
npm run typecheck                      # TypeScript 型チェック
npm run test                           # vitest ユニットテスト（src/__tests__/）
npm run dev --workspace web            # Nuxt 開発サーバー
npm run worker:dev                     # wrangler dev
```

---

## ライセンス

Apache-2.0 — [LICENSE](./LICENSE) を参照してください。
