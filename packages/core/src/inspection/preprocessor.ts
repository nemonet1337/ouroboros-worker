import { createHash } from "node:crypto";
import { InspectionFile } from "../types/inspection.types";

const TRUNCATION_LINE_LIMIT = 500;

/**
 * Truncate files that exceed maxSizeBytes so we don't overflow the model's context.
 * A truncation notice is appended so the AI knows the file was cut.
 */
export function preprocessFiles(
  files: InspectionFile[],
  maxSizeBytes: number
): InspectionFile[] {
  return files.map((f) => {
    if (Buffer.byteLength(f.content, "utf8") <= maxSizeBytes) return f;

    const lines = f.content.split("\n");
    const truncated =
      lines.slice(0, TRUNCATION_LINE_LIMIT).join("\n") +
      `\n\n// [TRUNCATED: ${lines.length} total lines, analysis based on first ${TRUNCATION_LINE_LIMIT}]`;

    return { path: f.path, content: truncated };
  });
}

/**
 * SHA-256 over all (path + content) pairs in order.
 * Used as a cache key so unchanged files can skip re-inspection.
 */
export function computeContentHash(files: InspectionFile[]): string {
  const h = createHash("sha256");
  for (const f of files) {
    h.update(f.path);
    h.update(f.content);
  }
  return `sha256:${h.digest("hex")}`;
}
