/**
 * Append-only sink for flat `.log` telemetry files.
 * Implementation: R2LogStore (Cloudflare R2).
 */
export interface LogStore {
  readonly kind: "r2";
  /** Append one already-formatted log line (newline added by the store). */
  append(file: string, line: string): Promise<void>;
  /** List available log file names. */
  list(): Promise<string[]>;
  /** Read back a log file's contents (most recent `maxBytes` if given). */
  read(file: string, maxBytes?: number): Promise<string>;
}
