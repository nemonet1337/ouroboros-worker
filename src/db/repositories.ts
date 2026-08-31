import type { DbAdapter } from "../ports/db";
import { HEALING_ACTIVE_SQL, HEALING_INSPECTION_TARGET_PREFIX } from "../healing/status";
import { mergeHealingSummary } from "../healing/summary";

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: string;
  model: string | null;
  mode_models: string | null;
  created_at: number;
  updated_at: number;
}

export interface SessionRow {
  id: string;
  user_id: string;
  expires_at: number;
  created_at: number;
}

export interface HealingRunRow {
  id: string;
  user_id: string | null;
  status: string;
  trigger: string;
  workflow_id: string | null;
  summary: string | null;
  tag: string | null;
  inspection_id: string | null;
  model: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  fix_model: string | null;
  fix_prompt_tokens: number;
  fix_completion_tokens: number;
  created_at: number;
  updated_at: number;
}

export type HealingRunPatch = {
  status?: string;
  workflow_id?: string;
  summary?: string;
  inspection_id?: string | null;
  model?: string | null;
  prompt_tokens?: number;
  completion_tokens?: number;
  fix_model?: string | null;
  fix_prompt_tokens?: number;
  fix_completion_tokens?: number;
};

export class UserRepository {
  constructor(private readonly db: DbAdapter) {}

  async findByEmail(email: string): Promise<UserRow | undefined> {
    const rows = await this.db.query<UserRow>(`SELECT * FROM users WHERE email = ?`, [email]);
    return rows[0];
  }

  async findById(id: string): Promise<UserRow | undefined> {
    const rows = await this.db.query<UserRow>(`SELECT * FROM users WHERE id = ?`, [id]);
    return rows[0];
  }

  async count(): Promise<number> {
    const rows = await this.db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM users`);
    return Number(rows[0]?.n ?? 0);
  }

  async insert(row: UserRow): Promise<void> {
    await this.db.exec(
      `INSERT INTO users (id, email, password_hash, role, model, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [row.id, row.email, row.password_hash, row.role, row.model ?? null, row.created_at, row.updated_at]
    );
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.db.exec(
      `UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`,
      [passwordHash, Date.now(), id]
    );
  }

  async updateProfile(id: string, email: string, passwordHash?: string): Promise<void> {
    const now = Date.now();
    if (passwordHash) {
      await this.db.exec(
        `UPDATE users SET email = ?, password_hash = ?, updated_at = ? WHERE id = ?`,
        [email, passwordHash, now, id]
      );
    } else {
      await this.db.exec(
        `UPDATE users SET email = ?, updated_at = ? WHERE id = ?`,
        [email, now, id]
      );
    }
  }

  async setModel(id: string, model: string | null): Promise<void> {
    await this.db.exec(
      `UPDATE users SET model = ?, updated_at = ? WHERE id = ?`,
      [model, Date.now(), id]
    );
  }

  async getModel(id: string): Promise<string | null> {
    const rows = await this.db.query<{ model: string | null }>(
      `SELECT model FROM users WHERE id = ?`,
      [id]
    );
    return rows[0]?.model ?? null;
  }

  async getModeModels(id: string): Promise<Record<string, string>> {
    const rows = await this.db.query<{ mode_models: string | null }>(
      `SELECT mode_models FROM users WHERE id = ?`,
      [id]
    );
    const raw = rows[0]?.mode_models;
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return Object.fromEntries(
          Object.entries(parsed).filter(([, v]) => typeof v === "string" && v.length > 0)
        ) as Record<string, string>;
      }
    } catch {
      // 不正な JSON は未設定として扱う
    }
    return {};
  }

  async setModeModels(id: string, models: Record<string, string>): Promise<void> {
    await this.db.exec(
      `UPDATE users SET mode_models = ?, updated_at = ? WHERE id = ?`,
      [Object.keys(models).length > 0 ? JSON.stringify(models) : null, Date.now(), id]
    );
  }
}

export class SessionRepository {
  constructor(private readonly db: DbAdapter) {}

  async create(row: SessionRow): Promise<void> {
    await this.db.exec(
      `INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`,
      [row.id, row.user_id, row.expires_at, row.created_at]
    );
  }

  async find(id: string): Promise<SessionRow | undefined> {
    const rows = await this.db.query<SessionRow>(`SELECT * FROM sessions WHERE id = ?`, [id]);
    return rows[0];
  }

  async delete(id: string): Promise<void> {
    await this.db.exec(`DELETE FROM sessions WHERE id = ?`, [id]);
  }

  async deleteExpired(now: number): Promise<void> {
    await this.db.exec(`DELETE FROM sessions WHERE expires_at < ?`, [now]);
  }

  async countByUser(userId: string): Promise<number> {
    const rows = await this.db.query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?`,
      [userId]
    );
    return Number(rows[0]?.n ?? 0);
  }

  async deleteOldestBeyondLimit(userId: string, maxSessions: number): Promise<void> {
    await this.db.exec(
      `DELETE FROM sessions WHERE user_id = ? AND id NOT IN (
         SELECT id FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
       )`,
      [userId, userId, maxSessions]
    );
  }
}

export class SettingsRepository {
  constructor(private readonly db: DbAdapter) {}

  async get(key: string): Promise<string | undefined> {
    const rows = await this.db.query<{ value: string }>(
      `SELECT value FROM settings WHERE key = ?`,
      [key]
    );
    return rows[0]?.value;
  }

  async set(key: string, value: string): Promise<void> {
    await this.db.exec(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, Date.now()]
    );
  }

  async all(): Promise<Record<string, string>> {
    const rows = await this.db.query<{ key: string; value: string }>(`SELECT key, value FROM settings`);
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }
}

export interface InspectionRow {
  id: string;
  user_id: string;
  target: string | null;
  result: string;
  status: string;
  progress: string | null;
  created_at: number;
}

export class InspectionRepository {
  constructor(private readonly db: DbAdapter) {}

  async insert(row: InspectionRow): Promise<void> {
    await this.db.exec(
      `INSERT INTO inspections (id, user_id, target, result, status, progress, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [row.id, row.user_id, row.target, row.result, row.status ?? "completed", row.progress ?? null, row.created_at]
    );
  }

  async find(id: string, userId: string): Promise<InspectionRow | undefined> {
    const rows = await this.db.query<InspectionRow>(
      `SELECT * FROM inspections WHERE id = ? AND user_id = ?`,
      [id, userId]
    );
    return rows[0];
  }

  async listByUser(userId: string, limit = 30): Promise<InspectionRow[]> {
    return this.db.query<InspectionRow>(
      `SELECT * FROM inspections
       WHERE user_id = ? AND (target IS NULL OR target NOT LIKE ?)
       ORDER BY created_at DESC LIMIT ?`,
      [userId, `${HEALING_INSPECTION_TARGET_PREFIX}%`, limit]
    );
  }

  async findById(id: string): Promise<InspectionRow | undefined> {
    const rows = await this.db.query<InspectionRow>(
      `SELECT * FROM inspections WHERE id = ?`,
      [id]
    );
    return rows[0];
  }

  async countSince(userId: string, sinceMs: number): Promise<number> {
    const rows = await this.db.query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM inspections
       WHERE user_id = ? AND created_at >= ? AND (target IS NULL OR target NOT LIKE ?)`,
      [userId, sinceMs, `${HEALING_INSPECTION_TARGET_PREFIX}%`]
    );
    return Number(rows[0]?.n ?? 0);
  }

  /** 進行中（queued/indexing/searching/analyzing）の検査。通知欄用。 */
  async listActive(userId: string, limit = 10): Promise<InspectionRow[]> {
    return this.db.query<InspectionRow>(
      `SELECT * FROM inspections
       WHERE user_id = ? AND status IN ('queued', 'indexing', 'searching', 'analyzing')
       ORDER BY created_at DESC LIMIT ?`,
      [userId, limit]
    );
  }

  /** 30 分以上進行中のままの検査を failed にする（スタック検出）。 */
  async failStale(olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    const rows = await this.db.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM inspections
       WHERE status IN ('queued', 'indexing', 'searching', 'analyzing') AND created_at < ?`,
      [cutoff]
    );
    for (const r of rows) {
      await this.db.exec(
        `UPDATE inspections SET status = ?, progress = ? WHERE id = ? AND user_id = ?`,
        [
          "failed",
          JSON.stringify([{ step: "failed", message: "タイムアウト", at: Date.now() }]),
          r.id,
          r.user_id,
        ]
      );
    }
    return rows.length;
  }

  async updateStatus(id: string, userId: string, status: string): Promise<void> {
    await this.db.exec(
      `UPDATE inspections SET status = ? WHERE id = ? AND user_id = ?`,
      [status, id, userId]
    );
  }

  /** 解析パイプラインの進行状況（status + progress JSON）を更新する。 */
  async updateProgress(id: string, userId: string, status: string, progress: unknown): Promise<void> {
    await this.db.exec(
      `UPDATE inspections SET status = ?, progress = ? WHERE id = ? AND user_id = ?`,
      [status, JSON.stringify(progress), id, userId]
    );
  }

  /** 解析完了時に結果を書き込みステータスを更新する。 */
  async setResult(id: string, userId: string, result: string, status: string): Promise<void> {
    await this.db.exec(
      `UPDATE inspections SET result = ?, status = ? WHERE id = ? AND user_id = ?`,
      [result, status, id, userId]
    );
  }
}

export class HealingRunRepository {
  constructor(private readonly db: DbAdapter) {}

  async create(row: HealingRunRow): Promise<void> {
    await this.db.exec(
      `INSERT INTO healing_runs (
         id, user_id, status, trigger, workflow_id, summary, tag,
         inspection_id, model, prompt_tokens, completion_tokens,
         fix_model, fix_prompt_tokens, fix_completion_tokens,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.user_id,
        row.status,
        row.trigger,
        row.workflow_id,
        row.summary,
        row.tag,
        row.inspection_id ?? null,
        row.model ?? null,
        row.prompt_tokens ?? 0,
        row.completion_tokens ?? 0,
        row.fix_model ?? null,
        row.fix_prompt_tokens ?? 0,
        row.fix_completion_tokens ?? 0,
        row.created_at,
        row.updated_at,
      ]
    );
  }

  async update(id: string, patch: HealingRunPatch): Promise<void> {
    const sets: string[] = [];
    const params: (string | number | null)[] = [];
    const assign = (col: string, value: string | number | null | undefined, present: boolean) => {
      if (!present) return;
      sets.push(`${col} = ?`);
      params.push(value ?? null);
    };
    assign("status", patch.status, patch.status !== undefined);
    assign("workflow_id", patch.workflow_id, patch.workflow_id !== undefined);
    assign("summary", patch.summary, patch.summary !== undefined);
    assign("inspection_id", patch.inspection_id, patch.inspection_id !== undefined);
    assign("model", patch.model, patch.model !== undefined);
    assign("prompt_tokens", patch.prompt_tokens, patch.prompt_tokens !== undefined);
    assign("completion_tokens", patch.completion_tokens, patch.completion_tokens !== undefined);
    assign("fix_model", patch.fix_model, patch.fix_model !== undefined);
    assign("fix_prompt_tokens", patch.fix_prompt_tokens, patch.fix_prompt_tokens !== undefined);
    assign("fix_completion_tokens", patch.fix_completion_tokens, patch.fix_completion_tokens !== undefined);
    sets.push("updated_at = ?");
    params.push(Date.now());
    params.push(id);
    await this.db.exec(`UPDATE healing_runs SET ${sets.join(", ")} WHERE id = ?`, params);
  }

  /**
   * 実行履歴を新しい順で取得。
   * status を渡すと一致するものだけ。`active` は進行中の別名。
   */
  async recent(limit = 50, offset = 0, status?: string): Promise<HealingRunRow[]> {
    if (status === "active") {
      return this.db.query<HealingRunRow>(
        `SELECT * FROM healing_runs
         WHERE status IN (${HEALING_ACTIVE_SQL})
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [limit, offset]
      );
    }
    if (status) {
      return this.db.query<HealingRunRow>(
        `SELECT * FROM healing_runs WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [status, limit, offset]
      );
    }
    return this.db.query<HealingRunRow>(
      `SELECT * FROM healing_runs ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
  }

  async find(id: string): Promise<HealingRunRow | undefined> {
    const rows = await this.db.query<HealingRunRow>(
      `SELECT * FROM healing_runs WHERE id = ?`,
      [id]
    );
    return rows[0];
  }

  /** 進行中の修復実行。通知欄用。analyzed（修復待ち）は含まない。 */
  async listActive(limit = 10): Promise<HealingRunRow[]> {
    return this.db.query<HealingRunRow>(
      `SELECT * FROM healing_runs
       WHERE status IN (${HEALING_ACTIVE_SQL})
       ORDER BY created_at DESC LIMIT ?`,
      [limit]
    );
  }

  /** 60 分以上進行中のままの修復を failed にする。解析サマリは残す。 */
  async failStale(olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    const rows = await this.db.query<{ id: string; summary: string | null }>(
      `SELECT id, summary FROM healing_runs
       WHERE status IN (${HEALING_ACTIVE_SQL})
         AND updated_at < ?`,
      [cutoff]
    );
    for (const r of rows) {
      await this.update(r.id, {
        status: "failed",
        summary: mergeHealingSummary(r.summary, { error: "タイムアウト" }),
      });
    }
    return rows.length;
  }
}

// ─── Code Mode: CodeSession Repository ─────────────────────────────────────

export interface CodeSessionRow {
  id: string;
  user_id: string;
  repo_url: string;
  branch: string;
  base_branch: string;
  title: string;
  instruction: string;
  status: string;
  plan?: string | null;
  error_message?: string | null;
  mode?: string;
  generated_patches: string | null;
  applied_branch: string | null;
  pr_number: number | null;
  pr_url: string | null;
  created_at: number;
  updated_at: number;
}

export class CodeSessionRepository {
  constructor(private readonly db: DbAdapter) {}

  async create(row: CodeSessionRow): Promise<void> {
    await this.db.exec(
      `INSERT INTO code_sessions
        (id, user_id, repo_url, branch, base_branch, title, instruction, status,
         generated_patches, applied_branch, pr_number, pr_url, created_at, updated_at,
         error_message, mode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, row.user_id, row.repo_url, row.branch, row.base_branch,
        row.title, row.instruction, row.status, row.generated_patches,
        row.applied_branch, row.pr_number, row.pr_url, row.created_at, row.updated_at,
        row.error_message ?? null, row.mode ?? "plan_code",
      ]
    );
  }

  async get(id: string, userId: string): Promise<CodeSessionRow | undefined> {
    const rows = await this.db.query<CodeSessionRow>(
      `SELECT * FROM code_sessions WHERE id = ? AND user_id = ?`,
      [id, userId]
    );
    return rows[0];
  }

  async listByUser(userId: string, limit = 30): Promise<CodeSessionRow[]> {
    return this.db.query<CodeSessionRow>(
      `SELECT * FROM code_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      [userId, limit]
    );
  }

  /** 進行中（initializing/generating/applying）のセッション。通知欄用。 */
  async listActive(userId: string, limit = 10): Promise<CodeSessionRow[]> {
    return this.db.query<CodeSessionRow>(
      `SELECT * FROM code_sessions
       WHERE user_id = ? AND status IN ('initializing', 'generating', 'applying')
       ORDER BY created_at DESC LIMIT ?`,
      [userId, limit]
    );
  }

  /** 10 分以上 generating/applying のセッションを failed にする。 */
  async failStale(olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    const rows = await this.db.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM code_sessions
       WHERE status IN ('generating', 'applying') AND updated_at < ?`,
      [cutoff]
    );
    for (const r of rows) {
      await this.db.exec(
        `UPDATE code_sessions SET status = ?, error_message = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
        ["failed", "生成がタイムアウトしました。再実行してください", Date.now(), r.id, r.user_id]
      );
    }
    return rows.length;
  }

  async updateStatus(id: string, userId: string, status: string): Promise<void> {
    await this.db.exec(
      `UPDATE code_sessions SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      [status, Date.now(), id, userId]
    );
  }

  async setPatches(id: string, userId: string, patches: unknown[], mode?: string): Promise<void> {
    await this.db.exec(
      `UPDATE code_sessions SET generated_patches = ?, status = ?, error_message = NULL, mode = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      [JSON.stringify(patches), "generated", mode ?? "plan_code", Date.now(), id, userId]
    );
  }

  async setError(id: string, userId: string, errorMessage: string, mode?: string): Promise<void> {
    await this.db.exec(
      `UPDATE code_sessions SET status = ?, error_message = ?, mode = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      ["failed", errorMessage, mode ?? "plan_code", Date.now(), id, userId]
    );
  }

  async setApplied(id: string, userId: string, branch: string, prNumber: number, prUrl: string): Promise<void> {
    await this.db.exec(
      `UPDATE code_sessions SET status = ?, applied_branch = ?, pr_number = ?, pr_url = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      ["applied", branch, prNumber, prUrl, Date.now(), id, userId]
    );
  }

  async dismiss(id: string, userId: string): Promise<void> {
    await this.db.exec(
      `UPDATE code_sessions SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      ["dismissed", Date.now(), id, userId]
    );
  }
}

// ─── Refactor Mode: Refactor Repository ──────────────────────────────────────

export interface RefactorProposalRow {
  id: string;
  status: string;
  created_at: number;
  result: string;
}

export class RefactorRepository {
  constructor(private readonly db: DbAdapter) {}

  async listProposals(userId: string): Promise<RefactorProposalRow[]> {
    return this.db.query<RefactorProposalRow>(
      `SELECT id, status, created_at, result FROM inspections WHERE user_id = ? AND status IN ('proposed', 'applied', 'dismissed') ORDER BY created_at DESC`,
      [userId]
    );
  }

  async getProposal(id: string, userId: string): Promise<RefactorProposalRow | undefined> {
    const rows = await this.db.query<RefactorProposalRow>(
      `SELECT id, status, created_at, result FROM inspections WHERE id = ? AND user_id = ?`,
      [id, userId]
    );
    return rows[0];
  }

  async updateStatus(id: string, userId: string, status: string): Promise<void> {
    await this.db.exec(
      `UPDATE inspections SET status = ? WHERE id = ? AND user_id = ?`,
      [status, id, userId]
    );
  }

  async updateResult(id: string, userId: string, result: string): Promise<void> {
    await this.db.exec(
      `UPDATE inspections SET result = ? WHERE id = ? AND user_id = ?`,
      [result, id, userId]
    );
  }
}
