import type { LogStore } from "../ports";

/**
 * LogStore backed by Cloudflare R2. R2 has no append, so each log line is
 * written as its own immutable object under `<file>/<ts>-<rand>`. Reads
 * concatenate the objects under a file's prefix in chronological order.
 *
 * システムログは Logger 側で日次ファイル名（`ouroboros-YYYY-MM-DD.log`）に
 * 解決されてから渡される。list() はその日次ファイルを列挙する。
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
    const files = new Set<string>();
    let cursor: string | undefined;
    // ページネーションで全プレフィックスを拾う（日次ファイルが増えても漏れないように）
    do {
      const listed = await this.bucket.list({ cursor, limit: 1000 });
      for (const obj of listed.objects) {
        const slash = obj.key.indexOf(".log/");
        if (slash >= 0) files.add(obj.key.slice(0, slash + 4));
      }
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
    // 新しい日付が上に来るよう降順（名前に YYYY-MM-DD が入る前提）
    return [...files].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
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
