import type { DbAdapter } from "../ports/db";
import type { CodeRunner, CodeInitOptions } from "../ports/runner";
import type { CodeSessionStatus, CodeSessionRow, Patch } from "../types";
import type { VcsProvider } from "../ports/vcs";
import type { AiProvider } from "../ports/ai";

export interface CreateSessionOpts {
  userId: string;
  repoUrl: string;
  branch: string;
  baseBranch: string;
  title: string;
  instruction: string;
}

const PLAN_SYSTEM = `You are a senior software engineer. Given a coding task instruction,
produce a short numbered implementation plan (max 8 steps, Japanese).
Output ONLY the plan steps, no preamble.`;

export class CodeSessionManager {
  constructor(
    private readonly db: DbAdapter,
    private readonly runner: CodeRunner,
    private readonly ai?: AiProvider
  ) {}

  async create(opts: CreateSessionOpts): Promise<string> {
    const id = crypto.randomUUID();
    const now = Date.now();
    const row: CodeSessionRow = {
      id,
      user_id: opts.userId,
      repo_url: opts.repoUrl,
      branch: opts.branch,
      base_branch: opts.baseBranch,
      title: opts.title,
      instruction: opts.instruction,
      status: "initializing",
      generated_patches: null,
      applied_branch: null,
      pr_number: null,
      pr_url: null,
      created_at: now,
      updated_at: now,
    };

    await this.db.exec(
      `INSERT INTO code_sessions
         (id, user_id, repo_url, branch, base_branch, title, instruction, status,
          generated_patches, applied_branch, pr_number, pr_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.user_id,
        row.repo_url,
        row.branch,
        row.base_branch,
        row.title,
        row.instruction,
        row.status,
        row.generated_patches,
        row.applied_branch,
        row.pr_number,
        row.pr_url,
        row.created_at,
        row.updated_at,
      ]
    );

    await this.runner.init({
      repoUrl: opts.repoUrl,
      branch: opts.branch,
      sessionId: id,
    });

    await this.updateStatus(id, row.user_id, "ready");
    return id;
  }

  async get(id: string, userId: string): Promise<CodeSessionRow | undefined> {
    const rows = (await this.db.query<CodeSessionRow>(
      `SELECT * FROM code_sessions WHERE id = ? AND user_id = ?`,
      [id, userId]
    )) as CodeSessionRow[];
    return rows[0];
  }

  async list(userId: string): Promise<CodeSessionRow[]> {
    return (this.db.query<CodeSessionRow>(
      `SELECT * FROM code_sessions WHERE user_id = ? ORDER BY created_at DESC`,
      [userId]
    )) as Promise<CodeSessionRow[]>;
  }

  async generate(
    id: string,
    userId: string,
    opts: { model?: string; planModel?: string } = {}
  ): Promise<void> {
    const row = await this.get(id, userId);
    if (!row) throw new Error("code session not found");

    if (row.status !== "ready" && row.status !== "failed") {
      throw new Error(`cannot generate from status: ${row.status}`);
    }

    await this.updateStatus(id, userId, "generating");

    // Plan フェーズ: planModel で実装計画を先に生成する（失敗しても生成は続行）
    const plan = await this.generatePlan(id, row.instruction, opts.planModel);

    try {
      const { patches } = await this.runner.generate({
        instruction: plan
          ? `${row.instruction}\n\n## 実装計画\n${plan}`
          : row.instruction,
        sessionId: id,
        model: opts.model,
      });

      if (!patches.length) {
        await this.updateStatus(id, userId, "failed");
        return;
      }

      await this.db.exec(
        `UPDATE code_sessions SET generated_patches = ?, status = ?, updated_at = ? WHERE id = ?`,
        [JSON.stringify(patches), "generated", Date.now(), id]
      );
    } catch {
      await this.updateStatus(id, userId, "failed");
    }
  }

  async apply(
    id: string,
    userId: string,
    vcs: VcsProvider
  ): Promise<{ prNumber: number; prUrl: string }> {
    const row = await this.get(id, userId);
    if (!row) throw new Error("code session not found");
    if (row.status !== "generated") throw new Error(`cannot apply from status: ${row.status}`);
    if (!row.generated_patches) throw new Error("no patches to apply");

    const patches: Patch[] = JSON.parse(row.generated_patches);
    const branch = `code/${id.slice(0, 8)}`;

    await this.updateStatus(id, userId, "applying");

    for (const patch of patches) {
      await this.runner.write({
        sessionId: id,
        files: [{ path: patch.file, content: patch.fixedContent }],
      });
    }

    const commitResult = await this.runner.commit({
      sessionId: id,
      message: `${row.title}\n\n${row.instruction}`,
    });

    const pushResult = await this.runner.push({
      sessionId: id,
      branch,
    });

    if (!pushResult.success) {
      await this.updateStatus(id, userId, "failed");
      throw new Error("failed to push branch");
    }

    const pr = await vcs.createPR({
      branch,
      baseBranch: row.base_branch,
      title: row.title,
      body: `## Code Mode\n\n${row.instruction}\n\nGenerated patches applied automatically.`,
    });

    await this.db.exec(
      `UPDATE code_sessions SET status = ?, applied_branch = ?, pr_number = ?, pr_url = ?, updated_at = ? WHERE id = ?`,
      ["applied", branch, pr.number, pr.url, Date.now(), id]
    );

    return { prNumber: pr.number, prUrl: pr.url };
  }

  async dismiss(id: string, userId: string): Promise<void> {
    const row = await this.get(id, userId);
    if (!row) throw new Error("code session not found");
    if (row.status === "applied") throw new Error("cannot dismiss applied session");
    await this.updateStatus(id, userId, "dismissed");
  }

  private async generatePlan(id: string, instruction: string, planModel?: string): Promise<string> {
    if (!this.ai) return "";
    try {
      const plan = (
        await this.ai.complete({
          model: planModel,
          system: PLAN_SYSTEM,
          prompt: instruction,
          maxTokens: 1024,
        })
      ).trim();
      if (plan) {
        await this.db.exec(`UPDATE code_sessions SET plan = ?, updated_at = ? WHERE id = ?`, [
          plan,
          Date.now(),
          id,
        ]);
      }
      return plan;
    } catch {
      return "";
    }
  }

  private async updateStatus(id: string, userId: string, status: CodeSessionStatus): Promise<void> {
    await this.db.exec(
      `UPDATE code_sessions SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      [status, Date.now(), id, userId]
    );
  }
}
