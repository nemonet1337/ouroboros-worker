# Ouroboros

> AI を使ってコードベースを継続的にスキャン・修正・進化させる自己修復型システム

🌐 **English: [README.en.md](./README.en.md)**

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/nemonet1337/ouroboros)

Ouroboros は問題を検出し、LLM が解析してパッチを生成、Pull Request を自動作成します。
認証・マルチテナントな API トークン・テレメトリログ・メールアラートを備えています。

**Cloudflare Workers 特化** — Workers + D1 + R2 + Queues + Workflows + Workers AI + Vectorize の
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
├── adapters/      Cloudflare サービスアダプター（D1, R2, Queues, Workers AI, Vectorize …）
├── analytics/     AI 使用量トラッカー・コスト見積もり
├── analyzers/     AI 解析エンジン（findings のグルーピング・リスク評価）
├── auth/          認証・セッション・API トークン管理
├── code/          コードセッション管理・バージョン追跡・キャッシュ
├── config/        設定・言語別ルール（10 言語対応）
├── db/            D1/SQLite レイヤー（7 テーブル・マイグレーション）
├── flags/         機能フラグ管理
├── healing/       自己修復オーケストレーター
├── http/          Hono ベース REST API
├── inspection/    AI スコアリングエンジン（6 次元・32 観点）
├── logging/       構造化ロガー（R2 永続化）
├── notifications/ メールアラート・通知
├── ports/         アダプターインターフェース（Ports & Adapters パターン）
├── pr/            PR タイトル・本文生成・重複排除・自動マージ
├── queues/        Cloudflare Queues ハンドラー
├── refactor/      リファクタリング提案管理
├── schemas/       JSON スキーマ定義
├── testing/       ブラウザテスト支援
├── ui/            サーバーサイドレンダリング UI（Hono JSX）
├── utils/         暗号化・エスカレーター・修正キャッシュ
├── vcs/           GitHub 連携（fetch ベース）
├── webhook/       Webhook ディスパッチ（Slack, Discord, GitHub, Generic）
├── workflows/     Cloudflare Workflows（永続的な自己修復ライフサイクル）
├── types.ts       全型定義
├── context.ts     依存性注入
├── env.ts         Cloudflare バインディング型
└── index.tsx      Worker エントリーポイント
```

| ポート          | 実装（Cloudflare Worker）         |
| -------------- | -------------------------------- |
| `DbAdapter`    | D1                               |
| `LogStore`     | R2 オブジェクト                   |
| `QueueAdapter` | Cloudflare Queues                |
| `AiProvider`   | Workers AI（唯一の AI ゲートウェイ）|
| `Mailer`       | MailChannels / CF Email Routing  |
| `VcsProvider`  | GitHub (fetch)                   |
| `HealingRunner`| `RpcRunner`(Service Binding) / `DispatchRunner`(HTTP) → CF Worker runner |
| `RateLimiter`  | Workers Rate Limiting API        |
| `VectorizePort`| Cloudflare Vectorize（適応的重み付け）|

注記: Workers にはファイルシステム/git/コンパイラが無いため、パッチ適用＋commit＋push は
`ouroboros-runner` Worker（GitHub API ベース）へ **Service Binding または HTTP で委譲**します。
未設定時は NoopRunner により修正ステップがスキップされます。
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

# Vectorize インデックス（適応的重み付け用、任意）
wrangler vectorize create ouroboros-weight-profiles --dimensions=32 --metric=cosine

wrangler secret put WORKERS_AI_API_TOKEN             # （任意）Workers AI 専用 API トークン
wrangler secret put GITHUB_TOKEN
wrangler secret put GITHUB_REPOSITORY               # owner/repo（省略時はトークンから自動検出）
wrangler secret put RUNNER_SHARED_SECRET            # （任意）委譲先 runner の認証用

wrangler deploy                                      # または: wrangler dev
```

`wrangler.toml` が D1・R2・Queues・Workflows・Workers AI・Vectorize・レート制限バインディング・
日次 cron トリガー・静的 GUI アセットを配線します。

### 管理者アカウント

- 環境変数は不要です。デプロイ後にブラウザでアプリを開くと、**ユーザーが 0 人の
  初回のみ自動的に登録画面（`/register`）へ誘導**されます。
- **最初に登録したアカウントが管理者**になり、以降の公開登録は自動的に
  ロックされます（Admin ページのトグルで再有効化可能）。

### AI モデル

- デフォルトモデルは **`minimax/m3`**。
- `GET /api/v1/models` がアカウントの Workers AI から全モデルを動的に検出し、
  **GUI の設定画面で Workers AI が提供するすべてのモデルを選択**できます。
- 各ユーザーは `GET/PUT /api/v1/settings/model` で個人のモデル設定を保存でき、
  インスペクション時には個人設定が優先されます（未設定時はデフォルトの `minimax/m3`）。
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
- **適応的重み付け** — Vectorize が 32 観点のスコアを 32 次元ベクターとして蓄積し、
  過去実績から観点ごとの重みを自動調整します。
- **コードセッション** — リポジトリ・ブランチ・指示を指定して AI にコード生成を依頼。
  生成されたパッチは自動的に PR として適用されます。
- **リファクタリング提案** — インスペクション結果から AI が具体的な改善提案を生成し、
  優先度付きで管理します。
- **AI 使用量分析** — Analytics Engine で AI 推論の使用量・コストを追跡。
- **機能フラグ** — 実験的機能の段階的ロールアウトを管理。

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
| GET/PUT | `/api/v1/settings/model`     | セッション/トークン |
| GET     | `/api/v1/models`              | セッション/トークン |
| POST    | `/api/v1/inspect`             | scope `inspect`  |
| POST    | `/api/v1/healing`            | scope `heal`     |
| GET     | `/api/v1/metrics`             | セッション/トークン |
| GET     | `/api/v1/logs`                | admin            |
| GET/POST | `/api/v1/code/sessions`     | セッション/トークン |
| GET     | `/api/v1/code/sessions/:id`   | セッション/トークン |
| POST    | `/api/v1/code/sessions/:id/generate` | セッション/トークン |
| POST    | `/api/v1/code/sessions/:id/apply`    | セッション/トークン |
| GET/POST | `/api/v1/refactor/proposals` | セッション/トークン |

\* 登録トグルで制御されます（最初/管理者ユーザーは常に許可）。
トークンは `Authorization: Bearer ouro_…` で送信します。エラーは統一形式
`{ "error": { "code", "message" } }` で返されます。

---

## GUI ページ

- `/` — ホーム（ダッシュボード）
- `/healing` — 自己修復ラン履歴
- `/inspection` — コードインスペクション結果
- `/code` — コードセッション一覧
- `/code/new` — 新規コードセッション作成
- `/code/sessions/:id` — コードセッション詳細
- `/refactor` — リファクタリング提案
- `/webhooks` — Webhook 設定
- `/tokens` — API トークン管理
- `/settings` — 個人設定（AI モデル選択）
- `/admin` — 管理者設定（登録トグル、ユーザー管理）

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
