import { Framework } from "../../types";

export interface JavaRule {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  frameworks: Framework[];
  pattern: RegExp;
  message: string;
  fix: string;
}

export const JAVA_RULES: JavaRule[] = [
  // 共通
  {
    id: "java/null-return",
    title: "null を直接返すメソッド",
    severity: "medium",
    frameworks: [],
    pattern: /return\s+null\s*;/,
    message: "null を直接返しています。NullPointerException の原因になります。",
    fix: "Optional<T> を戻り値型として使用し、Optional.empty() を返してください。",
  },
  {
    id: "java/system-exit",
    title: "本番コードへの System.exit() 混入",
    severity: "high",
    frameworks: [],
    pattern: /System\.exit\s*\(/,
    message: "System.exit() を本番コードで使用しています。JVM 全体が終了します。",
    fix: "System.exit() の代わりに例外をスローするか、適切なエラーハンドリングを実装してください。",
  },
  // Spring Boot 固有
  {
    id: "spring/csrf-disabled",
    title: "CSRF 保護の無効化（Spring Boot）",
    severity: "critical",
    frameworks: ["spring-boot"],
    pattern: /\.csrf\s*\(\s*\)\s*\.disable\s*\(\s*\)/,
    message: "CSRF 保護が無効化されています。CSRF 攻撃に脆弱です。",
    fix: "CSRF 保護を有効にするか、API のみのエンドポイントには適切な JWT 認証を設定してください。",
  },
  {
    id: "spring/actuator-exposed",
    title: "Actuator エンドポイントの全公開（Spring Boot）",
    severity: "high",
    frameworks: ["spring-boot"],
    pattern: /management\.endpoints\.web\.exposure\.include\s*=\s*\*/,
    message: "全 Actuator エンドポイントが公開されています。機密情報が漏洩する可能性があります。",
    fix: "必要なエンドポイントのみを公開し、認証を要求するよう設定してください。",
  },
  {
    id: "spring/sql-injection",
    title: "JPQL クエリへの文字列連結（Spring Boot）",
    severity: "critical",
    frameworks: ["spring-boot"],
    pattern: /@Query\s*\(\s*["'`][^"'`]*\+/,
    message: "@Query アノテーションでユーザー入力を文字列連結しています。SQL インジェクションの危険があります。",
    fix: "SpEL パラメータ (:param) または JPQL ネームドパラメータを使用してください。",
  },
  {
    id: "spring/field-injection",
    title: "フィールドインジェクションの使用（Spring Boot）",
    severity: "medium",
    frameworks: ["spring-boot"],
    pattern: /@Autowired\s*\n\s*(?:private|protected)/,
    message: "@Autowired をフィールドに使用しています。テスタビリティが低下します。",
    fix: "コンストラクタインジェクションを使用してください。final フィールドとコンストラクタで注入できます。",
  },
  {
    id: "spring/debug-mode",
    title: "デバッグモードが有効（Spring Boot）",
    severity: "high",
    frameworks: ["spring-boot"],
    pattern: /debug\s*=\s*true/,
    message: "Spring Boot のデバッグモードが有効です。本番環境では機密情報が漏洩する可能性があります。",
    fix: "本番環境の application.properties では debug=false を設定してください。",
  },
  // Quarkus 固有
  {
    id: "quarkus/dev-services-production",
    title: "Dev Services が本番で有効（Quarkus）",
    severity: "high",
    frameworks: ["quarkus"],
    pattern: /quarkus\.devservices\.enabled\s*=\s*true/,
    message: "Quarkus Dev Services が本番プロファイルで有効になっています。",
    fix: "%prod.quarkus.devservices.enabled=false を application.properties に追加してください。",
  },
  // Jakarta EE 固有
  {
    id: "jakarta/session-fixation",
    title: "セッション固定化攻撃（Jakarta EE）",
    severity: "critical",
    frameworks: ["jakarta-ee"],
    pattern: /request\.getSession\s*\(\s*\)(?!.*invalidate)/,
    message: "ログイン後にセッションを再生成していません。セッション固定化攻撃に脆弱です。",
    fix: "ログイン成功後に session.invalidate() を呼び出し、新しいセッションを取得してください。",
  },
];

export function getJavaRules(framework?: Framework): JavaRule[] {
  return JAVA_RULES.filter(
    (r) => r.frameworks.length === 0 || (framework !== undefined && r.frameworks.includes(framework))
  );
}
