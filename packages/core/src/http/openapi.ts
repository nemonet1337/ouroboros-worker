// Canonical OpenAPI 3.1 description of the Ouroboros API, served live at
// GET /api/v1/openapi.json. Kept intentionally compact; docs/api.ja.md is the
// human-readable Japanese reference.

export const OPENAPI_SPEC = {
  openapi: "3.1.0",
  info: {
    title: "Ouroboros API",
    version: "1.0.0",
    description: "自己修復型 CI/CD システム Ouroboros の HTTP API (v1)。",
  },
  servers: [{ url: "/api/v1" }],
  components: {
    securitySchemes: {
      sessionCookie: { type: "apiKey", in: "cookie", name: "ouro_session" },
      bearerToken: { type: "http", scheme: "bearer", bearerFormat: "ouro_<token>" },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              details: { type: "array", items: { type: "string" } },
            },
            required: ["code", "message"],
          },
        },
      },
      Credentials: {
        type: "object",
        required: ["email", "password"],
        properties: { email: { type: "string", format: "email" }, password: { type: "string", minLength: 8 } },
      },
    },
  },
  security: [{ sessionCookie: [] }, { bearerToken: [] }],
  paths: {
    "/health": { get: { summary: "ヘルスチェック", security: [], responses: { "200": { description: "OK" } } } },
    "/version": { get: { summary: "バージョン情報", security: [], responses: { "200": { description: "OK" } } } },
    "/openapi.json": { get: { summary: "OpenAPI 仕様", security: [], responses: { "200": { description: "OpenAPI document" } } } },
    "/auth/registration": { get: { summary: "登録可否の確認", security: [], responses: { "200": { description: "OK" } } } },
    "/auth/register": {
      post: {
        summary: "ユーザー登録（初回ユーザーは admin）", security: [],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Credentials" } } } },
        responses: { "201": { description: "Created" }, "403": { description: "登録無効" }, "409": { description: "重複" } },
      },
    },
    "/auth/login": {
      post: {
        summary: "ログイン（セッション Cookie 発行）", security: [],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Credentials" } } } },
        responses: { "200": { description: "OK" }, "401": { description: "認証失敗" } },
      },
    },
    "/auth/logout": { post: { summary: "ログアウト", responses: { "200": { description: "OK" } } } },
    "/auth/me": { get: { summary: "現在のユーザー", responses: { "200": { description: "OK" }, "401": { description: "未認証" } } } },
    "/tokens": {
      get: { summary: "API トークン一覧", responses: { "200": { description: "OK" } } },
      post: { summary: "API トークン作成（secret は一度だけ返却）", responses: { "201": { description: "Created" } } },
    },
    "/tokens/{id}": { delete: { summary: "API トークン失効", responses: { "200": { description: "OK" } } } },
    "/config": {
      get: { summary: "アプリ設定の取得（秘匿値はマスク）", responses: { "200": { description: "OK" } } },
      put: { summary: "アプリ設定の保存（admin）", responses: { "200": { description: "OK" } } },
    },
    "/settings": {
      get: { summary: "設定の取得（weights/thresholds/schedule/notifications/registration）", responses: { "200": { description: "OK" } } },
      put: { summary: "設定の保存（admin）", responses: { "200": { description: "OK" } } },
    },
    "/models": {
      get: {
        summary: "利用可能な AI モデルの検出（cloudflare: Workers AI 全モデル / local: .env ゲートウェイのモデル）",
        responses: { "200": { description: "OK" }, "502": { description: "検出失敗" } },
      },
    },
    "/inspect": {
      post: { summary: "コードインスペクション実行（scope: inspect）", responses: { "200": { description: "OK" }, "502": { description: "AI 失敗" } } },
    },
    "/inspect/{id}": { get: { summary: "インスペクション結果取得", responses: { "200": { description: "OK" }, "404": { description: "なし" } } } },
    "/history": { get: { summary: "インスペクション履歴（スコア内訳付き）", responses: { "200": { description: "OK" } } } },
    "/metrics": { get: { summary: "ダッシュボード指標", responses: { "200": { description: "OK" } } } },
    "/webhooks": {
      get: { summary: "Webhook 一覧", responses: { "200": { description: "OK" } } },
      post: { summary: "Webhook 作成", responses: { "201": { description: "Created" } } },
    },
    "/webhooks/{id}": {
      patch: { summary: "Webhook 有効/無効", responses: { "200": { description: "OK" } } },
      delete: { summary: "Webhook 削除", responses: { "200": { description: "OK" } } },
    },
    "/webhooks/{id}/test": { post: { summary: "Webhook テスト送信", responses: { "200": { description: "OK" } } } },
    "/healing": {
      get: { summary: "自己修復ラン一覧", responses: { "200": { description: "OK" } } },
      post: { summary: "自己修復サイクル起動（scope: heal）", responses: { "202": { description: "Accepted" } } },
    },
    "/logs": { get: { summary: "ログファイル一覧（admin）", responses: { "200": { description: "OK" } } } },
    "/logs/{file}": { get: { summary: "ログ内容（admin）", responses: { "200": { description: "OK" } } } },
  },
} as const;
