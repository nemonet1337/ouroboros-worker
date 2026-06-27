import type { AiProvider } from "../ports/ai";
import type { DbAdapter } from "../ports/db";
import type { VcsProvider } from "../ports/vcs";
import type { CodeRunner } from "../ports/runner";

export class ProposalManager {
  constructor(
    private readonly ai: AiProvider,
    private readonly db: DbAdapter,
    private readonly vcs: VcsProvider,
    private readonly repoUrl: string = ""
  ) {}

  async generateProposal(inspectionId: string, userId: string): Promise<void> {
    const rows = (await this.db.query<{ id: string; user_id: string; result: string }>(
      `SELECT * FROM inspections WHERE id = ? AND user_id = ?`,
      [inspectionId, userId]
    )) as { id: string; user_id: string; result: string }[];
    if (!rows.length) throw new Error("inspection not found");

    const inspectionResult = rows[0].result;
    const prompt = `Based on the following inspection result, summarise the findings as a refactor proposal.
Return ONLY a valid JSON object matching this schema:
{
  "summary": "a description of the proposed refactoring",
  "priority": "low" | "medium" | "high"
}

Inspection Result:
${inspectionResult}`;

    const aiRes = await this.ai.complete({
      system: "You are a refactoring assistant. You generate structured summaries of inspection findings.",
      prompt,
      maxTokens: 500,
    });

    let summary = "Refactor code";
    let priority = "medium";
    try {
      const parsed = JSON.parse(aiRes.trim());
      if (parsed.summary) summary = parsed.summary;
      if (parsed.priority) priority = parsed.priority;
    } catch {
      summary = aiRes.trim() || summary;
    }

    const resultData = JSON.parse(inspectionResult);
    resultData.proposal = { summary, priority };

    await this.db.exec(
      `UPDATE inspections SET status = ?, result = ? WHERE id = ? AND user_id = ?`,
      ["proposed", JSON.stringify(resultData), inspectionId, userId]
    );
  }

  async applyProposal(inspectionId: string, userId: string, runner: CodeRunner): Promise<{ prNumber: number; prUrl: string }> {
    const rows = (await this.db.query<{ id: string; user_id: string; status: string; result: string }>(
      `SELECT * FROM inspections WHERE id = ? AND user_id = ?`,
      [inspectionId, userId]
    )) as { id: string; user_id: string; status: string; result: string }[];
    if (!rows.length) throw new Error("inspection not found");

    const row = rows[0];
    const resultData = JSON.parse(row.result);
    const instruction = resultData.proposal?.summary || "Refactor code based on inspection findings";

    await runner.init({
      repoUrl: this.repoUrl || "https://github.com/example/repo",
      branch: "main",
      sessionId: inspectionId,
    });

    const { patches } = await runner.generate({
      instruction,
      sessionId: inspectionId,
    });

    const branch = `refactor/${inspectionId.slice(0, 8)}`;
    for (const patch of patches) {
      await runner.write({
        sessionId: inspectionId,
        files: [{ path: patch.file, content: patch.fixedContent }],
      });
    }

    const commitResult = await runner.commit({
      sessionId: inspectionId,
      message: `Refactor Proposal: ${instruction.slice(0, 70)}`,
    });

    if (!commitResult.success) {
      throw new Error("failed to commit refactoring changes");
    }

    const pushResult = await runner.push({
      sessionId: inspectionId,
      branch,
    });

    if (!pushResult.success) {
      throw new Error("failed to push refactor branch");
    }

    const pr = await this.vcs.createPR({
      branch,
      baseBranch: "main",
      title: `Refactor Proposal: ${instruction.slice(0, 50)}`,
      body: `## Refactor Proposal\n\n${instruction}\n\nGenerated refactoring applied automatically.`,
    });

    resultData.pr = { number: pr.number, url: pr.url };

    await this.db.exec(
      `UPDATE inspections SET status = ?, result = ? WHERE id = ? AND user_id = ?`,
      ["applied", JSON.stringify(resultData), inspectionId, userId]
    );

    return { prNumber: pr.number, prUrl: pr.url };
  }

  async dismissProposal(inspectionId: string, userId: string): Promise<void> {
    await this.db.exec(
      `UPDATE inspections SET status = ? WHERE id = ? AND user_id = ?`,
      ["dismissed", inspectionId, userId]
    );
  }
}