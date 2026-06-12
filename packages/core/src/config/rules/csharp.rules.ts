import { Framework } from "../../types";

export interface CSharpRule {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  frameworks: Framework[];
  pattern: RegExp;
  message: string;
  fix: string;
}

export const CSHARP_RULES: CSharpRule[] = [
  // ASP.NET Core 固有
  {
    id: "aspnet/missing-https-redirect",
    title: "UseHttpsRedirection() 未設定（ASP.NET Core）",
    severity: "high",
    frameworks: ["aspnet-core"],
    pattern: /app\.Use(?!HttpsRedirection)/,
    message: "UseHttpsRedirection() が設定されていません。HTTP アクセスが HTTPS にリダイレクトされません。",
    fix: "app.UseHttpsRedirection() を Startup.Configure または WebApplication.Use の先頭に追加してください。",
  },
  {
    id: "aspnet/missing-hsts",
    title: "UseHsts() 未設定（ASP.NET Core）",
    severity: "high",
    frameworks: ["aspnet-core"],
    pattern: /app\.Use(?!Hsts)/,
    message: "UseHsts() が設定されていません。HTTP Strict Transport Security が有効になりません。",
    fix: "本番環境で app.UseHsts() を追加して HSTS ヘッダーを送信してください。",
  },
  {
    id: "aspnet/sql-injection",
    title: "FromSql へのユーザー入力直接渡し（ASP.NET Core）",
    severity: "critical",
    frameworks: ["aspnet-core"],
    pattern: /FromSql(?:Raw|Interpolated)?\s*\(\s*\$?["'`][^"'`]*\{/,
    message: "FromSql にユーザー入力が直接渡されています。SQL インジェクションの原因になります。",
    fix: "パラメータ化クエリ（FromSqlInterpolated または FormattableString）を使用してください。",
  },
  {
    id: "aspnet/cors-allow-all",
    title: "AllowAnyOrigin() の本番使用（ASP.NET Core）",
    severity: "high",
    frameworks: ["aspnet-core", "blazor"],
    pattern: /AllowAnyOrigin\s*\(\s*\)/,
    message: "CORS で全オリジンを許可しています。本番環境では危険です。",
    fix: "WithOrigins() に許可するオリジンのリストを明示的に指定してください。",
  },
  {
    id: "aspnet/result-blocking",
    title: ".Result / .Wait() によるブロッキング（ASP.NET Core）",
    severity: "high",
    frameworks: ["aspnet-core", "blazor"],
    pattern: /\.Result\b|\.Wait\s*\(\s*\)/,
    message: ".Result または .Wait() で非同期操作をブロックしています。デッドロックの原因になります。",
    fix: "await を使用して非同期に待機してください。",
  },
  // Blazor 固有
  {
    id: "blazor/markup-string",
    title: "MarkupString へのユーザー入力（Blazor）",
    severity: "critical",
    frameworks: ["blazor"],
    pattern: /new\s+MarkupString\s*\([^)]*userInput|@\(\(MarkupString\)[^)]*userInput/,
    message: "MarkupString にユーザー入力が渡されています。XSS の原因になります。",
    fix: "ユーザー入力を HtmlEncoder.Default.Encode() でエスケープしてから MarkupString に渡してください。",
  },
];

export function getCSharpRules(framework?: Framework): CSharpRule[] {
  return CSHARP_RULES.filter(
    (r) => r.frameworks.length === 0 || (framework !== undefined && r.frameworks.includes(framework))
  );
}
