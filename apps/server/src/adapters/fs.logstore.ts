import { appendFile, mkdir, readdir, readFile, stat, open } from "node:fs/promises";
import { join, basename } from "node:path";
import type { LogStore } from "@ouroboros/core";

/** LogStore that appends flat .log lines to a local directory. */
export class FsLogStore implements LogStore {
  readonly kind = "fs" as const;
  private ready: Promise<void>;

  constructor(private readonly dir: string) {
    this.ready = mkdir(dir, { recursive: true }).then(() => undefined);
  }

  private safe(file: string): string {
    const name = basename(file);
    return join(this.dir, name.endsWith(".log") ? name : `${name}.log`);
  }

  async append(file: string, line: string): Promise<void> {
    await this.ready;
    await appendFile(this.safe(file), line + "\n", "utf-8");
  }

  async list(): Promise<string[]> {
    await this.ready;
    const entries = await readdir(this.dir);
    return entries.filter((e) => e.endsWith(".log"));
  }

  async read(file: string, maxBytes?: number): Promise<string> {
    await this.ready;
    const path = this.safe(file);
    if (!maxBytes) return readFile(path, "utf-8");
    const { size } = await stat(path);
    const start = Math.max(0, size - maxBytes);
    const fh = await open(path, "r");
    try {
      const buf = Buffer.alloc(size - start);
      await fh.read(buf, 0, buf.length, start);
      return buf.toString("utf-8");
    } finally {
      await fh.close();
    }
  }
}
