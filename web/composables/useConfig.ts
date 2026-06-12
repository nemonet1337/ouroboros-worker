export type GitService = 'github' | 'gitlab'

export interface AiModel {
  value: string
  label: string
  provider: string
  task?: string
  description?: string
}

export const LANGUAGES = [
  'TypeScript', 'JavaScript', 'Python', 'Go', 'Rust',
  'Java', 'C#', 'C++', 'Ruby', 'PHP', 'Swift', 'Kotlin',
]

// Ouroboros runs exclusively on Cloudflare Workers: the only AI gateway is
// Workers AI. The model list always comes from the binding (GET /models), and
// the only AI credential is the WORKERS_AI_API_TOKEN secret — managed as a
// Worker secret, never through this GUI.
export const WORKERS_AI_SERVICE = { label: 'Cloudflare Workers AI', value: 'workers-ai' }
export const DEFAULT_WORKERS_AI_MODEL = 'minimax/m3'

const gitService = ref<GitService>('github')
const gitPackage = ref('')
const gitToken = ref('')
const selectedLanguages = ref<string[]>(['TypeScript', 'JavaScript'])

const selectedAiService = ref(WORKERS_AI_SERVICE.value)
const selectedModel = ref<AiModel | null>(null)
const isAutoDetecting = ref(false)

const detectedModels = ref<AiModel[]>([])
const isLoadingModels = ref(false)

export function useConfig() {
  const gitServiceOptions = [
    { label: 'GitHub', value: 'github' },
    { label: 'GitLab', value: 'gitlab' },
  ]

  const availableServices = computed(() => [WORKERS_AI_SERVICE])

  // Every model served by Workers AI is selectable.
  const availableModels = computed<AiModel[]>(() => detectedModels.value)

  function findModel(value: string): AiModel | null {
    return detectedModels.value.find(m => m.value === value) ?? null
  }

  async function autoDetectLanguages() {
    isAutoDetecting.value = true
    await new Promise(r => setTimeout(r, 900))
    selectedLanguages.value = ['TypeScript', 'JavaScript', 'Python', 'Go']
    isAutoDetecting.value = false
  }

  const { api } = useApi()

  /** Discover every model the Workers AI binding serves. */
  async function loadModels() {
    isLoadingModels.value = true
    try {
      const res = await api<{ provider: string; models: AiModel[] }>('/models')
      detectedModels.value = res.models ?? []
    } catch {
      // keep the current (possibly empty) list
    } finally {
      isLoadingModels.value = false
    }
  }

  async function saveConfig() {
    const body: Record<string, unknown> = {
      gitService: gitService.value,
      gitPackage: gitPackage.value,
      gitToken: gitToken.value,
      selectedLanguages: selectedLanguages.value,
      selectedAiService: WORKERS_AI_SERVICE.value,
      selectedModelValue: selectedModel.value?.value ?? null,
    }
    await api('/config', { method: 'PUT', body })
  }

  async function loadConfig() {
    await loadModels()
    const stored = await api<Record<string, any>>('/config').catch(() => null)
    if (!stored || typeof stored !== 'object') return
    if (stored.gitService) gitService.value = stored.gitService
    if (stored.gitPackage) gitPackage.value = stored.gitPackage
    if (stored.gitToken) gitToken.value = stored.gitToken
    if (Array.isArray(stored.selectedLanguages)) selectedLanguages.value = stored.selectedLanguages
    const modelValue = stored.selectedModelValue || DEFAULT_WORKERS_AI_MODEL
    selectedModel.value = findModel(modelValue)
      ?? { value: modelValue, label: modelValue, provider: WORKERS_AI_SERVICE.value }
  }

  return {
    gitService,
    gitServiceOptions,
    gitPackage,
    gitToken,
    selectedLanguages,
    selectedAiService,
    selectedModel,
    isAutoDetecting,
    detectedModels,
    isLoadingModels,
    availableServices,
    availableModels,
    autoDetectLanguages,
    loadModels,
    saveConfig,
    loadConfig,
  }
}
