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
  security: [{ sessionCookie: [] }],
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
    "/config": {
      get: { summary: "アプリ設定の取得（秘匿値はマスク）", responses: { "200": { description: "OK" } } },
      put: { summary: "アプリ設定の保存（admin）", responses: { "200": { description: "OK" } } },
    },
    "/settings": {
      get: { summary: "設定の取得（weights/thresholds/schedule/registration）", responses: { "200": { description: "OK" } } },
      put: { summary: "設定の保存（admin）", responses: { "200": { description: "OK" } } },
    },
    "/models": {
      get: {
        summary: "Workers AI のテキスト生成 / Embedding モデル一覧（料金含む）",
        responses: { "200": { description: "OK" }, "502": { description: "検出失敗" } },
      },
    },
    "/settings/models": {
      get: { summary: "選択中のテキスト生成・Embedding モデル", responses: { "200": { description: "OK" } } },
      put: { summary: "モデル設定の保存（Embedding は admin）", responses: { "200": { description: "OK" }, "403": { description: "Embedding は admin のみ" } } },
    },
    "/inspect": {
      post: { summary: "コードインスペクション実行（scope: inspect）", responses: { "200": { description: "OK" }, "502": { description: "AI 失敗" } } },
    },
    "/inspect/{id}": { get: { summary: "インスペクション結果取得", responses: { "200": { description: "OK" }, "404": { description: "なし" } } } },
    "/history": { get: { summary: "インスペクション履歴（スコア内訳付き）", responses: { "200": { description: "OK" } } } },
    "/metrics": { get: { summary: "ダッシュボード指標", responses: { "200": { description: "OK" } } } },
    "/healing": {
      get: { summary: "自己修復ラン一覧", responses: { "200": { description: "OK" } } },
      post: {
        summary: "解析フェーズ起動（autoFix=true で修復まで連続実行）",
        responses: { "202": { description: "Accepted" }, "400": { description: "Rejected" } },
      },
    },
    "/healing/{runId}/fix": {
      post: {
        summary: "解析済みランの修復フェーズ起動",
        responses: { "202": { description: "Accepted" }, "400": { description: "Rejected" } },
      },
    },
    "/healing/{runId}/cancel": {
      post: { summary: "進行中ランのキャンセル", responses: { "200": { description: "OK" }, "400": { description: "Rejected" } } },
    },
    "/logs": { get: { summary: "ログファイル一覧（admin）", responses: { "200": { description: "OK" } } } },
    "/logs/{file}": { get: { summary: "ログ内容（admin）", responses: { "200": { description: "OK" } } } },
  },
} as const;
