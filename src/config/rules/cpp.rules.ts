import { Framework } from "../../types";

export interface CppRule {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  frameworks: Framework[];
  pattern: RegExp;
  message: string;
  fix: string;
}

export const CPP_RULES: CppRule[] = [
  // 共通
  {
    id: "cpp/banned-functions",
    title: "禁止された C 標準関数の使用",
    severity: "critical",
    frameworks: [],
    pattern: /\b(?:gets|strcpy|sprintf|scanf|strcat)\s*\(/,
    message: "バッファオーバーフローの原因となる禁止関数を使用しています: gets, strcpy, sprintf, scanf, strcat",
    fix: "安全な代替関数を使用してください: fgets, strncpy/strlcpy, snprintf, scanf_s, strncat/strlcat",
  },
  {
    id: "cpp/raw-pointer",
    title: "生ポインタ (new/delete) の使用",
    severity: "high",
    frameworks: [],
    pattern: /\bnew\s+\w+|\bdelete\s+(?:(?:\[\])\s*)?\w+/,
    message: "生ポインタと手動メモリ管理を使用しています。メモリリークや二重解放の原因になります。",
    fix: "std::unique_ptr や std::shared_ptr などのスマートポインタを使用してください。",
  },
  {
    id: "cpp/unchecked-cast",
    title: "C スタイルキャストの使用",
    severity: "medium",
    frameworks: [],
    pattern: /\(\s*[A-Z][a-zA-Z_*]+\s*\)\s*\w/,
    message: "C スタイルキャスト (Type)expr を使用しています。型安全性が失われます。",
    fix: "static_cast<T>(), dynamic_cast<T>(), reinterpret_cast<T>() を使用してください。",
  },
  {
    id: "cpp/no-const",
    title: "const を付けられるメンバー関数への const 欠落",
    severity: "low",
    frameworks: [],
    pattern: /\w+\s+\w+\s*\([^)]*\)\s*(?!const)\s*(?:override|final)?\s*\{[^}]*return\s+\w+_/,
    message: "状態を変更しないメンバー関数に const が付いていません。",
    fix: "状態を変更しないメンバー関数には const 修飾子を付けてください。",
  },
  // Qt 固有
  {
    id: "qt/parent-ownership",
    title: "QObject の parent 設定漏れ（Qt）",
    severity: "medium",
    frameworks: ["qt"],
    pattern: /new\s+Q[A-Z]\w+\s*\(\s*\)/,
    message: "QObject を parent なしで作成しています。メモリリークの原因になります。",
    fix: "QObject のコンストラクタに parent を渡してください。例: new QLabel(this)",
  },
  {
    id: "qt/direct-delete",
    title: "Qt オブジェクトの delete 直接呼び出し（Qt）",
    severity: "medium",
    frameworks: ["qt"],
    pattern: /delete\s+(?:ui\s*->\s*\w+|\w+Widget|\w+Label|\w+Button)/,
    message: "Qt オブジェクトを直接 delete しています。親オブジェクトがある場合に二重解放になります。",
    fix: "Qt の親子メカニズムに任せるか、deleteLater() を使用してください。",
  },
];

export function getCppRules(framework?: Framework): CppRule[] {
  return CPP_RULES.filter(
    (r) => r.frameworks.length === 0 || (framework !== undefined && r.frameworks.includes(framework))
  );
}
