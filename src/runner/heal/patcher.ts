export async function applyPatch(_opts: { patches: unknown[] }): Promise<{ success: boolean }> {
  return { success: false };
}
export async function validatePatch(_opts: { patch: unknown }): Promise<boolean> {
  return false;
}
