import type { FindingGroup, Patch } from "../types";

export function buildPRTitle(group: FindingGroup): string {
  return `fix(self-healing): ${group.fixStrategy.title}`;
}

export function buildPRBody(patches: Patch[], group: FindingGroup, iterations: number): string {
  const findingsSample = group.findings
    .slice(0, 5)
    .map((f, i) => `${i + 1}. \`${JSON.stringify(f).slice(0, 200)}\``)
    .join("\n");

  const patchList = patches.map((p) => `- **${p.file}**: ${p.explanation}`).join("\n");

  return `## 🩹 Self-Healing 自動修正レポート

### 修正戦略
**${group.fixStrategy.title}**

**修正手順:**
${group.fixStrategy.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

**根拠:** ${group.fixStrategy.rationale}

---

### 修正されたファイル
${patchList || "なし"}

---

### 検出された問題（先頭5件）
${findingsSample}

---

### メタ情報
- Priority: \`${group.priority}\`
- Estimated Risk: ${group.estimatedRisk}
- Iterations: ${iterations}

> ⚠️ このPRは自動生成されました。マージ前に必ず内容を確認してください。`;
}
