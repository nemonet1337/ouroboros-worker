import type { DbAdapter } from "../ports/db";

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: string;
  model: string | null;
  created_at: number;
  updated_at: number;
}

export interface SessionRow {
  id: string;
  user_id: string;
  expires_at: number;
  created_at: number;
}

export interface ApiTokenRow {
  id: string;
  user_id: string;
  name: string;
  token_hash: string;
  prefix: string;
  scopes: string;
  last_used_at: number | null;
  revoked_at: number | null;
  expires_at: number | null;
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
  created_at: number;
  updated_at: number;
}

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

export class ApiTokenRepository {
  constructor(private readonly db: DbAdapter) {}

  async insert(row: ApiTokenRow): Promise<void> {
    await this.db.exec(
      `INSERT INTO api_tokens
        (id, user_id, name, token_hash, prefix, scopes, last_used_at, revoked_at, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, row.user_id, row.name, row.token_hash, row.prefix, row.scopes,
        row.last_used_at, row.revoked_at, row.expires_at, row.created_at,
      ]
    );
  }

  async findByHash(hash: string): Promise<ApiTokenRow | undefined> {
    const rows = await this.db.query<ApiTokenRow>(
      `SELECT * FROM api_tokens WHERE token_hash = ?`,
      [hash]
    );
    return rows[0];
  }

  async listByUser(userId: string): Promise<ApiTokenRow[]> {
    return this.db.query<ApiTokenRow>(
      `SELECT * FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC`,
      [userId]
    );
  }

  async revoke(id: string, userId: string, now: number): Promise<void> {
    await this.db.exec(
      `UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND user_id = ?`,
      [now, id, userId]
    );
  }

  async touch(id: string, now: number): Promise<void> {
    await this.db.exec(`UPDATE api_tokens SET last_used_at = ? WHERE id = ?`, [now, id]);
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
  created_at: number;
}

export class InspectionRepository {
  constructor(private readonly db: DbAdapter) {}

  async insert(row: InspectionRow): Promise<void> {
    await this.db.exec(
      `INSERT INTO inspections (id, user_id, target, result, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [row.id, row.user_id, row.target, row.result, row.status ?? "completed", row.created_at]
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
      `SELECT * FROM inspections WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      [userId, limit]
    );
  }

  async countSince(userId: string, sinceMs: number): Promise<number> {
    const rows = await this.db.query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM inspections WHERE user_id = ? AND created_at >= ?`,
      [userId, sinceMs]
    );
    return Number(rows[0]?.n ?? 0);
  }

  async updateStatus(id: string, userId: string, status: string): Promise<void> {
    await this.db.exec(
      `UPDATE inspections SET status = ? WHERE id = ? AND user_id = ?`,
      [status, id, userId]
    );
  }
}

export interface WebhookRow {
  id: string;
  user_id: string;
  url: string;
  type: string;
  enabled: number;
  config: string | null;
  created_at: number;
}

export class WebhookRepository {
  constructor(private readonly db: DbAdapter) {}

  async insert(row: WebhookRow): Promise<void> {
    await this.db.exec(
      `INSERT INTO webhooks (id, user_id, url, type, enabled, config, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [row.id, row.user_id, row.url, row.type, row.enabled, row.config, row.created_at]
    );
  }

  async listByUser(userId: string): Promise<WebhookRow[]> {
    return this.db.query<WebhookRow>(
      `SELECT * FROM webhooks WHERE user_id = ? ORDER BY created_at DESC`,
      [userId]
    );
  }

  async setEnabled(id: string, userId: string, enabled: boolean): Promise<void> {
    await this.db.exec(`UPDATE webhooks SET enabled = ? WHERE id = ? AND user_id = ?`, [
      enabled ? 1 : 0,
      id,
      userId,
    ]);
  }

  async delete(id: string, userId: string): Promise<void> {
    await this.db.exec(`DELETE FROM webhooks WHERE id = ? AND user_id = ?`, [id, userId]);
  }
}

export class HealingRunRepository {
  constructor(private readonly db: DbAdapter) {}

  async create(row: HealingRunRow): Promise<void> {
    await this.db.exec(
      `INSERT INTO healing_runs (id, user_id, status, trigger, workflow_id, summary, tag, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.id, row.user_id, row.status, row.trigger, row.workflow_id, row.summary, row.tag, row.created_at, row.updated_at]
    );
  }

  async update(id: string, patch: { status?: string; workflow_id?: string; summary?: string }): Promise<void> {
    const sets: string[] = [];
    const params: (string | number | null)[] = [];
    if (patch.status !== undefined) { sets.push("status = ?"); params.push(patch.status); }
    if (patch.workflow_id !== undefined) { sets.push("workflow_id = ?"); params.push(patch.workflow_id); }
    if (patch.summary !== undefined) { sets.push("summary = ?"); params.push(patch.summary); }
    sets.push("updated_at = ?"); params.push(Date.now());
    params.push(id);
    await this.db.exec(`UPDATE healing_runs SET ${sets.join(", ")} WHERE id = ?`, params);
  }

  async recent(limit = 50): Promise<HealingRunRow[]> {
    return this.db.query<HealingRunRow>(
      `SELECT * FROM healing_runs ORDER BY created_at DESC LIMIT ?`,
      [limit]
    );
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
         generated_patches, applied_branch, pr_number, pr_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, row.user_id, row.repo_url, row.branch, row.base_branch,
        row.title, row.instruction, row.status, row.generated_patches,
        row.applied_branch, row.pr_number, row.pr_url, row.created_at, row.updated_at,
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

  async updateStatus(id: string, userId: string, status: string): Promise<void> {
    await this.db.exec(
      `UPDATE code_sessions SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      [status, Date.now(), id, userId]
    );
  }

  async setPatches(id: string, userId: string, patches: unknown[]): Promise<void> {
    await this.db.exec(
      `UPDATE code_sessions SET generated_patches = ?, status = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      [JSON.stringify(patches), "generated", Date.now(), id, userId]
    );
  }

  async setApplied(id: string, userId: string, branch: string, prNumber: number, prUrl: string): Promise<void> {
    await this.db.exec(
      `UPDATE code_sessions SET status = ?, applied_branch = ?, pr_number = ?, pr_url = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      ["applied", branch, prNumber, prUrl, Date.now(), id, userId]
    );
  }  async dismiss(id: string, userId: string): Promise<void> {
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
