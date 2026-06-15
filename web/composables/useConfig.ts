export const LANGUAGES = [
  'TypeScript', 'JavaScript', 'Python', 'Go', 'Rust',
  'Java', 'C#', 'C++', 'Ruby', 'PHP', 'Swift', 'Kotlin',
]

const gitRepository = ref('')
const gitTokenSet = ref(false)
const selectedLanguages = ref<string[]>(['TypeScript', 'JavaScript'])
const isAutoDetecting = ref(false)

export function useConfig() {
  async function autoDetectLanguages() {
    isAutoDetecting.value = true
    await new Promise(r => setTimeout(r, 900))
    selectedLanguages.value = ['TypeScript', 'JavaScript', 'Python', 'Go']
    isAutoDetecting.value = false
  }

  const { api } = useApi()

  async function saveConfig() {
    await api('/config', {
      method: 'PUT',
      body: { selectedLanguages: selectedLanguages.value },
    })
  }

  async function loadConfig() {
    const stored = await api<Record<string, any>>('/config').catch(() => null)
    if (!stored || typeof stored !== 'object') return
    if (typeof stored.gitRepository === 'string') gitRepository.value = stored.gitRepository
    if (typeof stored.gitTokenSet === 'boolean') gitTokenSet.value = stored.gitTokenSet
    if (Array.isArray(stored.selectedLanguages)) selectedLanguages.value = stored.selectedLanguages
  }

  return {
    gitRepository,
    gitTokenSet,
    selectedLanguages,
    isAutoDetecting,
    autoDetectLanguages,
    saveConfig,
    loadConfig,
  }
}
