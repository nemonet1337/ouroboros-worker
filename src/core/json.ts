/** JSON 文字列を安全にparseする。失敗時・空文字時は fallback を返す。 */
export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
