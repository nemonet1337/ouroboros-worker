import type { Patch } from "../types";

export interface VerifyResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const DANGEROUS_PATH =
  /(^|\/)\.env($|\.)|(^|\/)id_rsa($|\.)|(^|\/)credentials\.json$|\.pem$/i;

export function verifyPatches(
  patches: Patch[],
  files: Array<{ path: string; content: string }>,
  repoMap: string[] = []
): VerifyResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const byPath = new Map(files.map((f) => [f.path, f.content]));
  const known = new Set([...byPath.keys(), ...repoMap]);

  if (patches.length === 0) {
    return { ok: false, errors: ["patches が空です"], warnings };
  }

  for (const patch of patches) {
    if (!patch?.file) {
      errors.push("file が無いパッチがあります");
      continue;
    }
    if (DANGEROUS_PATH.test(patch.file)) {
      errors.push(`${patch.file}: 秘密情報パスは変更できません`);
      continue;
    }
    if (typeof patch.fixedContent !== "string") {
      errors.push(`${patch.file}: fixedContent がありません`);
      continue;
    }

    const existing = byPath.get(patch.file);
    const isNew = existing === undefined && !known.has(patch.file);
    if (isNew) {
      if (patch.originalContent && patch.originalContent.length > 0) {
        warnings.push(`${patch.file}: 新規ファイルなのに originalContent があります`);
      }
    } else if (existing !== undefined) {
      const original = patch.originalContent ?? "";
      if (original !== existing) {
        errors.push(`${patch.file}: originalContent が実ファイルと一致しません`);
      }
      if (patch.fixedContent === existing) {
        errors.push(`${patch.file}: 変更がありません`);
      }
    }

    if (!isBalanced(patch.fixedContent)) {
      errors.push(`${patch.file}: 括弧の対応が取れていません`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function verifyFix(fixedContent: string, wholeFile?: string): VerifyResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!fixedContent.trim()) {
    errors.push("置換結果が空です");
  }
  if (!isBalanced(fixedContent)) {
    errors.push("置換結果の括弧の対応が取れていません");
  }
  if (wholeFile !== undefined && !isBalanced(wholeFile)) {
    errors.push("置換後ファイルの括弧の対応が取れていません");
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function isBalanced(text: string): boolean {
  const stack: string[] = [];
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  let inStr: string | null = null;
  let escape = false;
  for (const ch of text) {
    if (inStr) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inStr = ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      stack.push(ch);
    } else if (ch === ")" || ch === "]" || ch === "}") {
      const open = stack.pop();
      if (!open || pairs[open] !== ch) return false;
    }
  }
  return stack.length === 0;
}
