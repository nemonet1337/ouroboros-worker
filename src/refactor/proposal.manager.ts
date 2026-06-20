import type { AiProvider } from "../ports/ai";
import type { DbAdapter } from "../ports/db";
import type { VcsProvider } from "../ports/vcs";
import type { CodeRunner } from "../ports/runner";
import type { Patch } from "../types";

export class ProposalManager {
  constructor(
    private readonly ai: AiProvider,
    private readonly db: DbAdapter,
    private readonly vcs: VcsProvider
  ) {}

  async generateProposal(inspectionId: string, userId: string): Promise<void> {
    const rows = (await this.db.query<{ id: string; user_id: string; result: string }>(
      `SELECT * FROM inspections WHERE id = ? AND user_id = ?`,
      [inspectionId, userId]
    )) as { id: string; user_id: string; result: string }[];
    if (!rows.length) throw new Error("inspection not found");

    const result = JSON.parse(rows[0].result);
    const prompt = `Summarise findings as refactor proposal. Return JSON: {summary, priority}.`;
    const summary = await this.ai.complete({
      system: "You are a refactoring assistant.",
      prompt,
      maxTokens: 500,
    });

    await this.db.exec(
      `INSERT INTO code_sessions (id, user_id, repo_url, branch, base_branch, title, instruction, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), userId, "", "main", "main", "Refactor Proposal", summary, "generating", Date.now(), Date.now()]
    );
  }

  async applyProposal(inspectionId: string, userId: string, runner: CodeRunner): Promise<{ prNumber: number; prUrl: string }> {
    return { prNumber: 0, prUrl: "" };
  }

  async dismissProposal(inspectionId: string, userId: string): Promise<void> {
    // No-op: marks inspection as dismissed in status column
    await this.db.exec(`UPDATE inspections SET status = ? WHERE id = ? AND user_id = ?`, ["dismissed", inspectionId, userId]);
  }
}