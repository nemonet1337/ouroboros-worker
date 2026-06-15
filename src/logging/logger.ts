import type { LogStore } from "../ports/logstore";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Structured logger that mirrors to the console and appends flat `.log` lines
 * to a LogStore (local directory self-hosted, R2 on Cloudflare). Lines are
 * `ISO-8601 LEVEL [scope] message {json}` for easy grepping.
 */
export class Logger {
  constructor(
    private readonly store: LogStore,
    private readonly opts: { file?: string; scope?: string; minLevel?: LogLevel } = {}
  ) {}

  child(scope: string): Logger {
    return new Logger(this.store, {
      ...this.opts,
      scope: this.opts.scope ? `${this.opts.scope}:${scope}` : scope,
    });
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

    const file = this.opts.file ?? "ouroboros.log";
    try {
      await this.store.append(file, line);
    } catch (err) {
      console.error(`[Logger] failed to persist log line: ${(err as Error).message}`);
    }
  }

  debug(message: string, meta?: Record<string, unknown>): Promise<void> { return this.write("debug", message, meta); }
  info(message: string, meta?: Record<string, unknown>): Promise<void> { return this.write("info", message, meta); }
  warn(message: string, meta?: Record<string, unknown>): Promise<void> { return this.write("warn", message, meta); }
  error(message: string, meta?: Record<string, unknown>): Promise<void> { return this.write("error", message, meta); }
}
