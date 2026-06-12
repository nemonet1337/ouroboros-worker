export type GitService = 'github' | 'gitlab'
export type DeployTarget = 'local' | 'cloudflare'

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

// Static fallbacks for the local deploy when live discovery (GET /models)
// is unavailable. On Cloudflare the list always comes from the Workers AI
// binding — these are never used there.
export const AI_MODELS_BY_SERVICE: Record<string, AiModel[]> = {
  anthropic: [
    { value: 'claude-opus-4-7', label: 'Claude Opus 4.7', provider: 'anthropic' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'anthropic' },
    { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', provider: 'anthropic' },
  ],
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o', provider: 'openai' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', provider: 'openai' },
    { value: 'o1-preview', label: 'o1 Preview', provider: 'openai' },
    { value: 'o1-mini', label: 'o1 Mini', provider: 'openai' },
    { value: 'o3-mini', label: 'o3 Mini', provider: 'openai' },
  ],
  gemini: [
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', provider: 'gemini' },
    { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', provider: 'gemini' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', provider: 'gemini' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', provider: 'gemini' },
  ],
  openrouter: [
    { value: 'openrouter/auto', label: 'Auto (Best Available)', provider: 'openrouter' },
    { value: 'meta-llama/llama-3.1-70b-instruct', label: 'Llama 3.1 70B Instruct', provider: 'openrouter' },
    { value: 'meta-llama/llama-3.1-8b-instruct', label: 'Llama 3.1 8B Instruct', provider: 'openrouter' },
    { value: 'mistralai/mistral-large', label: 'Mistral Large', provider: 'openrouter' },
    { value: 'mistralai/mixtral-8x7b-instruct', label: 'Mixtral 8x7B Instruct', provider: 'openrouter' },
    { value: 'google/gemma-2-9b-it', label: 'Gemma 2 9B IT', provider: 'openrouter' },
    { value: 'deepseek/deepseek-chat', label: 'DeepSeek Chat', provider: 'openrouter' },
  ],
}

const WORKERS_AI_SERVICE = { label: 'Cloudflare Workers AI', value: 'workers-ai' }

const gitService = ref<GitService>('github')
const gitPackage = ref('')
const gitToken = ref('')
const selectedLanguages = ref<string[]>(['TypeScript', 'JavaScript'])

const anthropicToken = ref('')
const openaiToken = ref('')
const geminiToken = ref('')
const openrouterToken = ref('')

const selectedAiService = ref('')
const selectedModel = ref<AiModel | null>(null)
const isAutoDetecting = ref(false)

const deployTarget = ref<DeployTarget>('local')
const detectedModels = ref<AiModel[]>([])
const isLoadingModels = ref(false)

export function useConfig() {
  const gitServiceOptions = [
    { label: 'GitHub', value: 'github' },
    { label: 'GitLab', value: 'gitlab' },
  ]

  const isCloudflare = computed(() => deployTarget.value === 'cloudflare')

  const availableServices = computed(() => {
    // Cloudflare deploy: Workers AI is the only gateway — no tokens involved.
    if (isCloudflare.value) return [WORKERS_AI_SERVICE]
    const services: { label: string; value: string }[] = []
    if (anthropicToken.value.trim()) services.push({ label: 'Anthropic', value: 'anthropic' })
    if (openaiToken.value.trim()) services.push({ label: 'OpenAI', value: 'openai' })
    if (geminiToken.value.trim()) services.push({ label: 'Google Gemini', value: 'gemini' })
    if (openrouterToken.value.trim()) services.push({ label: 'OpenRouter', value: 'openrouter' })
    return services
  })

  const availableModels = computed<AiModel[]>(() => {
    if (isCloudflare.value) return detectedModels.value
    if (!selectedAiService.value) return []
    const detected = detectedModels.value.filter(m => m.provider === selectedAiService.value)
    if (detected.length > 0) return detected
    return AI_MODELS_BY_SERVICE[selectedAiService.value] ?? []
  })

  function findModel(value: string): AiModel | null {
    return (
      detectedModels.value.find(m => m.value === value)
      ?? Object.values(AI_MODELS_BY_SERVICE).flat().find(m => m.value === value)
      ?? null
    )
  }

  watch(selectedAiService, () => {
    if (selectedModel.value && !availableModels.value.some(m => m.value === selectedModel.value?.value)) {
      selectedModel.value = null
    }
  })

  watch(availableServices, (services) => {
    if (isCloudflare.value) {
      selectedAiService.value = WORKERS_AI_SERVICE.value
      return
    }
    if (selectedAiService.value && !services.some(s => s.value === selectedAiService.value)) {
      selectedAiService.value = ''
      selectedModel.value = null
    }
  })

  async function autoDetectLanguages() {
    isAutoDetecting.value = true
    await new Promise(r => setTimeout(r, 900))
    selectedLanguages.value = ['TypeScript', 'JavaScript', 'Python', 'Go']
    isAutoDetecting.value = false
  }

  const { api } = useApi()

  /** Discover the deploy target and every model the active gateway serves. */
  async function loadModels() {
    isLoadingModels.value = true
    try {
      const res = await api<{ deployTarget: DeployTarget; provider: string; models: AiModel[] }>('/models')
      deployTarget.value = res.deployTarget
      detectedModels.value = res.models ?? []
      if (res.deployTarget === 'cloudflare') {
        selectedAiService.value = WORKERS_AI_SERVICE.value
      }
    } catch {
      // keep static fallbacks (local) / empty list (cloudflare)
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
      selectedAiService: selectedAiService.value,
      selectedModelValue: selectedModel.value?.value ?? null,
    }
    // External gateway tokens only exist on the local deploy; the Cloudflare
    // API rejects them outright.
    if (!isCloudflare.value) {
      body.anthropicToken = anthropicToken.value
      body.openaiToken = openaiToken.value
      body.geminiToken = geminiToken.value
      body.openrouterToken = openrouterToken.value
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
    if (!isCloudflare.value) {
      if (stored.anthropicToken) anthropicToken.value = stored.anthropicToken
      if (stored.openaiToken) openaiToken.value = stored.openaiToken
      if (stored.geminiToken) geminiToken.value = stored.geminiToken
      if (stored.openrouterToken) openrouterToken.value = stored.openrouterToken
    }
    if (stored.selectedAiService && !isCloudflare.value) selectedAiService.value = stored.selectedAiService
    if (stored.selectedModelValue) {
      selectedModel.value = findModel(stored.selectedModelValue)
        ?? { value: stored.selectedModelValue, label: stored.selectedModelValue, provider: selectedAiService.value }
    }
  }

  return {
    gitService,
    gitServiceOptions,
    gitPackage,
    gitToken,
    selectedLanguages,
    anthropicToken,
    openaiToken,
    geminiToken,
    openrouterToken,
    selectedAiService,
    selectedModel,
    isAutoDetecting,
    deployTarget,
    isCloudflare,
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
