import type { DbAdapter } from "../ports/db";
import {
  SessionRepository,
  SettingsRepository,
  UserRepository,
  type UserRow,
} from "../db/repositories";
import { hashPassword, verifyPassword } from "./password";
import { newId, newSessionId } from "./tokens";
import { isWorkersAiModelId, DEFAULT_WORKERS_AI_MODEL } from "../config/deployment";
import type { ModelMode } from "../config/model.modes";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const MAX_SESSIONS_PER_USER = 5;
const REGISTRATION_KEY = "registration_enabled";

export interface AuthedUser {
  id: string;
  email: string;
  role: "admin" | "member";
  model: string | null;
}

export class AuthError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function toAuthedUser(row: UserRow): AuthedUser {
  return { id: row.id, email: row.email, role: row.role === "admin" ? "admin" : "member", model: row.model ?? null };
}

/**
 * Runtime-agnostic auth orchestration over the repositories. Handles
 * registration (with admin-controlled toggle + first-user bootstrap), login,
 * and sessions. API authentication is session-cookie only (no API tokens).
 */
export class AuthService {
  private readonly users: UserRepository;
  private readonly sessions: SessionRepository;
  private readonly settings: SettingsRepository;

  constructor(db: DbAdapter) {
    this.users = new UserRepository(db);
    this.sessions = new SessionRepository(db);
    this.settings = new SettingsRepository(db);
  }

  async userCount(): Promise<number> {
    return this.users.count();
  }

  async isRegistrationEnabled(): Promise<boolean> {
    const value = await this.settings.get(REGISTRATION_KEY);
    if (value === undefined) return false;
    return value === "true";
  }

  async setRegistrationEnabled(enabled: boolean): Promise<void> {
    await this.settings.set(REGISTRATION_KEY, enabled ? "true" : "false");
  }

  async register(email: string, password: string): Promise<AuthedUser> {
    const normalized = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) throw new AuthError("invalid email");
    if (password.length < 8) throw new AuthError("password must be at least 8 characters");

    const isFirstUser = (await this.users.count()) === 0;

    if (!isFirstUser && !(await this.isRegistrationEnabled())) {
      throw new AuthError("registration is disabled", 403);
    }
    if (await this.users.findByEmail(normalized)) throw new AuthError("email already registered", 409);

    const now = Date.now();
    const row: UserRow = {
      id: newId(),
      email: normalized,
      password_hash: await hashPassword(password),
      role: isFirstUser ? "admin" : "member",
      model: null,
      mode_models: null,
      created_at: now,
      updated_at: now,
    };
    await this.users.insert(row);

    // Lock registration after bootstrapping the first admin.
    if (isFirstUser) {
      await this.settings.set(REGISTRATION_KEY, "false");
    }

    return toAuthedUser(row);
  }

  async login(email: string, password: string): Promise<{ user: AuthedUser; sessionId: string }> {
    const row = await this.users.findByEmail(email.trim().toLowerCase());
    if (!row || !(await verifyPassword(password, row.password_hash))) {
      throw new AuthError("invalid credentials", 401);
    }
    const sessionId = newSessionId();
    const now = Date.now();
    await this.sessions.create({
      id: sessionId,
      user_id: row.id,
      expires_at: now + SESSION_TTL_MS,
      created_at: now,
    });
    // Prune oldest sessions if user exceeds the per-account session cap.
    await this.sessions.deleteOldestBeyondLimit(row.id, MAX_SESSIONS_PER_USER);
    return { user: toAuthedUser(row), sessionId };
  }

  async cleanupExpiredSessions(): Promise<void> {
    await this.sessions.deleteExpired(Date.now());
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessions.delete(sessionId);
  }

  async resolveSession(sessionId: string): Promise<AuthedUser | undefined> {
    const session = await this.sessions.find(sessionId);
    if (!session) return undefined;
    if (session.expires_at < Date.now()) {
      await this.sessions.delete(sessionId);
      return undefined;
    }
    const user = await this.users.findById(session.user_id);
    return user ? toAuthedUser(user) : undefined;
  }

  async updateProfile(userId: string, email: string, password?: string): Promise<AuthedUser> {
    const normalized = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) throw new AuthError("invalid email");

    const existing = await this.users.findByEmail(normalized);
    if (existing && existing.id !== userId) {
      throw new AuthError("email already registered", 409);
    }

    let passwordHash: string | undefined;
    if (password) {
      if (password.length < 8) throw new AuthError("password must be at least 8 characters");
      passwordHash = await hashPassword(password);
    }

    await this.users.updateProfile(userId, normalized, passwordHash);

    const updated = await this.users.findById(userId);
    if (!updated) throw new AuthError("user not found", 404);
    return toAuthedUser(updated);
  }

  async getModel(userId: string): Promise<string | null> {
    return this.users.getModel(userId);
  }

  async setModel(userId: string, model: string | null): Promise<void> {
    if (model !== null && !isWorkersAiModelId(model)) {
      throw new AuthError(`"${model}" is not a valid Workers AI model id`);
    }
    await this.users.setModel(userId, model);
  }

  async getModeModels(userId: string): Promise<Record<string, string>> {
    return this.users.getModeModels(userId);
  }

  async setModeModel(userId: string, mode: ModelMode, model: string | null): Promise<void> {
    if (model !== null && !isWorkersAiModelId(model)) {
      throw new AuthError(`"${model}" is not a valid Workers AI model id`);
    }
    const current = await this.users.getModeModels(userId);
    if (model === null) {
      delete current[mode];
    } else {
      current[mode] = model;
    }
    await this.users.setModeModels(userId, current);
  }

  /**
   * モード別モデルのフォールバック連鎖:
   * mode_models[mode] → users.model（グローバル）→ DEFAULT_WORKERS_AI_MODEL。
   * userId が無い場合（cron トリガー等）はデフォルトを返す。
   */
  async resolveModel(userId: string | null | undefined, mode: ModelMode): Promise<string> {
    if (!userId) return DEFAULT_WORKERS_AI_MODEL;
    const modeModels = await this.users.getModeModels(userId);
    if (modeModels[mode]) return modeModels[mode];
    return (await this.users.getModel(userId)) ?? DEFAULT_WORKERS_AI_MODEL;
  }
}
