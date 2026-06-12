# Ouroboros API リファレンス（日本語）

Ouroboros の HTTP API の日本語リファレンスです。機械可読な OpenAPI 仕様は
`GET /api/v1/openapi.json` から取得できます。

- **ベースパス:** `/api/v1`（`/api` は後方互換エイリアス）
- **コンテンツタイプ:** `application/json`
- **配信元:** セルフホスト（Node サーバー）/ Cloudflare Worker のどちらでも同一

---

## 認証

2 通りの認証方式に対応します。

1. **セッション Cookie** — `POST /api/v1/auth/login` または `register` で `ouro_session`
   （httpOnly）Cookie が発行されます。ブラウザ（GUI）からのリクエストはこれを自動送信します。
   セッションから解決された場合は **admin 相当の全権**として扱われます。
2. **API トークン** — `Authorization: Bearer ouro_<トークン>` ヘッダで送信します。
   トークンには**スコープ**が紐づき、付与された権限のみ実行できます。

### スコープ

| スコープ  | 用途                                   |
| -------- | ------------------------------------- |
| `read`   | 参照系（一覧・取得・メトリクス等）        |
| `inspect`| `POST /inspect`（コードインスペクション）|
| `heal`   | `POST /healing`（自己修復サイクル起動）  |
| `admin`  | 全スコープを包含                         |

トークンの作成・失効は `/api/v1/tokens` で行います。生成時の `secret` は**一度だけ**返却され、
DB には SHA-256 ハッシュのみ保存されます。

---

## エラー形式

すべてのエラーは次の統一エンベロープで返されます。

```json
{ "error": { "code": "validation_failed", "message": "request body is invalid", "details": ["..."] } }
```

| HTTP | code 例              | 説明                          |
| ---- | ------------------- | ----------------------------- |
| 400  | `validation_failed` / `invalid_json` | リクエストボディ不正 |
| 401  | `unauthorized`       | 未認証                         |
| 403  | `forbidden`          | スコープ/権限不足              |
| 404  | `not_found`          | リソースなし                   |
| 429  | `rate_limited`       | レート制限超過（エッジの認証系） |
| 500  | `internal_error`     | サーバー内部エラー              |
| 502  | `inspection_failed`  | AI 呼び出し失敗                |

---

## メタ

### `GET /health`
ヘルスチェック。認証不要。
```json
{ "ok": true, "db": "sqlite" }
```

### `GET /version`
`deployTarget` は `"local"`（セルフホスト Node）または `"cloudflare"`（Worker）。
```json
{ "name": "ouroboros", "version": "2.0.0", "apiVersion": "v1", "deployTarget": "local" }
```

### `GET /openapi.json`
OpenAPI 3.1 仕様（JSON）。認証不要。

---

## 認証エンドポイント

### `GET /auth/registration`
公開登録が有効かを返す。認証不要。
```json
{ "enabled": true }
```

### `POST /auth/register`
ユーザー登録。**最初のユーザーは自動的に admin** になり、以降の公開登録は既定で無効化されます。
レート制限あり。
```json
// リクエスト
{ "email": "user@example.com", "password": "8文字以上" }
// 201 レスポンス（Set-Cookie: ouro_session）
{ "user": { "id": "...", "email": "user@example.com", "role": "admin" } }
```

### `POST /auth/login`
ログイン。成功すると `ouro_session` Cookie を発行。レート制限あり。
```json
{ "email": "user@example.com", "password": "..." }
```

### `POST /auth/logout`
セッションを破棄。

### `GET /auth/me`
現在のユーザー情報。要認証。

---

## API トークン

### `GET /tokens`
自分のトークン一覧（ハッシュは含まれません）。要認証。

### `POST /tokens`
トークン作成。要認証。`secret` は**この応答でのみ**返却されます。
```json
// リクエスト
{ "name": "ci-pipeline", "scopes": ["read", "heal"], "expiresInDays": 90 }
// 201 レスポンス
{ "secret": "ouro_xxxx…", "prefix": "ouro_xxxxxxxx", "id": "..." }
```

### `DELETE /tokens/:id`
トークンを失効。要認証。

---

## アプリ設定（config）

git 連携・AI プロバイダ・対象言語などのアプリ全体設定。

### `GET /config`
要認証。**秘匿値**（`gitToken` / `anthropicToken` / `openaiToken` / `geminiToken` /
`openrouterToken`）はマスク（`••••` + 末尾4文字）されて返ります。

### `PUT /config`
要 **admin**。秘匿値フィールドが空文字またはマスク済みプレースホルダ（`••••…`）の場合、
既存の保存値が**保持**されます（誤上書き防止）。
```json
{ "gitService": "github", "gitPackage": "owner/repo",
  "selectedLanguages": ["TypeScript"], "anthropicToken": "sk-ant-…" }
```

> **Cloudflare デプロイの制約:** `deployTarget` が `cloudflare` の場合、外部 AI
> ゲートウェイのトークン（`anthropicToken` / `openaiToken` / `geminiToken` /
> `openrouterToken`）や `workers-ai` 以外の `selectedAiService` を送ると
> `400 external_gateway_rejected` で拒否されます。`selectedModelValue` は
> Workers AI のモデル id（`@cf/...` 等）であり、かつアカウントで検出された
> モデルに含まれている必要があります（`400 unknown_model`）。

---

## AI モデル検出（models）

### `GET /models`
要認証。デプロイターゲットに応じて利用可能なモデルを検出します。

- `cloudflare`: Workers AI バインディング（`env.AI.models()`）が扱う**すべての**モデル
- `local`: `.env`（または GUI で保存したトークン）で設定された Anthropic ゲートウェイのモデル

```json
{
  "deployTarget": "cloudflare",
  "provider": "workers-ai",
  "models": [
    { "value": "@cf/meta/llama-3.1-8b-instruct", "label": "meta/llama-3.1-8b-instruct",
      "provider": "workers-ai", "task": "Text Generation", "description": "…" }
  ]
}
```

---

## 設定（settings）

スコアの重み・グレード閾値・スキャンスケジュール・通知設定・公開登録トグル。

### `GET /settings`
要認証。`weights` / `gradeThresholds` / `schedule` / `notifications` / `registrationEnabled` を返す。

### `PUT /settings`
要 **admin**。部分更新可。`registrationEnabled` を含めると公開登録の有効/無効を切り替えます。
```json
{ "weights": { "security": 25, "performance": 20, "redundancy": 15,
  "readability": 15, "design": 15, "correctness": 10 }, "registrationEnabled": true }
```

---

## インスペクション

### `POST /inspect`
コードインスペクションを実行。スコープ `inspect` が必要。
評価は 6 次元（`security` / `performance` / `redundancy` / `readability` / `design` / `correctness`）の
重み付きスコアで行われます。`options.granularity: "function"` を指定すると、ファイル単位に加えて
関数・メソッド・クラス単位のスコアカードが `files[].functions` に出力されます。
```json
{ "language": "typescript",
  "files": [{ "path": "src/index.ts", "content": "…" }],
  "projectContext": "（任意）",
  "options": { "granularity": "function" } }
```
レスポンスは `scoreCard`（`overall` / `grade` / `breakdown`）・`findings`・`recommendations` に加え、
低スコアのユニットをヒューリスティックに選別・優先度付けした `refactorCandidates`
（`priority` / `priorityScore` / `weakestDimensions` / `rationale` 付き、緊急度の高い順）を含みます。
結果はテナント（ユーザー）単位で保存されます。

### `GET /inspect/:id`
保存済みインスペクション結果を取得。要認証（自分のもののみ）。

### `GET /history`
インスペクション履歴（古い順）。スコア内訳付き。要認証。
```json
[{ "id": "…", "date": "2026-05-29", "overall": 80, "security": 82, "performance": 78 }]
```

---

## Webhook

### `GET /webhooks`
自分の Webhook 一覧。要認証。

### `POST /webhooks`
Webhook 作成。要認証。
```json
{ "url": "https://hooks.example.com/x", "type": "slack", "config": { } }
```

### `PATCH /webhooks/:id`
有効/無効の切り替え。要認証。
```json
{ "enabled": false }
```

### `DELETE /webhooks/:id`
削除。要認証。

### `POST /webhooks/:id/test`
テストペイロードを送信。要認証。**SSRF ガード**により loopback / プライベート / リンクローカル
アドレスへの送信は拒否されます。
```json
{ "success": true, "statusCode": 200 }
```

---

## 自己修復（healing）

### `POST /healing`
自己修復サイクルを起動。スコープ `heal` が必要。`dryRun` で PR を作らず差分のみ。
```json
// リクエスト
{ "dryRun": true }
// 202 レスポンス
{ "runId": "…" }
```
セルフホストではインラインで（バックグラウンド）実行、Cloudflare では Workflow インスタンスとして実行されます。

### `GET /healing`
直近の自己修復ラン一覧。要認証。

---

## ログ（管理者）

### `GET /logs`
ログファイル名の一覧。要 **admin**。

### `GET /logs/:file`
ログ内容（直近最大 200KB）をプレーンテキストで返す。要 **admin**。

---

## メトリクス

### `GET /metrics`
ダッシュボード用の集計。要認証。
```json
{ "inspectionCount": 12, "latestOverall": 80, "avgOverall": 74,
  "riskScore": 20, "healingRuns": 3, "lastRun": { }, "history": [ ] }
```

---

## レート制限

Cloudflare デプロイでは、認証系エンドポイント（`/auth/*`）に Workers Rate Limiting API による
スロットリングが適用されます（既定: 60 秒あたり 100 リクエスト / IP）。超過時は `429 rate_limited`。
セルフホストでは既定で無効（no-op）です。
