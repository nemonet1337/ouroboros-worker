import type { LogStore } from "../ports";

/**
 * LogStore backed by Cloudflare R2. R2 has no append, so each log line is
 * written as its own immutable object under `<file>/<ts>-<rand>`. Reads
 * concatenate the objects under a file's prefix in chronological order.
 */
export class R2LogStore implements LogStore {
  readonly kind = "r2" as const;

  constructor(private readonly bucket: R2Bucket) {}

  private prefix(file: string): string {
    return file.endsWith(".log") ? file : `${file}.log`;
  }

  async append(file: string, line: string): Promise<void> {
    const key = `${this.prefix(file)}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    await this.bucket.put(key, line + "\n");
  }

  async list(): Promise<string[]> {
    const listed = await this.bucket.list();
    const files = new Set<string>();
    for (const obj of listed.objects) {
      const slash = obj.key.indexOf(".log/");
      if (slash >= 0) files.add(obj.key.slice(0, slash + 4));
    }
    return [...files];
  }

  async read(file: string, maxBytes?: number): Promise<string> {
    const listed = await this.bucket.list({ prefix: `${this.prefix(file)}/` });
    const keys = listed.objects.map((o) => o.key).sort();
    let out = "";
    for (const key of keys) {
      const obj = await this.bucket.get(key);
      if (obj) out += await obj.text();
    }
    return maxBytes && out.length > maxBytes ? out.slice(out.length - maxBytes) : out;
  }
}
