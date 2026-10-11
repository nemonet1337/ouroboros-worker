# Ouroboros

> AI を使ってコードベースを継続的にスキャン・修正・進化させる自己修復型システム

🌐 **English: [README.en.md](./README.en.md)**

Ouroboros は問題を検出し、LLM が解析してパッチを生成、Pull Request を自動作成します。
認証・マルチテナントな API トークン・構造化ログを備えています。

**二重ターゲット** — Node.js 24（Docker / オンプレミス）を主、Cloudflare Worker を副の
デプロイ先としてサポートします。ビジネスロジックは共有で、差し替わるのは
`src/adapters/` のプラットフォーム実装だけです。

- **Node / Docker**: `node:http` + `node:sqlite`（プロセス内臓）+ `LlmGateway`（外部 REST）
- **Cloudflare**: D1 + Queues + static assets。AI は同じ `LlmGateway`（`fetch` は Workers でも動く）

> **AI ゲートウェイ:** モデル ID は **`provider/model`** 形式
> （例: `openai/gpt-6-luna`）。キーは `.env`（Node）または Worker の secret
> （Cloudflare）のみで管理し、GUI には設定済みかどうかだけを返します。
> 起動には `GITHUB_TOKEN` と、AI キー 1 つ以上が必要です。

---

## アーキテクチャ

```
src/
├── adapters/      プラットフォームアダプター
│   ├── sqlite.adapter.ts    DbAdapter（node:sqlite）      ← Node 単体実行
│   ├── rqlite.adapter.ts    DbAdapter（rqlite HTTP API）   ← Docker の DB サービス
│   ├── d1.adapter.ts        DbAdapter（Cloudflare D1）    ← Cloudflare 専用
│   ├── memory.queue.ts      QueueAdapter（逐次キュー）     ← Node 専用
│   ├── cf.queue.ts          QueueAdapter（CF Queues）      ← Cloudflare 専用
│   ├── memory.ratelimiter.ts RateLimiter（固定窗口）       ← 共通
│   └── ai/        LlmGateway（4 プロバイダ）と decisions（Decisions API / Laya）
├── analytics/     AI 使用量アキュムレータ・コスト見積もり
├── analyzers/     AI 解析エンジン（findings のグルーピング・リスク評価）
├── auth/          認証・セッション・API トークン管理
├── code/          コードセッション管理・バージョン追跡・キャッシュ
├── config/        設定・言語別ルール（10 言語対応）
├── db/            SQLite マイグレーション（TS ミラー + .sql）
├── flags/         機能フラグ管理
├── healing/       自己修復オーケストレーター（lifecycle = 直列実行）
├── http/          Hono ベース REST API
├── inspection/    AI スコアリングエンジン（6 次元・32 観点）
├── logging/       構造化ロガー（stdout / Workers Logs）
├── ports/         アダプターインターフェース（Ports & Adapters パターン）
├── pr/            PR タイトル・本文生成・重複排除
├── queues/        GUI イベントの逐次処理
├── refactor/      リファクタリング提案管理
├── retrieval/     インデックスなしコード検索（file selector + chunk rank）
├── routing/       難易度判定によるモデル階層ルーティング
├── schemas/       JSON スキーマ定義
├── ui/            サーバーサイドレンダリング UI（Hono JSX）
├── utils/         エスカレーター・修正キャッシュ
├── vcs/           GitHub 連携（fetch ベース）
├── types.ts       全型定義
├── context.ts     依存性注入（assemble / buildContext / buildContextFromBindings）
├── cron.ts        毎時 cron（stale sweep + 定期 healing）
├── env.ts         AppConfig・loadConfig()・CloudflareBindings
├── app.tsx        共有ルート群（fetch/crypto のみ）
├── server.ts      Node エントリポイント（node:http）
└── worker.tsx     Cloudflare エントリポイント（fetch / queue / scheduled）
```

| ポート          | Node / Docker                    | Cloudflare Worker              |
| --------------- | -------------------------------- | ------------------------------ |
| `DbAdapter`     | `node:sqlite`（プロセス内臓）または `rqlite`（別コンテナ） | D1（`D1Adapter`）              |
| `QueueAdapter`  | インメモリ逐次キュー（`MemoryQueue`） | CF Queues（`CfQueueAdapter`） |
| `AiProvider`    | `LlmGateway`（OpenAI / Anthropic / xAI / OpenRouter） | 同じ `LlmGateway` |
| `VcsProvider`   | GitHub (fetch)                   | GitHub (fetch)                 |
| `HealingRunner` | `RepoRunner`（同一プロセス内、GitHub REST API） | 同じ `RepoRunner` |
| `RateLimiter`   | 固定窗口インメモリ（`MemoryRateLimiter`） | 同じ（isolate 単位の近似） |

注記: スキャン・修正・コミット・PR 作成は **同一プロセス/isolate の `RepoRunner`** が
GitHub REST API で実行します。自己修復ライフサイクルは `HealingLifecycle`
（直列実行）が駆動します。キャンセルは `POST /healing/:runId/cancel` で
`healing_runs.status` を `canceled` にし、各ステップの前にチェックします。

---

## クイックスタート — Node

```bash
npm install
cp .env.example .env        # キーを記入する

npm run build:css           # Tailwind をビルド（GUI のスタイル）
npm run dev                 # build:css + tsx src/server.ts
# または
npm start                   # tsx src/server.ts
```

`.env` の必須項目:

| キー | 必須 | 用途 |
| --- | --- | --- |
| `GITHUB_TOKEN` | はい | PR / Issue 作成。`owner/repo` は未設定ならトークンから自動検出 |
| `OPENAI_API_KEY` | いずれか 1 つ以上 | `openai/*` モデル |
| `ANTHROPIC_API_KEY` | 〃 | `anthropic/*` モデル |
| `XAI_API_KEY` | 〃 | `xai/*` モデル |
| `OPENROUTER_API_KEY` | 〃 | `openrouter/*` モデル |
| `LAYA_API_KEY` | いいえ | ローカル Laya に Bearer 認証が必要な場合だけ |

任意項目: `PORT`（既定 3000）、`OURO_DATA_DIR`（既定 `./data`）、
`OURO_DB_PATH`（既定 `<dataDir>/ouroboros.sqlite`）、
`OURO_REGISTRATION_ENABLED`（既定 false）。
`OURO_DB=rqlite` + `OURO_RQLITE_URL=http://127.0.0.1:4001` で別サーバーの
SQLite（rqlite）に接続するモードにも切り替えられます。

必須キーが無い場合は起動せず、エラーメッセージを出して終了します。

### 管理者アカウント

- 初回はユーザー 0 人のため `/register` へ誘導されます。
- **最初に登録したアカウントが管理者**になり、以降の公開登録は自動的に
  ロックされます（Admin ページのトグルで再有効化可能）。

---

## クイックスタート — Docker

```bash
cp .env.example .env        # キーを記入する
docker compose up --build
```

- `http://127.0.0.1:3000` で起動します（`GET /api/v1/health` で疎通確認）。
- **SQLite は別コンテナの `db` サービス（[rqlite](https://rqlite.io/)）で動作**します。
  rqlite は SQLite を Raft + HTTP API で提供するので、アプリは
  `OURO_DB=rqlite` / `OURO_RQLITE_URL=http://db:4001` で DB にネットワーク越しに接続します
  （Cloudflare の Worker → D1 と同じ構成）。
- データ（Raft ログ + SQLite ファイル）は名前付きボリューム `ouroboros-db` に永続化されます。
  バックアップは `docker run --rm -v ouroboros-worker_ouroboros-db:/data alpine tar czf - -C /data . > backup.tgz` などで行えます。
- アプリは `db` の healthcheck 通過後に起動し、起動時にマイグレーションを適用します。
- ホストの `./data` は使いません（`OURO_DB=rqlite` 時）。プロセス内臓の SQLite で動かす
  場合は `OURO_DB` を未設定（既定 `sqlite`）にし、`./data:/app/data` をボリュームに追加してください。

---

## クイックスタート — Cloudflare Worker

副次のデプロイ先です。D1 と Queues を使います（Workflows は使いません）。

```bash
# 1. D1 データベースを作成（初回のみ）
npx wrangler d1 create ouroboros

# 2. database_id を wrangler.toml に反映（secret 相当なのでコミットしない）
scripts/resolve-d1.sh
#   または D1_DATABASE_ID=<uuid> scripts/resolve-d1.sh

# 3. マイグレーションを適用（初回のみ。.sql は wrangler が順に適用する）
npm run d1:migrate

# 4. キューを作成（初回のみ）
npx wrangler queues create ouroboros-gui-events
npx wrangler queues create ouroboros-dlq

# 5. secret を設定
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put OPENAI_API_KEY     # 他プロバイダでも可

# 6. ビルド（build:css）→ デプロイ
npm run deploy
```

- `npm run deploy` は `npm run build && wrangler deploy`。Tailwind CSS は
  `public/assets/tailwind.css` にコピーされ、static assets として配信されます
  （Worker を経由しません）。
- **Workers Builds** を使う場合は Deploy command を `npm run deploy` に設定してください。
  wrangler 設定内の `[build] command` は Workers Builds が無視するため書いていません。
- マイグレーションは `wrangler d1 migrations apply` が単独で適用します。
  `runMigrations()`（TS ミラー）は Node 起動時だけ実行され、Cloudflare パスでは
  呼ばれません（`0013` の `ALTER TABLE` は非冪等で二重適用すると失敗します）。

### AI モデル

モデル ID は `provider/model`。`openai/*`・`anthropic/*`・`xai/*`・
`openrouter/*` を用い、OpenRouter 経由は `openrouter/openai/gpt-6-luna` のように
二重に付けます。

`/models` で用途ごとに 3 つ選択します（システム全体で共有）。

| 役割 | 既定 | 用途 |
| --- | --- | --- |
| Efficiency | `openai/gpt-6-luna` | 容易なタスク。inspection / healing / refactor もここ |
| Performance | `openai/gpt-6-sol` | コード生成で判定が「難しい」だったとき |
| Embed | `openai/text-embedding-3-small` | コード検索の埋め込み |

モデル一覧は各プロバイダの `GET /models` を live 取得（60 分 TTL キャッシュ）し、
キー未設定のプロバイダは候補に出ません。Anthropic は embedding 非対応なので
`embedModel` には設定できません。

### 難易度判定（Decisions API / ローカル Laya）

コード生成の前に判定モデルが実装難易度（1〜5）とティアを決め、`solThreshold`
以上なら Performance、未満なら Efficiency を使います。判定先は `/models` の
「難易度判定」カードで切り替えます。

| backend | 接続先 | 制約 |
| --- | --- | --- |
| `remote`（既定） | OpenAI Decisions API（`POST /v1/decisions`、モデルは `gpt-6-luna` のみ・限定プレビュー）または OpenRouter Decisions（`POST /api/alpha/decisions`、`openrouter/typesafe/jev-1.13`） | `anthropic/*`・`xai/*` は decisions 非対応 |
| `local` | ローカル laya-serve（`POST {url}/v1/systemone`、Jev 互換） | 既定 `http://127.0.0.1:8000`、モデルは `typed-decisions` |

ローカル Laya のセットアップ:

```bash
pip install "laya[serve]"
LAYA_DEVICE=cpu laya-serve          # 既定で http://127.0.0.1:8000
```

GUI で「難易度判定」カードのバックエンドを **ローカル Laya** に切り替え、
「接続テスト」を押します（questions 無しで POST し、400 が返れば生存）。

障害時は **remote → Efficiency フォールバック** の順に逃げます。関連ファイル選択
にも Laya を使うかは `localFileSelection` で切り替えられます（`false` なら従来の
テキストモデル経路）。

---

## 主な機能

- **自己修復ループ** — スキャン → AI による解析・グルーピング → AI 修正＋検証 →
  PR 作成 → エスカレーション Issue（自動修正不可のグループのみ）。
- **認証とマルチテナント** — メール/パスワード（WebCrypto PBKDF2）、httpOnly セッション、
  スコープ付きで失効可能な **API トークン**（`read` / `inspect` / `heal` / `admin`）。
- **登録制御** — 公開登録の管理者トグル。最初に登録したユーザーが管理者になります。
- **テレメトリ** — 構造化ログは stdout / Workers Logs。プロンプトキャッシュのヒット量も heal 履歴に表示。
- **非同期オーケストレーション** — GUI イベントは非同期キューで処理
  （Node: インメモリ逐次キュー、Cloudflare: CF Queues）。
  失敗時は指数バックオフで 3 回リトライし、その後はログ出力。未処理はプロセス停止で
  失われますが、`healing_runs.status` / `code_sessions.status` で再実行できます。
- **レート制限** — 固定窗口のインメモリリミッタ。
- **コードインスペクション** — AI スコアリングエンジンを `POST /api/v1/inspect` で提供。
  6 次元（セキュリティ / パフォーマンス / 冗長性 / 可読性 / 設計 / 正確性）の重み付きスコアを、
  ファイル単位または関数・メソッド・クラス単位（`granularity: "function"`）で算出し、
  低スコアのユニットをヒューリスティックに選別した改修候補（`refactorCandidates`）を優先度付きで返します。
- **モデル階層の自動選択** — コード生成前に判定モデルが実装難易度を判定し、
  閾値以上で Performance、未満で Efficiency を使います。判定結果はセッションに記録されます。
- **コードセッション** — リポジトリ・ブランチ・指示を指定して AI にコード生成を依頼。
  生成されたパッチは自動的に PR として適用されます。
- **リファクタリング提案** — インスペクション結果から AI が具体的な改善提案を生成し、
  優先度付きで管理します。
- **AI 使用量分析** — DB に保存した使用量を `/api/v1/metrics` で集計。
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
| GET     | `/api/v1/config`             | セッション/トークン |
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
| POST    | `/api/v1/settings/decision-test` | admin         |

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
- `/tokens` — API トークン管理
- `/settings` — 個人設定（AI モデル選択）
- `/models` — システム共有モデルと難易度判定バックエンド
- `/admin` — 管理者設定（登録トグル、ユーザー管理）

---

## 開発・テスト

```bash
npm run typecheck                      # TypeScript 型チェック
npm run test                           # vitest ユニットテスト（src/__tests__/）
npm run build:css                      # Tailwind をビルド + public/assets にコピー
npm run dev                            # build:css + tsx src/server.ts
npm start                              # tsx src/server.ts
npx wrangler deploy --dry-run --outdir dist   # Cloudflare ビルド検証（認証不要）
npm run deploy                         # Cloudflare へデプロイ
npm run d1:migrate                     # D1 マイグレーション適用（--remote）
```

CI は `test`（typecheck + vitest）と `deploy-dry-run`
（`wrangler deploy --dry-run` で Cloudflare バンドルの回帰検証）の 2 ジョブです。
dry-run は認証不要なので Cloudflare シークレットは不要です。

---

## リスクと注意点

- `node:sqlite` は Stability 1.2（Release candidate）。`DbAdapter` 配下に閉じているので差し替えは容易です。
- Docker では SQLite を別コンテナの rqlite で動かせます（`OURO_DB=rqlite`）。
  rqlite は単一ノードでも Raft ログを伴うため、書き込みは in-process SQLite より
  遅くなります（自己修復のボトルネックにはなりません）。
- rqlite の `db` サービスは再起動時にホスト名（=コンテナ ID）が変わるため、
  `NODE_ID` と adv-addr を compose 側で固定しています。未固定だと選挙が止まり
  `/db/execute` が 503（leader 無し）を返し続けます。
- Cloudflare の healing は **Queue consumer 内で直列実行**するため、1 invocation が
  10〜15 分の CPU 制限に収まる必要があります（Workflows は使いません）。
- Cloudflare の RateLimiter は **isolate 単位の近似**です（Workers Rate Limiting API は未使用）。
- Cloudflare パスでは `runMigrations()` を呼びません。`0013` の `ALTER TABLE` は
  非冪等で、wrangler 適用後に二重実行すると失敗します。
- `wrangler.toml` の `database_id` は secret 相当としてコミットしません。
  デプロイ前に `scripts/resolve-d1.sh` で解決してください。
- Anthropic / xAI は Decisions API 非対応です。判定モデルは `openai/*` か `openrouter/*` のみ。
- Anthropic は embedding 非対応です。
- 判定結果の `score` は level index 0 起点の確率重み平均なので、全バックエンドで +1 正規化しています。
- Laya は >20 選択の `choice` が弱点です。ファイル選択は `noul` のバッチ判定で回避しています。
- `/v1/systemone/batch` は laya-serve 0.3.22+ が必要です。古い version では 404 → フォールバック。
- インメモリキューはプロセス再起動で未実行イベントを失います（Cloudflare は CF Queues が保持）。
- ローカル DLQ は存在しません（Cloudflare は `ouroboros-dlq` を使用）。
- キーは `.env` / Worker secret のみ運用のため GUI からのキー追加は不可です。キー変更は再起動が必要です。

---

## スコープ外

- Workflows によるオーケストレーション（Queue consumer 内の直列実行で代替）
- Workers Rate Limiting API（固定窗口インメモリで近似）
- D1 データの移行（新規スキーマから構築）
- マルチプロセス / 水平スケール
- モデル料金の静的カタログ（live 取得に集約）

---

## ライセンス

Apache-2.0 — [LICENSE](./LICENSE) を参照してください。
