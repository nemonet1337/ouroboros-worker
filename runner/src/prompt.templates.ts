export interface BuildCodeGenPromptOptions {
  instruction: string;
  fileContext?: Record<string, string>;
  repoStructure?: string[];
}

export function buildCodeGenPrompt(opts: BuildCodeGenPromptOptions): { system: string; user: string } {
  const { instruction, fileContext, repoStructure } = opts;

  const system = `You are an expert code assistant. The user will give you a codebase structure and a change instruction.
Propose the minimal set of changes as JSON Patch array.
Each patch must include: file (path), originalContent, fixedContent, diff, explanation.
Return only valid JSON.`;

  const user = `## Instruction
${instruction}

## Repository structure
${(repoStructure ?? []).join("\n") || "(no structure provided)"}

## File context
${fileContext
  ? Object.entries(fileContext)
      .map(([path, content]) => `### ${path}\n\`\`\`\n${content.slice(0, 4000)}\n\`\`\``)
      .join("\n")
  : "(no file context provided)"}

Constraints:
- One patch per file.
- Keep changes minimal and focused.
- Use unified diff format in diff.
- Response must be a JSON object with key patches: Patch[].`;

  return { system, user };
}
