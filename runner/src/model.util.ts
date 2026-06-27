export function isWorkersAiModelId(id: string): boolean {
  return id.startsWith("@") || /^[a-z0-9][\w.-]*\/.+/i.test(id);
}
