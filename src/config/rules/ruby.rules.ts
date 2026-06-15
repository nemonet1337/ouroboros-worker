import { Framework } from "../../types";

export interface RubyRule {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  frameworks: Framework[];
  pattern: RegExp;
  message: string;
  fix: string;
}

export const RUBY_RULES: RubyRule[] = [
  // Rails 固有
  {
    id: "rails/permit-all",
    title: "params.permit! の使用（Rails）",
    severity: "critical",
    frameworks: ["rails"],
    pattern: /params\.permit!/,
    message: "params.permit! は全パラメータを許可します。マスアサインメント脆弱性の原因になります。",
    fix: "params.require(:model).permit(:field1, :field2) のように許可するフィールドを明示してください。",
  },
  {
    id: "rails/sql-injection",
    title: "where() での文字列補間（Rails）",
    severity: "critical",
    frameworks: ["rails"],
    pattern: /where\s*\(\s*["'`][^"'`]*#\{/,
    message: "ActiveRecord の where() で文字列補間を使っています。SQL インジェクションの原因になります。",
    fix: "プレースホルダを使用してください。例: where('name = ?', params[:name])",
  },
  {
    id: "rails/csrf-protection-off",
    title: "CSRF 保護の無効化（Rails）",
    severity: "critical",
    frameworks: ["rails"],
    pattern: /protect_from_forgery\s+with\s*:\s*:null_session|skip_before_action\s+:verify_authenticity_token/,
    message: "CSRF 保護が無効化されています。",
    fix: "protect_from_forgery with: :exception を使用し、API エンドポイントには JWT 認証を実装してください。",
  },
  {
    id: "rails/command-injection",
    title: "ユーザー入力のコマンド実行（Rails）",
    severity: "critical",
    frameworks: ["rails"],
    pattern: /`[^`]*#\{|system\s*\([^)]*params\[|%x\{[^}]*params\[/,
    message: "ユーザー入力をシェルコマンドに渡しています。コマンドインジェクションの原因になります。",
    fix: "シェルコマンドの使用を避けるか、Open3.capture2e などで引数を個別に渡してください。",
  },
  {
    id: "rails/marshal-load",
    title: "Marshal.load の使用（Rails）",
    severity: "critical",
    frameworks: ["rails"],
    pattern: /Marshal\.load\s*\(/,
    message: "Marshal.load は信頼できないデータに対して任意コード実行の脆弱性があります。",
    fix: "JSON.parse や MessagePack など安全なシリアライズ形式を使用してください。",
  },
  {
    id: "rails/n-plus-one",
    title: "N+1 クエリ問題（Rails）",
    severity: "medium",
    frameworks: ["rails"],
    pattern: /\.each\s*(?:do|\{)[^}]*\.[a-z_]+\.(find|where|all|first|last)\b/,
    message: "ループ内で ActiveRecord クエリを実行しています。N+1 クエリ問題が発生します。",
    fix: "includes() または eager_load() を使って関連オブジェクトを事前ロードしてください。",
  },
  // Sinatra 固有
  {
    id: "sinatra/missing-csrf",
    title: "CSRF 保護未設定（Sinatra）",
    severity: "high",
    frameworks: ["sinatra"],
    pattern: /require\s+["'`]sinatra["'`](?![\s\S]*rack\/protection)/,
    message: "Sinatra アプリに CSRF 保護が設定されていません。",
    fix: "rack-protection gem を使用して CSRF 保護を有効にしてください。",
  },
];

export function getRubyRules(framework?: Framework): RubyRule[] {
  return RUBY_RULES.filter(
    (r) => r.frameworks.length === 0 || (framework !== undefined && r.frameworks.includes(framework))
  );
}
