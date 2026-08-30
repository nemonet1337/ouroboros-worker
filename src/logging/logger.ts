import type { LogStore } from "../ports/logstore";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * システムログのベース名に UTC 日付を付け、日次ファイル名にする。
 * 例: `ouroboros.log` → `ouroboros-2026-07-26.log`
 * 既に `YYYY-MM-DD` を含む場合はそのまま（再日付化しない）。
 */
export function dailyLogFile(base: string, now = new Date()): string {
  const day = now.toISOString().slice(0, 10); // UTC YYYY-MM-DD
  if (/\d{4}-\d{2}-\d{2}/.test(base)) {
    return base.endsWith(".log") ? base : `${base}.log`;
  }
  const name = base.endsWith(".log") ? base.slice(0, -4) : base;
  return `${name}-${day}.log`;
}

/**
 * Structured logger that mirrors to the console and appends flat `.log` lines
 * to a LogStore (R2 on Cloudflare). Lines are
 * `ISO-8601 LEVEL [scope] message {json}` for easy grepping.
 *
 * R2 上のシステムログは **UTC 日付ごと** に別ファイルへ書き込む
 * （`ouroboros-YYYY-MM-DD.log`）。日付が変わると自動で新ファイルになる。
 */
export class Logger {
  constructor(
    private readonly store: LogStore,
    private readonly opts: { file?: string; scope?: string; minLevel?: LogLevel; persistLevel?: LogLevel } = {}
  ) {}

  child(scope: string): Logger {
    return new Logger(this.store, {
      ...this.opts,
      scope: this.opts.scope ? `${this.opts.scope}:${scope}` : scope,
    });
  }

  /** 設定されたベース名（日付未付与）。テスト・管理画面用。 */
  get baseFile(): string {
    return this.opts.file ?? "ouroboros.log";
  }

  private async write(level: LogLevel, message: string, meta?: Record<string, unknown>): Promise<void> {
    const min = this.opts.minLevel ?? "info";
    if (LEVEL_ORDER[level] < LEVEL_ORDER[min]) return;

    const ts = new Date().toISOString();
    const scope = this.opts.scope ? ` [${this.opts.scope}]` : "";
    const metaStr = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    const line = `${ts} ${level.toUpperCase()}${scope} ${message}${metaStr}`;

    const consoleFn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    consoleFn(line);

    // info は Workers Logs（console）のみ。R2 は warn/error（管理画面用）。
    const persistLevel = this.opts.persistLevel ?? "warn";
    if (LEVEL_ORDER[level] < LEVEL_ORDER[persistLevel]) return;

    const file = dailyLogFile(this.opts.file ?? "ouroboros.log");
    try {
      await this.store.append(file, line);
    } catch (err) {
      console.error(`[Logger] failed to persist log line: ${(err as Error).message}`);
    }
  }

  debug(message: string, meta?: Record<string, unknown>): Promise<void> {
    return this.write("debug", message, meta);
  }
  info(message: string, meta?: Record<string, unknown>): Promise<void> {
    return this.write("info", message, meta);
  }
  warn(message: string, meta?: Record<string, unknown>): Promise<void> {
    return this.write("warn", message, meta);
  }
  error(message: string, meta?: Record<string, unknown>): Promise<void> {
    return this.write("error", message, meta);
  }
}
