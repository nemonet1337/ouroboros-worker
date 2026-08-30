import { InspectionFile } from "../types";

const TRUNCATION_LINE_LIMIT = 500;

function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).byteLength;
}

/**
 * Truncate files that exceed maxSizeBytes so we don't overflow the model's context.
 * A truncation notice is appended so the AI knows the file was cut.
 */
export function preprocessFiles(
  files: InspectionFile[],
  maxSizeBytes: number
): InspectionFile[] {
  return files.map((f) => {
    if (utf8Bytes(f.content) <= maxSizeBytes) return f;

    const lines = f.content.split("\n");
    const truncated =
      lines.slice(0, TRUNCATION_LINE_LIMIT).join("\n") +
      `\n\n// [TRUNCATED: ${lines.length} total lines, analysis based on first ${TRUNCATION_LINE_LIMIT}]`;

    return { path: f.path, content: truncated };
  });
}

/**
 * SHA-256 over all (path + content) pairs in order.
 * Attached to InspectionResult (not used as an AI skip cache).
 */
export async function computeContentHash(files: InspectionFile[]): Promise<string> {
  const payload = files.map((f) => `${f.path}\0${f.content}`).join("\n");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}
