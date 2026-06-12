import { Framework } from "../../types";

export interface TypeScriptRule {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  frameworks: Framework[];
  pattern: RegExp;
  message: string;
  fix: string;
}

export const TYPESCRIPT_RULES: TypeScriptRule[] = [
  // 共通
  {
    id: "ts/any-type",
    title: "any 型の使用",
    severity: "medium",
    frameworks: [],
    pattern: /:\s*any\b|as\s+any\b/,
    message: "any 型を使用しています。型安全性が失われます。",
    fix: "具体的な型または unknown 型を使用してください。",
  },
  {
    id: "ts/non-null-assertion",
    title: "非 null アサーション演算子の多用",
    severity: "medium",
    frameworks: [],
    pattern: /\w+!\./,
    message: "非 null アサーション (!) を使用しています。実行時エラーの原因になる可能性があります。",
    fix: "Optional chaining (?.) や null チェックを使用してください。",
  },
  {
    id: "ts/console-log-production",
    title: "本番コードへの console.log 混入",
    severity: "low",
    frameworks: [],
    pattern: /console\.(log|debug|info)\s*\(/,
    message: "console.log が本番コードに残っています。",
    fix: "適切なロガーライブラリ（winston, pino など）を使用してください。",
  },
  // React 固有
  {
    id: "react/dangerous-set-inner-html",
    title: "dangerouslySetInnerHTML の使用（React）",
    severity: "high",
    frameworks: ["react", "nextjs", "remix", "astro"],
    pattern: /dangerouslySetInnerHTML/,
    message: "dangerouslySetInnerHTML を使用しています。XSS の原因になる可能性があります。",
    fix: "DOMPurify などのサニタイズライブラリでコンテンツを処理してから使用してください。",
  },
  {
    id: "react/missing-key-prop",
    title: "リスト要素の key prop 欠落（React）",
    severity: "medium",
    frameworks: ["react", "nextjs", "remix"],
    pattern: /\.map\s*\([^)]*\)\s*=>\s*(?!.*key=)/,
    message: "map() で生成するリスト要素に key prop が設定されていません。",
    fix: "各要素にユニークな key prop を設定してください。例: key={item.id}",
  },
  {
    id: "react/hooks-exhaustive-deps",
    title: "useEffect の依存配列が不完全（React）",
    severity: "medium",
    frameworks: ["react", "nextjs", "remix"],
    pattern: /useEffect\s*\([^,]+,\s*\[\s*\]\s*\)/,
    message: "useEffect の依存配列が空です。必要な依存値が欠落している可能性があります。",
    fix: "eslint-plugin-react-hooks の exhaustive-deps ルールに従って依存配列を補完してください。",
  },
  // Next.js 固有
  {
    id: "nextjs/missing-security-headers",
    title: "セキュリティヘッダー未設定（Next.js）",
    severity: "high",
    frameworks: ["nextjs"],
    pattern: /next\.config\.(js|ts)/,
    message: "next.config.js にセキュリティヘッダーが設定されていません。",
    fix: "headers() 関数で X-Frame-Options, X-Content-Type-Options, CSP などを設定してください。",
  },
  {
    id: "nextjs/api-no-auth",
    title: "API Route に認証チェックなし（Next.js）",
    severity: "critical",
    frameworks: ["nextjs"],
    pattern: /export\s+(?:default\s+)?(?:async\s+)?function\s+handler\s*\([^)]*req[^)]*\)/,
    message: "API Route に認証チェックが見当たりません。",
    fix: "リクエストハンドラの先頭でセッションまたはトークンの検証を行ってください。",
  },
  // Express / NestJS 固有
  {
    id: "express/missing-helmet",
    title: "helmet ミドルウェア未使用（Express）",
    severity: "high",
    frameworks: ["express", "nestjs"],
    pattern: /express\s*\(\s*\)/,
    message: "helmet ミドルウェアが設定されていません。セキュリティヘッダーが欠落します。",
    fix: "app.use(helmet()) を追加してセキュリティヘッダーを設定してください。",
  },
  {
    id: "express/missing-rate-limit",
    title: "レート制限未設定（Express）",
    severity: "high",
    frameworks: ["express", "nestjs", "fastify"],
    pattern: /app\.(get|post|put|delete|patch)\s*\(\s*["'`]/,
    message: "ルートにレート制限が設定されていません。DoS 攻撃に脆弱です。",
    fix: "express-rate-limit や @fastify/rate-limit を使ってレート制限を設定してください。",
  },
  {
    id: "nestjs/missing-validation-pipe",
    title: "ValidationPipe グローバル未設定（NestJS）",
    severity: "high",
    frameworks: ["nestjs"],
    pattern: /NestFactory\.create\s*\(/,
    message: "ValidationPipe がグローバルに設定されていません。入力バリデーションが機能しません。",
    fix: "app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) を設定してください。",
  },
];

export function getTypeScriptRules(framework?: Framework): TypeScriptRule[] {
  return TYPESCRIPT_RULES.filter(
    (r) => r.frameworks.length === 0 || (framework !== undefined && r.frameworks.includes(framework))
  );
}
