import { describe, it, expect, beforeEach } from "vitest";
import { AuthService, AuthError } from "../auth/service";
import type { DbAdapter, SqlParam } from "../ports/db";

class MockDbAdapter implements DbAdapter {
  dialect = "sqlite" as const;
  users: any[] = [];
  settings: Record<string, string> = {};

  async query<T = any>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    if (sql.includes("SELECT model FROM users WHERE id = ?")) {
      const id = params[0] as string;
      const found = this.users.find(u => u.id === id);
      return found ? [{ model: found.model ?? null } as any] : [];
    }
    if (sql.includes("SELECT mode_models FROM users WHERE id = ?")) {
      const id = params[0] as string;
      const found = this.users.find(u => u.id === id);
      return found ? [{ mode_models: found.mode_models ?? null } as any] : [];
    }
    if (sql.includes("SELECT * FROM users WHERE email = ?")) {
      const email = params[0] as string;
      const found = this.users.find(u => u.email === email);
      return found ? [found as any] : [];
    }
    if (sql.includes("SELECT * FROM users WHERE id = ?")) {
      const id = params[0] as string;
      const found = this.users.find(u => u.id === id);
      return found ? [found as any] : [];
    }
    if (sql.includes("SELECT COUNT(*) AS n FROM users")) {
      return [{ n: this.users.length }] as any;
    }
    if (sql.includes("SELECT value FROM settings WHERE key = ?")) {
      const key = params[0] as string;
      return this.settings[key] !== undefined ? [{ value: this.settings[key] }] as any : [];
    }
    return [];
  }

  async exec(sql: string, params: SqlParam[] = []): Promise<void> {
    if (sql.includes("UPDATE users SET model = ?, updated_at = ? WHERE id = ?")) {
      const id = params[2];
      const user = this.users.find(u => u.id === id);
      if (user) {
        user.model = params[0];
        user.updated_at = params[1];
      }
    } else if (sql.includes("UPDATE users SET mode_models = ?, updated_at = ? WHERE id = ?")) {
      const id = params[2];
      const user = this.users.find(u => u.id === id);
      if (user) {
        user.mode_models = params[0];
        user.updated_at = params[1];
      }
    } else if (sql.includes("INSERT INTO users")) {
      this.users.push({
        id: params[0],
        email: params[1],
        password_hash: params[2],
        role: params[3],
        model: params[4],
        created_at: params[5],
        updated_at: params[6],
      });
    } else if (sql.includes("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")) {
      const id = params[2];
      const user = this.users.find(u => u.id === id);
      if (user) {
        user.password_hash = params[0];
        user.updated_at = params[1];
      }
    } else if (sql.includes("UPDATE users SET email = ?, password_hash = ?, updated_at = ? WHERE id = ?")) {
      const id = params[3];
      const user = this.users.find(u => u.id === id);
      if (user) {
        user.email = params[0];
        user.password_hash = params[1];
        user.updated_at = params[2];
      }
    } else if (sql.includes("UPDATE users SET email = ?, updated_at = ? WHERE id = ?")) {
      const id = params[2];
      const user = this.users.find(u => u.id === id);
      if (user) {
        user.email = params[0];
        user.updated_at = params[1];
      }
    } else if (sql.includes("INSERT INTO settings")) {
      const key = params[0] as string;
      const value = params[1] as string;
      this.settings[key] = value;
    }
  }

  async batch(statements: any[]): Promise<void> {
    for (const stmt of statements) {
      await this.exec(stmt.sql, stmt.params);
    }
  }
}

describe("AuthService", () => {
  let db: MockDbAdapter;
  let auth: AuthService;

  beforeEach(() => {
    db = new MockDbAdapter();
    auth = new AuthService(db);
  });

  it("registration is disabled by default", async () => {
    expect(await auth.isRegistrationEnabled()).toBe(false);
  });

  it("fails to register when registration is disabled", async () => {
    // first user auto-bootstraps as admin regardless of registration toggle.
    // seed an existing user so the guard takes effect.
    await auth.register("existing@example.com", "password123");
    await expect(auth.register("test@example.com", "password123")).rejects.toThrow(AuthError);
  });

  it("registers member user when registration is enabled", async () => {
    // first user auto-bootstraps as admin. Seed an admin first so the next
    // registration respects the toggle and creates a member.
    await auth.register("admin@example.com", "password123");
    db.settings["registration_enabled"] = "true";
    const user = await auth.register("member@example.com", "password123");
    expect(user.role).toBe("member");
    expect(user.email).toBe("member@example.com");
  });

  it("updates user profile (email and password)", async () => {
    // Setup initial user
    db.users.push({
      id: "user-1",
      email: "old@example.com",
      password_hash: "old-hash",
      role: "admin",
      model: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    const updated = await auth.updateProfile("user-1", "new@example.com", "newpassword123");
    expect(updated.email).toBe("new@example.com");
    expect(db.users[0].email).toBe("new@example.com");
    expect(db.users[0].password_hash).not.toBe("old-hash");
  });

  it("updates user profile email only", async () => {
    db.users.push({
      id: "user-1",
      email: "old@example.com",
      password_hash: "old-hash",
      role: "admin",
      model: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    const updated = await auth.updateProfile("user-1", "new@example.com");
    expect(updated.email).toBe("new@example.com");
    expect(db.users[0].password_hash).toBe("old-hash");
  });

  it("fails profile update with duplicated email", async () => {
    db.users.push(
      {
        id: "user-1",
        email: "user1@example.com",
        password_hash: "hash",
        role: "admin",
        model: null,
        created_at: Date.now(),
        updated_at: Date.now(),
      },
      {
        id: "user-2",
        email: "user2@example.com",
        password_hash: "hash",
        role: "member",
        model: null,
        created_at: Date.now(),
        updated_at: Date.now(),
      }
    );

    await expect(auth.updateProfile("user-1", "user2@example.com")).rejects.toThrow(AuthError);
  });

  it("sets and gets user model", async () => {
    db.users.push({
      id: "user-1",
      email: "test@example.com",
      password_hash: "hash",
      role: "member",
      model: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    expect(await auth.getModel("user-1")).toBeNull();

    await auth.setModel("user-1", "minimax/m3");
    expect(await auth.getModel("user-1")).toBe("minimax/m3");
  });

  it("resets model to default with null", async () => {
    db.users.push({
      id: "user-1",
      email: "test@example.com",
      password_hash: "hash",
      role: "member",
      model: "minimax/m3",
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    await auth.setModel("user-1", null);
    expect(await auth.getModel("user-1")).toBeNull();
  });

  it("rejects invalid model id", async () => {
    db.users.push({
      id: "user-1",
      email: "test@example.com",
      password_hash: "hash",
      role: "member",
      model: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    await expect(auth.setModel("user-1", "gpt-4o")).rejects.toThrow(AuthError);
  });

  it("sets, gets, and clears per-mode models", async () => {
    db.users.push({
      id: "user-1",
      email: "test@example.com",
      password_hash: "hash",
      role: "member",
      model: null,
      mode_models: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    expect(await auth.getModeModels("user-1")).toEqual({});

    await auth.setModeModel("user-1", "coding", "@cf/meta/llama-3.1-8b-instruct");
    await auth.setModeModel("user-1", "refactor", "minimax/m3");
    expect(await auth.getModeModels("user-1")).toEqual({
      coding: "@cf/meta/llama-3.1-8b-instruct",
      refactor: "minimax/m3",
    });

    await auth.setModeModel("user-1", "coding", null);
    expect(await auth.getModeModels("user-1")).toEqual({ refactor: "minimax/m3" });
  });

  it("rejects invalid per-mode model id", async () => {
    db.users.push({
      id: "user-1",
      email: "test@example.com",
      password_hash: "hash",
      role: "member",
      model: null,
      mode_models: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    await expect(auth.setModeModel("user-1", "coding", "gpt-4o")).rejects.toThrow(AuthError);
  });

  it("resolveModel falls back mode → global → default", async () => {
    db.users.push({
      id: "user-1",
      email: "test@example.com",
      password_hash: "hash",
      role: "member",
      model: null,
      mode_models: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    // 全部未設定 → デフォルト
    expect(await auth.resolveModel("user-1", "coding")).toBe("minimax/m3");
    // userId 無し（cron）→ デフォルト
    expect(await auth.resolveModel(null, "healing")).toBe("minimax/m3");

    // グローバル設定 → 全モードに波及
    await auth.setModel("user-1", "@cf/meta/llama-3.1-8b-instruct");
    expect(await auth.resolveModel("user-1", "coding")).toBe("@cf/meta/llama-3.1-8b-instruct");
    expect(await auth.resolveModel("user-1", "refactor")).toBe("@cf/meta/llama-3.1-8b-instruct");

    // モード別設定はグローバルより優先
    await auth.setModeModel("user-1", "refactor", "@cf/qwen/qwen2.5-coder-32b-instruct");
    expect(await auth.resolveModel("user-1", "refactor")).toBe("@cf/qwen/qwen2.5-coder-32b-instruct");
    expect(await auth.resolveModel("user-1", "coding")).toBe("@cf/meta/llama-3.1-8b-instruct");
  });

  it("tolerates corrupted mode_models JSON", async () => {
    db.users.push({
      id: "user-1",
      email: "test@example.com",
      password_hash: "hash",
      role: "member",
      model: null,
      mode_models: "{not json",
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    expect(await auth.getModeModels("user-1")).toEqual({});
    expect(await auth.resolveModel("user-1", "coding")).toBe("minimax/m3");
  });
});
