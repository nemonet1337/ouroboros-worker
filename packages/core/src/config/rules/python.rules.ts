import { Framework } from "../../types";

export interface PythonRule {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  frameworks: Framework[];
  pattern: RegExp;
  message: string;
  fix: string;
}

export const PYTHON_RULES: PythonRule[] = [
  // 共通
  {
    id: "python/pickle-usage",
    title: "pickle.loads() の使用",
    severity: "critical",
    frameworks: [],
    pattern: /pickle\.loads?\s*\(/,
    message: "pickle.loads() は任意コード実行の脆弱性があります。信頼できないデータには使用しないでください。",
    fix: "JSON や MessagePack など安全なシリアライズ形式を使用してください。",
  },
  {
    id: "python/shell-true",
    title: "subprocess の shell=True 使用",
    severity: "critical",
    frameworks: [],
    pattern: /subprocess\.(?:run|Popen|call|check_output)\s*\([^)]*shell\s*=\s*True/,
    message: "shell=True でサブプロセスを実行しています。コマンドインジェクションの原因になります。",
    fix: "shell=False（デフォルト）を使用し、コマンドをリストで渡してください。",
  },
  {
    id: "python/hardcoded-secret",
    title: "ハードコードされたシークレット",
    severity: "critical",
    frameworks: [],
    pattern: /(?:password|secret|api_key|token)\s*=\s*["'][^"']{8,}["']/i,
    message: "シークレット値がソースコードにハードコードされています。",
    fix: "環境変数または Secret Manager からシークレットを読み込んでください。",
  },
  // Django 固有
  {
    id: "django/debug-true",
    title: "DEBUG=True の本番設定（Django）",
    severity: "high",
    frameworks: ["django"],
    pattern: /DEBUG\s*=\s*True/,
    message: "Django の DEBUG が True に設定されています。本番環境ではスタックトレースが漏洩します。",
    fix: "本番環境では DEBUG = False を設定し、環境変数から読み込んでください。",
  },
  {
    id: "django/secret-key-exposed",
    title: "SECRET_KEY のハードコード（Django）",
    severity: "critical",
    frameworks: ["django"],
    pattern: /SECRET_KEY\s*=\s*["'][^"']{20,}["']/,
    message: "Django の SECRET_KEY がソースコードにハードコードされています。",
    fix: "SECRET_KEY を環境変数から読み込んでください。例: os.environ['DJANGO_SECRET_KEY']",
  },
  {
    id: "django/csrf-exempt",
    title: "@csrf_exempt デコレータの使用（Django）",
    severity: "high",
    frameworks: ["django"],
    pattern: /@csrf_exempt/,
    message: "@csrf_exempt で CSRF 保護を無効化しています。",
    fix: "CSRF トークンを適切に処理するか、API エンドポイントには JWT 認証を使用してください。",
  },
  {
    id: "django/raw-sql",
    title: "raw() / extra() へのユーザー入力混入（Django）",
    severity: "critical",
    frameworks: ["django"],
    pattern: /\.(?:raw|extra)\s*\([^)]*%[s|d]|\.(?:raw|extra)\s*\([^)]*format\s*\(/,
    message: "Django ORM の raw() または extra() にユーザー入力が直接渡されています。SQL インジェクションの危険があります。",
    fix: "パラメータとして渡すか、Django ORM のクエリビルダを使用してください。",
  },
  // FastAPI 固有
  {
    id: "fastapi/cors-allow-all",
    title: "CORS ワイルドカード許可（FastAPI）",
    severity: "high",
    frameworks: ["fastapi"],
    pattern: /allow_origins\s*=\s*\[["'`]\*["'`]\]/,
    message: "FastAPI の CORS で全オリジン (*) を許可しています。",
    fix: "allow_origins に許可するオリジンのリストを明示的に指定してください。",
  },
  {
    id: "fastapi/missing-auth",
    title: "認証デコレータなしの重要エンドポイント（FastAPI）",
    severity: "high",
    frameworks: ["fastapi"],
    pattern: /@(?:app|router)\.(post|put|delete|patch)\s*\([^)]*\)\s*\n(?!.*Depends.*current_user)/,
    message: "変更系エンドポイントに認証依存関係が設定されていません。",
    fix: "Depends(get_current_user) などの認証依存関係をエンドポイントに追加してください。",
  },
  // Flask 固有
  {
    id: "flask/csrf-missing",
    title: "CSRF 保護未設定（Flask）",
    severity: "high",
    frameworks: ["flask"],
    pattern: /Flask\s*\(\s*__name__\s*\)(?![\s\S]*CSRFProtect)/,
    message: "Flask アプリに CSRF 保護が設定されていません。",
    fix: "Flask-WTF の CSRFProtect を使用してください。例: CSRFProtect(app)",
  },
  {
    id: "flask/debug-mode",
    title: "app.run(debug=True) の本番使用（Flask）",
    severity: "high",
    frameworks: ["flask"],
    pattern: /app\.run\s*\([^)]*debug\s*=\s*True/,
    message: "Flask のデバッグモードが有効です。本番環境では使用しないでください。",
    fix: "本番環境では WSGI サーバー（Gunicorn, uWSGI）を使用し、debug=False にしてください。",
  },
  {
    id: "flask/render-template-string",
    title: "ユーザー入力の直接レンダリング（Flask）",
    severity: "critical",
    frameworks: ["flask"],
    pattern: /render_template_string\s*\([^)]*request\./,
    message: "ユーザーリクエストの内容を render_template_string に渡しています。SSTI（サーバーサイドテンプレートインジェクション）の原因になります。",
    fix: "render_template_string にユーザー入力を渡さず、固定のテンプレート文字列のみを使用してください。",
  },
];

export function getPythonRules(framework?: Framework): PythonRule[] {
  return PYTHON_RULES.filter(
    (r) => r.frameworks.length === 0 || (framework !== undefined && r.frameworks.includes(framework))
  );
}
