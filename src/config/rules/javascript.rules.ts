import { Framework } from "../../types";

export interface JavaScriptRule {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  frameworks: Framework[];
  pattern: RegExp;
  message: string;
  fix: string;
}

export const JAVASCRIPT_RULES: JavaScriptRule[] = [
  {
    id: "js/var-usage",
    title: "var の使用",
    severity: "low",
    frameworks: [],
    pattern: /\bvar\s+/,
    message: "var を使用しています。スコープの問題が発生する可能性があります。",
    fix: "var の代わりに const または let を使用してください。",
  },
  {
    id: "js/eval-usage",
    title: "eval() の使用",
    severity: "critical",
    frameworks: [],
    pattern: /\beval\s*\(/,
    message: "eval() を使用しています。コードインジェクションの原因になります。",
    fix: "eval() の使用を避けてください。JSON.parse() や Function コンストラクタで代替できる場合があります。",
  },
  {
    id: "js/document-write",
    title: "document.write() の使用",
    severity: "high",
    frameworks: [],
    pattern: /document\.write\s*\(/,
    message: "document.write() を使用しています。XSS の原因になり、パフォーマンスにも悪影響があります。",
    fix: "DOM API（createElement, appendChild など）や innerHTML にサニタイズ済みコンテンツを設定してください。",
  },
  {
    id: "js/inner-html",
    title: "innerHTML への直接代入",
    severity: "high",
    frameworks: [],
    pattern: /\.innerHTML\s*=/,
    message: "innerHTML にユーザー入力が直接代入されています。XSS の原因になります。",
    fix: "DOMPurify などでサニタイズするか、textContent を使用してください。",
  },
  {
    id: "js/console-log-production",
    title: "本番コードへの console.log 混入",
    severity: "low",
    frameworks: [],
    pattern: /console\.(log|debug|info)\s*\(/,
    message: "console.log が本番コードに残っています。",
    fix: "適切なロガーライブラリを使用してください。",
  },
  // Vue 固有
  {
    id: "vue/v-html-directive",
    title: "v-html ディレクティブの使用（Vue）",
    severity: "high",
    frameworks: ["vue", "nuxtjs"],
    pattern: /v-html\s*=/,
    message: "v-html ディレクティブを使用しています。XSS の原因になります。",
    fix: "DOMPurify でサニタイズしてから v-html を使用するか、テンプレート構文に置き換えてください。",
  },
  {
    id: "express/missing-helmet",
    title: "helmet ミドルウェア未使用（Express）",
    severity: "high",
    frameworks: ["express"],
    pattern: /(?:const|let|var)\s+app\s*=\s*express\s*\(\s*\)/,
    message: "helmet ミドルウェアが設定されていません。",
    fix: "app.use(require('helmet')()) を追加してセキュリティヘッダーを設定してください。",
  },
  {
    id: "express/missing-rate-limit",
    title: "レート制限未設定（Express）",
    severity: "high",
    frameworks: ["express"],
    pattern: /app\.(get|post|put|delete|patch)\s*\(\s*["'`]/,
    message: "ルートにレート制限が設定されていません。",
    fix: "express-rate-limit を使ってレート制限を設定してください。",
  },
];

export function getJavaScriptRules(framework?: Framework): JavaScriptRule[] {
  return JAVASCRIPT_RULES.filter(
    (r) => r.frameworks.length === 0 || (framework !== undefined && r.frameworks.includes(framework))
  );
}
