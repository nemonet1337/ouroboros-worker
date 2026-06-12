import { Framework } from "../../types";

export interface GoRule {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  frameworks: Framework[];
  pattern: RegExp;
  message: string;
  fix: string;
}

export const GO_RULES: GoRule[] = [
  {
    id: "go/sql-injection",
    title: "SQL インジェクション（fmt.Sprintf によるクエリ組み立て）",
    severity: "critical",
    frameworks: [],
    pattern: /fmt\.Sprintf\s*\(\s*["'`][^"'`]*\b(SELECT|INSERT|UPDATE|DELETE|WHERE)\b/i,
    message: "fmt.Sprintf を使って SQL クエリを組み立てています。ユーザー入力が混入するとSQLインジェクションが発生します。",
    fix: "プレースホルダ（?）とパラメータバインドを使用してください。例: db.Query(\"SELECT ... WHERE id = ?\", id)",
  },
  {
    id: "go/command-injection",
    title: "コマンドインジェクション（exec.Command へのユーザー入力）",
    severity: "critical",
    frameworks: [],
    pattern: /exec\.Command\s*\([^)]*\+/,
    message: "ユーザー入力が exec.Command に渡されています。コマンドインジェクションが発生する可能性があります。",
    fix: "exec.Command の引数はリテラルのみ使用し、ユーザー入力は個別の引数として渡してください。",
  },
  {
    id: "go/unhandled-error",
    title: "エラー戻り値の無視",
    severity: "medium",
    frameworks: [],
    pattern: /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\([^)]*\)\s*$/m,
    message: "関数のエラー戻り値が無視されています。",
    fix: "戻り値を変数で受け取り、エラーを適切に処理してください。例: result, err := func(); if err != nil { ... }",
  },
  {
    id: "go/goroutine-leak",
    title: "ゴルーチンリーク（context なしの goroutine 起動）",
    severity: "high",
    frameworks: [],
    pattern: /go\s+func\s*\(\s*\)\s*\{[^}]*\}\s*\(\s*\)/,
    message: "context なしで goroutine を起動しています。キャンセル不能なゴルーチンリークの原因になります。",
    fix: "context.Context を goroutine に渡し、Done チャンネルを監視してキャンセルを実装してください。",
  },
  {
    id: "go/time-format",
    title: "不正な time.Format 参照時刻",
    severity: "low",
    frameworks: [],
    pattern: /time\.Format\s*\(\s*["'`](?!01\/02\/2006|2006-01-02|15:04:05|Mon Jan 2)/,
    message: "Go の time.Format は参照時刻 (Mon Jan 2 15:04:05 MST 2006) を使用します。他の言語のフォーマット文字列は動作しません。",
    fix: "Go の参照時刻を使ったフォーマット文字列に修正してください。例: \"2006-01-02 15:04:05\"",
  },
  {
    id: "go/http-client-no-timeout",
    title: "HTTP クライアントのタイムアウト未設定",
    severity: "high",
    frameworks: [],
    pattern: /http\.Client\s*\{\s*\}/,
    message: "http.Client にタイムアウトが設定されていません。外部サービスのハングによりサーバーが応答不能になる可能性があります。",
    fix: "Timeout フィールドを設定してください。例: &http.Client{Timeout: 30 * time.Second}",
  },
  {
    id: "go/http-listen-no-tls",
    title: "本番環境での TLS なし HTTP サーバー",
    severity: "high",
    frameworks: [],
    pattern: /http\.ListenAndServe\s*\(/,
    message: "TLS なしの http.ListenAndServe を使用しています。本番環境では通信が暗号化されません。",
    fix: "本番環境では http.ListenAndServeTLS を使用するか、リバースプロキシで TLS 終端してください。",
  },
  // Gin 固有
  {
    id: "gin/missing-cors",
    title: "CORS ミドルウェア未設定（Gin）",
    severity: "medium",
    frameworks: ["gin"],
    pattern: /gin\.Default\(\)|gin\.New\(\)/,
    message: "Gin ルーターに CORS ミドルウェアが設定されていません。",
    fix: "github.com/gin-contrib/cors を使用して CORS を適切に設定してください。",
  },
  {
    id: "gin/bind-without-validate",
    title: "ShouldBind 後のバリデーション欠如（Gin）",
    severity: "high",
    frameworks: ["gin"],
    pattern: /ShouldBind(?:JSON|XML|Query|Form)?\s*\(&[^)]+\)\s*(?!.*Validate)/s,
    message: "ShouldBind でバインドした後にバリデーションを行っていません。",
    fix: "binding タグを構造体フィールドに付与するか、validator パッケージを使って手動バリデーションを実行してください。",
  },
  {
    id: "gin/unsafe-html-render",
    title: "HTML の直接レンダリング（Gin）",
    severity: "high",
    frameworks: ["gin"],
    pattern: /c\.Data\s*\(.*text\/html/,
    message: "HTML を直接レンダリングしています。XSS の原因になる可能性があります。",
    fix: "c.HTML() でテンプレートエンジンを使用するか、レンダリング前にエスケープ処理を行ってください。",
  },
  // Echo 固有
  {
    id: "echo/missing-security-middleware",
    title: "Secure ミドルウェア未設定（Echo）",
    severity: "medium",
    frameworks: ["echo"],
    pattern: /echo\.New\s*\(\s*\)/,
    message: "Echo に Secure() ミドルウェアが設定されていません。",
    fix: "e.Use(middleware.Secure()) を追加してセキュリティヘッダーを設定してください。",
  },
  {
    id: "echo/param-not-validated",
    title: "パスパラメータのバリデーション欠如（Echo）",
    severity: "high",
    frameworks: ["echo"],
    pattern: /c\.Param\s*\([^)]+\)(?!.*Validate)/,
    message: "パスパラメータをバリデーションなしで使用しています。",
    fix: "パスパラメータを使用する前に型チェックとバリデーションを行ってください。",
  },
  // Fiber 固有
  {
    id: "fiber/body-parser-no-validate",
    title: "BodyParser 後のバリデーション欠如（Fiber）",
    severity: "high",
    frameworks: ["fiber"],
    pattern: /BodyParser\s*\(&[^)]+\)\s*(?!.*Validate)/s,
    message: "BodyParser でパースした後にバリデーションを行っていません。",
    fix: "github.com/go-playground/validator を使ってパース後にバリデーションを実行してください。",
  },
  {
    id: "fiber/cors-allow-all",
    title: "CORS ワイルドカード許可（Fiber）",
    severity: "high",
    frameworks: ["fiber"],
    pattern: /AllowOrigins\s*:\s*["'`]\*["'`]/,
    message: "CORS で全オリジン (*) を許可しています。本番環境では危険です。",
    fix: "AllowOrigins に許可するオリジンのリストを明示的に指定してください。",
  },
];

export function getGoRules(framework?: Framework): GoRule[] {
  return GO_RULES.filter(
    (r) => r.frameworks.length === 0 || (framework !== undefined && r.frameworks.includes(framework))
  );
}
