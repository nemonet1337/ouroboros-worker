import type { AiProvider } from "../ports/ai";
import type { HarnessTrace, Patch } from "../types";
import type { AssembledContext } from "./context.assembler";
import { buildCodeGenPrompt } from "./prompt.templates";
import { parseGeneratedPatches } from "./parse.patches";
import { verifyPatches } from "./verifier";

const DEFAULT_MAX_REPAIR = 1;
const MAX_TOKENS = 8192;

export async function runHarness(opts: {
  instruction: string;
  plan?: string;
  model: string;
  ai: AiProvider;
  assembled: AssembledContext;
  maxRepair?: number;
}): Promise<{ patches: Patch[]; model: string; error?: string; trace: HarnessTrace }> {
  const maxRepair = opts.maxRepair ?? DEFAULT_MAX_REPAIR;
  const instruction = opts.plan
    ? `${opts.instruction}\n\n## 実装計画\n${opts.plan}`
    : opts.instruction;

  let lastErrors: string[] = [];
  let lastWarnings: string[] = [];
  let patches: Patch[] = [];
  let parseError: string | undefined;
  let repairAttempts = 0;

  for (let attempt = 0; attempt <= maxRepair; attempt++) {
    if (attempt > 0) repairAttempts = attempt;
    const { system, user } = buildCodeGenPrompt({
      instruction,
      repoStructure: opts.assembled.repoMap,
      fileContext: Object.fromEntries(opts.assembled.files.map((f) => [f.path, f.content])),
      snippets: opts.assembled.snippets,
      repairErrors: attempt > 0 ? lastErrors : undefined,
    });
    const raw = await opts.ai.complete({
      model: opts.model,
      system,
      prompt: user,
      maxTokens: MAX_TOKENS,
    });
    const parsed = parseGeneratedPatches(raw);
    patches = parsed.patches;
    parseError = parsed.error;
    if (patches.length === 0) {
      lastErrors = [parseError ?? "生成されたパッチが空でした。"];
      lastWarnings = [];
      continue;
    }
    const verified = verifyPatches(patches, opts.assembled.files, opts.assembled.repoMap);
    lastErrors = verified.errors;
    lastWarnings = verified.warnings;
    if (verified.ok) break;
  }

  const trace: HarnessTrace = {
    selectedPaths: opts.assembled.selectedPaths,
    source: opts.assembled.source,
    snippetCount: opts.assembled.snippets.length,
    verifyErrors: lastErrors,
    verifyWarnings: lastWarnings,
    repairAttempts,
  };

  if (patches.length === 0) {
    return { patches: [], model: opts.model, error: lastErrors[0] ?? parseError, trace };
  }
  return { patches, model: opts.model, error: undefined, trace };
}
