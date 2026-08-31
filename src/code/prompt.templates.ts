import type { CodeSnippet } from "../vectorize/code.indexer";

export interface BuildCodeGenPromptOptions {
  instruction: string;
  fileContext?: Record<string, string>;
  repoStructure?: string[];
  snippets?: CodeSnippet[];
  repairErrors?: string[];
}

const REPO_MAP_LIMIT = 200;

export function buildCodeGenPrompt(opts: BuildCodeGenPromptOptions): { system: string; user: string } {
  const { instruction, fileContext, repoStructure, snippets, repairErrors } = opts;

  const system = `You are an expert code assistant. The user will give you a codebase structure and a change instruction.
Propose the minimal set of changes as JSON Patch array.
Each patch must include: file (path), originalContent, fixedContent, diff, explanation.
originalContent MUST be copied verbatim from File context for existing files (empty string for new files).
Return only valid JSON.`;

  const structure = repoStructure ?? [];
  const structureBlock =
    structure.length === 0
      ? "(no structure provided)"
      : structure.length > REPO_MAP_LIMIT
        ? `${structure.slice(0, REPO_MAP_LIMIT).join("\n")}\n… (${structure.length} files total)`
        : structure.join("\n");

  const snippetBlock =
    snippets && snippets.length > 0
      ? snippets
          .map(
            (s) =>
              `### ${s.file}:${s.startLine}-${s.endLine}${s.symbol ? ` (${s.symbol})` : ""}\n\`\`\`\n${s.text}\n\`\`\``
          )
          .join("\n")
      : "(none)";

  const fileBlock = fileContext
    ? Object.entries(fileContext)
        .map(([path, content]) => `### ${path}\n\`\`\`\n${content}\n\`\`\``)
        .join("\n")
    : "(no file context provided)";

  const repairBlock =
    repairErrors && repairErrors.length > 0
      ? `\n## Previous attempt failed verification\n${repairErrors.map((e) => `- ${e}`).join("\n")}\nFix these issues and return a complete patches JSON.\n`
      : "";

  const user = `## Instruction
${instruction}

## Repository structure
${structureBlock}

## Retrieved snippets
${snippetBlock}

## File context
${fileBlock}
${repairBlock}
Constraints:
- One patch per file.
- Keep changes minimal and focused.
- Copy originalContent exactly from File context.
- Use unified diff format in diff.
- Response must be a JSON object with key patches: Patch[].`;

  return { system, user };
}
