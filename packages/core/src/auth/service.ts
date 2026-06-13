import type { DbAdapter } from "../ports/db";
import {
  ApiTokenRepository,
  SessionRepository,
  SettingsRepository,
  UserRepository,
  type ApiTokenRow,
  type UserRow,
} from "../db/repositories";
import { hashPassword, verifyPassword } from "./password";
import { generateApiToken, newId, newSessionId, sha256Hex, type Scope } from "./tokens";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const REGISTRATION_KEY = "registration_enabled";

export interface AuthedUser {
  id: string;
  email: string;
  role: "admin" | "member";
}

export interface TokenIdentity extends AuthedUser {
  tokenId: string;
  scopes: string;
}

export class AuthError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function toAuthedUser(row: UserRow): AuthedUser {
  return { id: row.id, email: row.email, role: row.role === "admin" ? "admin" : "member" };
}

/**
 * Runtime-agnostic auth orchestration over the repositories. Handles
 * registration (with admin-controlled toggle + first-user bootstrap), login,
 * sessions, and scoped API tokens.
 */
export class AuthService {
  private readonly users: UserRepository;
  private readonly sessions: SessionRepository;
  private readonly tokens: ApiTokenRepository;
  private readonly settings: SettingsRepository;

  constructor(db: DbAdapter) {
    this.users = new UserRepository(db);
    this.sessions = new SessionRepository(db);
    this.tokens = new ApiTokenRepository(db);
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
    return { user: toAuthedUser(row), sessionId };
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

  async resolveToken(secret: string): Promise<TokenIdentity | undefined> {
    if (!secret.startsWith("ouro_")) return undefined;
    const hash = await sha256Hex(secret);
    const token = await this.tokens.findByHash(hash);
    if (!token || token.revoked_at) return undefined;
    if (token.expires_at && token.expires_at < Date.now()) return undefined;
    const user = await this.users.findById(token.user_id);
    if (!user) return undefined;
    await this.tokens.touch(token.id, Date.now());
    return { ...toAuthedUser(user), tokenId: token.id, scopes: token.scopes };
  }

  async createToken(
    userId: string,
    name: string,
    scopes: Scope[],
    expiresInDays?: number
  ): Promise<{ secret: string; prefix: string; id: string }> {
    const { secret, hash, prefix } = await generateApiToken();
    const now = Date.now();
    const id = newId();
    const row: ApiTokenRow = {
      id,
      user_id: userId,
      name: name.slice(0, 80) || "token",
      token_hash: hash,
      prefix,
      scopes: (scopes.length ? scopes : ["read"]).join(","),
      last_used_at: null,
      revoked_at: null,
      expires_at: expiresInDays ? now + expiresInDays * 86_400_000 : null,
      created_at: now,
    };
    await this.tokens.insert(row);
    return { secret, prefix, id };
  }

  async listTokens(userId: string): Promise<Array<Omit<ApiTokenRow, "token_hash">>> {
    const rows = await this.tokens.listByUser(userId);
    return rows.map(({ token_hash: _omit, ...rest }) => rest);
  }

  async revokeToken(userId: string, tokenId: string): Promise<void> {
    await this.tokens.revoke(tokenId, userId, Date.now());
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

}
