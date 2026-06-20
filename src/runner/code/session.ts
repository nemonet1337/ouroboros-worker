export async function initSession(_opts: { sessionId: string }): Promise<string> {
  return "";
}
export async function getStatus(_opts: { sessionId: string }): Promise<{ branch: string; changedFiles: string[] }> {
  return { branch: "", changedFiles: [] };
}
