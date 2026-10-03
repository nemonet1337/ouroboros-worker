export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * 構造化ロガー。出力先は Cloudflare Workers Logs（`console`）のみ。
 *
 * R2 への永続化は廃止した。永続ログが必要な場合は
 * `wrangler tail` または Cloudflare Observability の Logs を使う。
 *
 * 行フォーマットは `ISO-8601 LEVEL [scope] message {json}`。
 */
export class Logger {
  constructor(private readonly opts: { scope?: string; minLevel?: LogLevel } = {}) {}

  child(scope: string): Logger {
    return new Logger({
      ...this.opts,
      scope: this.opts.scope ? `${this.opts.scope}:${scope}` : scope,
    });
  }

  private write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    const min = this.opts.minLevel ?? "info";
    if (LEVEL_ORDER[level] < LEVEL_ORDER[min]) return;

    const ts = new Date().toISOString();
    const scope = this.opts.scope ? ` [${this.opts.scope}]` : "";
    const metaStr = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    const line = `${ts} ${level.toUpperCase()}${scope} ${message}${metaStr}`;

    const consoleFn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    consoleFn(line);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.write("debug", message, meta);
  }
  info(message: string, meta?: Record<string, unknown>): void {
    this.write("info", message, meta);
  }
  warn(message: string, meta?: Record<string, unknown>): void {
    this.write("warn", message, meta);
  }
  error(message: string, meta?: Record<string, unknown>): void {
    this.write("error", message, meta);
  }
}