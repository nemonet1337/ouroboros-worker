// Centralised API client. All GUI requests go through here so the base path
// (/api/v1) and credential handling are consistent across the SPA.
export function useApi() {
  const base = (useRuntimeConfig().public.apiBase as string) || '/api/v1'

  function api<T>(path: string, opts: Record<string, unknown> = {}): Promise<T> {
    const url = path.startsWith('http') ? path : `${base}${path}`
    return $fetch<T>(url, { credentials: 'include', ...opts })
  }

  return { api, apiBase: base }
}
