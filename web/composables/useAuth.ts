interface AuthUser {
  id: string
  email: string
  role: 'admin' | 'member'
}

const userState = () => useState<AuthUser | null>('auth-user', () => null)
const loadedState = () => useState<boolean>('auth-loaded', () => false)

export function useAuth() {
  const user = userState()
  const loaded = loadedState()
  const { api } = useApi()

  async function fetchMe(): Promise<void> {
    try {
      const res = await api<{ user: AuthUser }>('/auth/me')
      user.value = res.user
    } catch {
      user.value = null
    } finally {
      loaded.value = true
    }
  }

  async function login(email: string, password: string): Promise<void> {
    const res = await api<{ user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    user.value = res.user
  }

  async function register(email: string, password: string): Promise<void> {
    const res = await api<{ user: AuthUser }>('/auth/register', {
      method: 'POST',
      body: { email, password },
    })
    user.value = res.user
  }

  async function logout(): Promise<void> {
    await api('/auth/logout', { method: 'POST' })
    user.value = null
    await navigateTo('/login')
  }

  return { user, loaded, fetchMe, login, register, logout, api }
}
