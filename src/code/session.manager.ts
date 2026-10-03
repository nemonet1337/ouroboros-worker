import type { DbAdapter } from "../ports/db";
import type { CodeRunner } from "../ports/runner";
import type { CodeSessionStatus, CodeSessionRow, Patch } from "../types";
import type { VcsProvider } from "../ports/vcs";
import type { RoutingConfig } from "../config/routing";
import type { RouteDecision } from "../routing/model.router";

export interface CreateSessionOpts {
  userId: string;
  repoUrl: string;
  branch: string;
  baseBranch: string;
  title: string;
  instruction: string;
}

export interface GenerateOpts {
  /** Clef の判定を無視して固定モデルを使う場合の指定。 */
  model?: string;
  reasoningEffort?: RouteDecision["reasoningEffort"];
  /** codegen に渡すルーティング設定。省略時は Runner の既定を使う。 */
  routing?: RoutingConfig;
  /** model が明示されていることを Runner に伝える。 */
  modelOverride?: boolean;
}

export class CodeSessionManager {
  constructor(
    private readonly db: DbAdapter,
    private readonly runner: CodeRunner
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

    try {
      await this.runner.init({
        repoUrl: opts.repoUrl,
        branch: opts.branch,
        sessionId: id,
      });
    } catch (err) {
      // initializing のままスタックさせず、失敗として記録した上でエラーを表示させる
      const reason = err instanceof Error ? err.message : String(err);
      await this.setError(id, row.user_id, `セッション初期化に失敗しました: ${reason}`);
      throw err;
    }

    await this.updateStatus(id, row.user_id, "ready");
    return id;
  }

  private static readonly STALE_MS = 10 * 60 * 1000; // 10 分

  /** generating/applying が 10 分超なら failed に自己回復させる */
  private async recoverStale(row: CodeSessionRow): Promise<CodeSessionRow> {
    if (
      (row.status === "generating" || row.status === "applying") &&
      row.updated_at < Date.now() - CodeSessionManager.STALE_MS
    ) {
      await this.db.exec(
        `UPDATE code_sessions SET status = ?, error_message = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
        [
          "failed",
          "生成がタイムアウトしました。再実行してください",
          Date.now(),
          row.id,
          row.user_id,
        ]
      );
      return { ...row, status: "failed", error_message: "生成がタイムアウトしました。再実行してください" };
    }
    return row;
  }

  async get(id: string, userId: string): Promise<CodeSessionRow | undefined> {
    const rows = (await this.db.query<CodeSessionRow>(
      `SELECT * FROM code_sessions WHERE id = ? AND user_id = ?`,
      [id, userId]
    )) as CodeSessionRow[];
    if (!rows[0]) return undefined;
    return this.recoverStale(rows[0]);
  }

  async list(userId: string): Promise<CodeSessionRow[]> {
    const rows = (await this.db.query<CodeSessionRow>(
      `SELECT * FROM code_sessions WHERE user_id = ? ORDER BY created_at DESC`,
      [userId]
    )) as CodeSessionRow[];
    return Promise.all(rows.map((r) => this.recoverStale(r)));
  }

  /**
   * Plan フェーズは廃止済み。検索コンテキストを組み立て、Clef でモデル階層を
   * 決めてから直接 codegen へ渡す。
   */
  async generate(id: string, userId: string, opts: GenerateOpts = {}): Promise<void> {
    const row = await this.get(id, userId);
    if (!row) throw new Error("code session not found");

    // ready/failed から開始。Queue 経由では既に generating に遷移済みの場合もある。
    if (row.status !== "ready" && row.status !== "failed" && row.status !== "generating") {
      throw new Error(`cannot generate from status: ${row.status}`);
    }

    if (row.status !== "generating") {
      await this.updateStatus(id, userId, "generating");
    }

    try {
      const result = await this.runner.generate({
        instruction: row.instruction,
        sessionId: id,
        model: opts.model,
        reasoningEffort: opts.reasoningEffort,
        routing: opts.routing,
        modelOverride: !!opts.model,
      });
      const patches = result.patches;

      if (!patches.length) {
        const reason = result.error ?? "生成されたパッチが空でした。";
        await this.setError(id, userId, reason);
        return;
      }

      await this.db.exec(
        `UPDATE code_sessions SET generated_patches = ?, status = ?, error_message = NULL, updated_at = ? WHERE id = ?`,
        [JSON.stringify(patches), "generated", Date.now(), id]
      );
      await this.saveRoute(id, userId, result.route);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await this.setError(id, userId, `パッチ生成に失敗しました: ${reason}`);
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

    await this.runner.commit({
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

  private async saveRoute(id: string, userId: string, route: RouteDecision | undefined): Promise<void> {
    if (!route) return;
    await this.db.exec(
      `UPDATE code_sessions SET difficulty = ?, tier = ?, route_model = ?, route_effort = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [route.difficulty, route.tier, route.model, route.reasoningEffort, Date.now(), id, userId]
    );
  }

  private async updateStatus(id: string, userId: string, status: CodeSessionStatus): Promise<void> {
    await this.db.exec(
      `UPDATE code_sessions SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      [status, Date.now(), id, userId]
    );
  }

  private async setError(id: string, userId: string, errorMessage: string): Promise<void> {
    await this.db.exec(
      `UPDATE code_sessions SET status = ?, error_message = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      ["failed", errorMessage, Date.now(), id, userId]
    );
  }
}
