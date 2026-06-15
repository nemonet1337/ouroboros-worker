<script setup lang="ts">
const config = useConfig()
const { api } = useApi()

// State
const repos = ref<{ fullName: string; name: string; owner: string; private: boolean; description: string | null; defaultBranch: string }[]>([])
const branches = ref<{ name: string }[]>([])
const selectedRepo = ref('')
const selectedBranch = ref('')
const reposLoading = ref(false)
const branchesLoading = ref(false)
const repoSearch = ref('')
const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const error = ref('')

const filteredRepos = computed(() => {
  if (!repoSearch.value) return repos.value
  const q = repoSearch.value.toLowerCase()
  return repos.value.filter(r => r.fullName.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q))
})

async function loadRepos() {
  if (!config.gitTokenSet.value) return
  reposLoading.value = true
  error.value = ''
  try {
    const res = await api<{ repos: typeof repos.value; error?: { message: string } }>('/github/repos')
    if (res.error) { error.value = res.error.message; return }
    repos.value = res.repos ?? []
    // Pre-select current configured repo
    const current = config.gitRepository.value
    if (current && repos.value.some(r => r.fullName === current)) {
      selectedRepo.value = current
      await loadBranches(current)
    }
  } catch (e: any) {
    error.value = e?.data?.error?.message ?? 'リポジトリ一覧の取得に失敗しました'
  } finally {
    reposLoading.value = false
  }
}

async function loadBranches(repo: string) {
  if (!repo) { branches.value = []; return }
  branchesLoading.value = true
  error.value = ''
  try {
    const res = await api<{ branches: { name: string }[]; error?: { message: string } }>(`/github/branches?repo=${encodeURIComponent(repo)}`)
    if (res.error) { error.value = res.error.message; return }
    branches.value = res.branches ?? []
    // Set default branch if nothing selected
    if (!selectedBranch.value) {
      const r = repos.value.find(x => x.fullName === repo)
      selectedBranch.value = r?.defaultBranch ?? (branches.value[0]?.name ?? '')
    }
  } catch (e: any) {
    error.value = e?.data?.error?.message ?? 'ブランチ一覧の取得に失敗しました'
  } finally {
    branchesLoading.value = false
  }
}

async function selectRepo(fullName: string) {
  selectedRepo.value = fullName
  selectedBranch.value = ''
  await loadBranches(fullName)
}

async function save() {
  if (!selectedRepo.value) return
  saveStatus.value = 'saving'
  try {
    await api('/config', {
      method: 'PUT',
      body: { selectedRepository: selectedRepo.value, selectedBranch: selectedBranch.value },
    })
    saveStatus.value = 'saved'
  } catch {
    saveStatus.value = 'error'
  } finally {
    setTimeout(() => { saveStatus.value = 'idle' }, 2000)
  }
}

onMounted(async () => {
  // Load stored selection from config
  const stored = await api<Record<string, any>>('/config').catch(() => null)
  if (stored?.selectedRepository) selectedRepo.value = stored.selectedRepository
  if (stored?.selectedBranch) selectedBranch.value = stored.selectedBranch
  await loadRepos()
})
</script>

<template>
  <div class="space-y-4">

    <!-- Token status -->
    <div class="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-mono"
      :class="config.gitTokenSet.value
        ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
        : 'text-gray-500 bg-white/5 border-white/10'"
    >
      <span class="w-2 h-2 rounded-full flex-shrink-0" :class="config.gitTokenSet.value ? 'bg-emerald-400' : 'bg-gray-600'" />
      <span>GitHub Token: {{ config.gitTokenSet.value ? '●●●●●●●● (set)' : 'Not configured' }}</span>
    </div>

    <p v-if="!config.gitTokenSet.value" class="text-[11px] text-gray-500 leading-relaxed">
      Managed via Cloudflare Secrets.<br>
      <code class="font-mono text-gray-400">wrangler secret put GITHUB_TOKEN</code>
    </p>

    <!-- Error -->
    <div v-if="error" class="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">
      <UIcon name="i-heroicons-exclamation-circle" class="w-3.5 h-3.5 flex-shrink-0" />
      {{ error }}
    </div>

    <template v-if="config.gitTokenSet.value">
      <!-- Repository picker -->
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <p class="text-xs font-medium text-gray-400">Repository</p>
          <button
            class="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
            :disabled="reposLoading"
            @click="loadRepos"
          >
            <UIcon name="i-heroicons-arrow-path" class="w-3 h-3" :class="reposLoading ? 'animate-spin' : ''" />
            {{ reposLoading ? '読込中…' : '更新' }}
          </button>
        </div>

        <div v-if="reposLoading && repos.length === 0" class="flex items-center gap-2 text-xs text-gray-500 py-2">
          <UIcon name="i-heroicons-arrow-path" class="w-3.5 h-3.5 animate-spin" />
          リポジトリ一覧を取得中…
        </div>

        <template v-else-if="repos.length > 0">
          <!-- Search -->
          <div class="relative">
            <UIcon name="i-heroicons-magnifying-glass" class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
            <input
              v-model="repoSearch"
              type="text"
              placeholder="リポジトリを検索…"
              class="w-full bg-gray-800 border border-white/10 rounded-lg pl-7 pr-3 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/50"
            />
          </div>

          <!-- Repo list -->
          <div class="max-h-44 overflow-y-auto space-y-0.5 rounded-lg border border-white/10 bg-gray-800/40 p-1">
            <button
              v-for="r in filteredRepos"
              :key="r.fullName"
              class="w-full flex items-start gap-2 px-2.5 py-2 rounded-md text-left transition-colors"
              :class="selectedRepo === r.fullName
                ? 'bg-indigo-500/20 text-indigo-300'
                : 'text-gray-300 hover:bg-white/5 hover:text-gray-100'"
              @click="selectRepo(r.fullName)"
            >
              <UIcon
                :name="r.private ? 'i-heroicons-lock-closed' : 'i-heroicons-code-bracket-square'"
                class="w-3.5 h-3.5 flex-shrink-0 mt-0.5"
                :class="selectedRepo === r.fullName ? 'text-indigo-400' : 'text-gray-500'"
              />
              <div class="min-w-0 flex-1">
                <p class="text-xs font-medium truncate">{{ r.fullName }}</p>
                <p v-if="r.description" class="text-[10px] text-gray-500 truncate mt-0.5">{{ r.description }}</p>
              </div>
              <UIcon v-if="selectedRepo === r.fullName" name="i-heroicons-check" class="w-3.5 h-3.5 text-indigo-400 flex-shrink-0 mt-0.5" />
            </button>
            <p v-if="filteredRepos.length === 0" class="text-xs text-gray-500 px-2.5 py-2">
              一致するリポジトリがありません
            </p>
          </div>
        </template>

        <!-- Fallback: manual input -->
        <div v-else class="space-y-1">
          <input
            v-model="selectedRepo"
            type="text"
            placeholder="owner/repo"
            class="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/50"
          />
          <p class="text-[10px] text-gray-600">GitHub Token が有効になると一覧から選択できます</p>
        </div>
      </div>

      <!-- Branch picker -->
      <div v-if="selectedRepo" class="space-y-2">
        <div class="flex items-center justify-between">
          <p class="text-xs font-medium text-gray-400">Branch</p>
          <span v-if="branchesLoading" class="text-[10px] text-gray-500 flex items-center gap-1">
            <UIcon name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin" />
            読込中
          </span>
        </div>

        <div v-if="branches.length > 0" class="max-h-36 overflow-y-auto space-y-0.5 rounded-lg border border-white/10 bg-gray-800/40 p-1">
          <button
            v-for="b in branches"
            :key="b.name"
            class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left transition-colors"
            :class="selectedBranch === b.name
              ? 'bg-indigo-500/20 text-indigo-300'
              : 'text-gray-300 hover:bg-white/5 hover:text-gray-100'"
            @click="selectedBranch = b.name"
          >
            <UIcon name="i-heroicons-code-bracket" class="w-3 h-3 flex-shrink-0"
              :class="selectedBranch === b.name ? 'text-indigo-400' : 'text-gray-500'" />
            <span class="text-xs font-mono truncate">{{ b.name }}</span>
            <UIcon v-if="selectedBranch === b.name" name="i-heroicons-check" class="w-3 h-3 text-indigo-400 flex-shrink-0 ml-auto" />
          </button>
        </div>

        <input
          v-else
          v-model="selectedBranch"
          type="text"
          placeholder="main"
          class="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/50"
        />
      </div>

      <!-- Save button -->
      <button
        class="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="!selectedRepo || saveStatus === 'saving'"
        @click="save"
      >
        <UIcon
          :name="saveStatus === 'saved' ? 'i-heroicons-check' : saveStatus === 'error' ? 'i-heroicons-x-mark' : 'i-heroicons-cloud-arrow-up'"
          class="w-3.5 h-3.5"
        />
        {{ saveStatus === 'saving' ? '保存中…' : saveStatus === 'saved' ? '保存しました' : saveStatus === 'error' ? 'エラー' : '保存' }}
      </button>
    </template>
  </div>
</template>
