<script setup lang="ts">
definePageMeta({ layout: 'default' })

const LANGUAGES = [
  'typescript','javascript','python','go','rust','java','csharp','cpp','ruby','flutter',
]

const form = reactive({
  language: 'typescript',
  projectContext: '',
  files: [{ path: 'src/index.ts', content: '' }],
})

const loading = ref(false)
const result = ref<any>(null)
const error = ref('')
const selectedFindingId = ref<string | null>(null)

const { api } = useApi()

// Score history chart
const { data: history, refresh: refreshHistory } = await useAsyncData('inspection-history', () =>
  api<any[]>('/history').catch(() => []),
)

// Selected finding's recommendation
const selectedRecommendation = computed(() => {
  if (!result.value || !selectedFindingId.value) return null
  return result.value.recommendations.find((r: any) => r.findingId === selectedFindingId.value) ?? null
})

function addFile() {
  form.files.push({ path: `src/file${form.files.length + 1}.ts`, content: '' })
}
function removeFile(i: number) {
  if (form.files.length > 1) form.files.splice(i, 1)
}

async function inspect() {
  if (!form.files.some(f => f.content.trim())) {
    error.value = 'コードを入力してください'
    return
  }
  loading.value = true; error.value = ''; result.value = null; selectedFindingId.value = null
  try {
    result.value = await api('/inspect', {
      method: 'POST',
      body: { language: form.language, files: form.files, projectContext: form.projectContext },
    })
    // Refresh history
    await refreshHistory()
  } catch (e: any) {
    error.value = e?.data?.error?.message ?? e?.data?.message ?? e?.message ?? 'インスペクションに失敗しました'
  } finally {
    loading.value = false
  }
}

function onFindingSelect(finding: any) {
  selectedFindingId.value = finding.id
}

const dimensions = computed(() => {
  if (!result.value) return []
  return Object.entries(result.value.scoreCard.breakdown).map(([key, val]: [string, any]) => ({
    key,
    label: { security: 'セキュリティ', performance: 'パフォーマンス', redundancy: '冗長性', readability: '可読性', design: '設計', correctness: '正確性' }[key] ?? key,
    score: val.score, weight: val.weight, summary: val.summary,
  }))
})

// Sample code for quick demo
const SAMPLE_CODE: Record<string, string> = {
  typescript: `// ユーザー管理サービス
export class UserService {
  private users: any[] = []

  // TODO: キャッシュを実装する
  async getUsersByRole(roles: string[]): Promise<any[]> {
    const result: any[] = []
    for (const role of roles) {
      for (const user of this.users) {
        if (user.role === role) {
          result.push(user)
        }
      }
    }
    return result
  }

  async processUsers(data: any): Promise<any> {
    // FIXME: エラーハンドリングが不完全
    const processed = data.map((item: any) => ({
      id: item.id,
      name: item && item.profile && item.profile.displayName,
      role: item.role,
    }))
    return processed
  }
}`,
  python: `# ユーザー処理モジュール
from typing import List, Dict, Any

class UserProcessor:
    def __init__(self):
        self.users: List[Dict] = []
        self.cache: Dict = {}

    # TODO: インデックスを使用して高速化
    def get_users_by_role(self, roles: List[str]) -> List[Dict]:
        result = []
        for role in roles:
            for user in self.users:
                if user.get('role') == role:
                    result.append(user)
        return result

    def process(self, data: Any) -> Any:
        # FIXME: 型チェックが必要
        return [{'id': d['id'], 'name': d.get('name')} for d in data]`,
}

function loadSample() {
  form.files[0].content = SAMPLE_CODE[form.language] ?? SAMPLE_CODE.typescript
}
</script>

<template>
  <div class="flex-1 flex gap-4 max-w-screen-2xl mx-auto w-full px-4 py-4 overflow-hidden">

    <!-- LEFT: Input form -->
    <aside class="w-80 xl:w-96 flex-shrink-0 flex flex-col gap-3 overflow-y-auto pb-4">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-gray-300">コードを入力</h2>
        <button class="text-xs text-indigo-400 hover:text-indigo-300" @click="loadSample">サンプルを使う</button>
      </div>

      <!-- Language selector -->
      <UCard :ui="{ base: 'bg-gray-900 border border-white/10', body: { padding: 'p-3' } }">
        <div class="space-y-2">
          <label class="text-xs text-gray-400">言語</label>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="lang in LANGUAGES" :key="lang"
              @click="form.language = lang"
              class="px-2 py-0.5 rounded text-xs border transition-colors capitalize"
              :class="form.language === lang
                ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                : 'border-white/10 text-gray-400 hover:text-gray-200'"
            >{{ lang }}</button>
          </div>
        </div>
      </UCard>

      <!-- Project context -->
      <UCard :ui="{ base: 'bg-gray-900 border border-white/10', body: { padding: 'p-3' } }">
        <div class="space-y-1.5">
          <label class="text-xs text-gray-400">プロジェクトコンテキスト（任意）</label>
          <textarea
            v-model="form.projectContext"
            rows="2"
            placeholder="このコードの役割や背景を記述するとAIの精度が向上します"
            class="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-300 placeholder-gray-600 resize-none focus:outline-none focus:border-indigo-500/50"
          />
        </div>
      </UCard>

      <!-- File inputs -->
      <div v-for="(file, i) in form.files" :key="i" class="space-y-1">
        <div class="flex items-center gap-2">
          <input
            v-model="file.path"
            class="flex-1 bg-gray-800 border border-white/10 rounded px-2 py-1 text-xs font-mono text-gray-300 focus:outline-none focus:border-indigo-500/50"
          />
          <button v-if="form.files.length > 1" @click="removeFile(i)" class="text-gray-600 hover:text-red-400">
            <UIcon name="i-heroicons-x-mark" class="w-3.5 h-3.5" />
          </button>
        </div>
        <textarea
          v-model="file.content"
          rows="14"
          :placeholder="`// ${file.path} の内容を貼り付けてください`"
          class="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2.5 text-xs font-mono text-gray-300 placeholder-gray-700 resize-none focus:outline-none focus:border-indigo-500/50 leading-relaxed"
        />
      </div>

      <button
        class="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        @click="addFile"
      >
        <UIcon name="i-heroicons-plus" class="w-3.5 h-3.5" />
        ファイルを追加
      </button>

      <p v-if="error" class="text-xs text-red-400 rounded-lg bg-red-900/20 border border-red-500/20 p-2">{{ error }}</p>

      <UButton
        block color="indigo" size="md" :loading="loading"
        @click="inspect"
      >
        <UIcon name="i-heroicons-magnifying-glass" class="w-4 h-4" />
        インスペクション実行
      </UButton>
    </aside>

    <!-- RIGHT: Results -->
    <main class="flex-1 overflow-y-auto pb-4 space-y-4 min-w-0">

      <!-- Score trend (always visible) -->
      <UCard :ui="{ base: 'bg-gray-900 border border-white/10', header: { base: 'border-b border-white/10 py-3' }, body: { padding: 'p-4' } }">
        <template #header>
          <div class="flex items-center gap-2 text-sm font-medium text-gray-200">
            <UIcon name="i-heroicons-chart-bar-square" class="w-4 h-4 text-indigo-400" />
            スコア推移
          </div>
        </template>
        <InspectionScoreTrendChart :history="(history as any[]) ?? []" />
      </UCard>

      <!-- Loading state -->
      <div v-if="loading" class="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
        <div class="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p class="text-sm">AIがコードを解析中です...</p>
      </div>

      <!-- Empty state -->
      <div v-else-if="!result" class="flex flex-col items-center justify-center py-20 gap-3 text-gray-600">
        <UIcon name="i-heroicons-magnifying-glass" class="w-12 h-12" />
        <p class="text-sm">コードを入力してインスペクションを実行してください</p>
      </div>

      <!-- Results -->
      <template v-else>
        <!-- Score overview -->
        <UCard :ui="{ base: 'bg-gray-900 border border-white/10', header: { base: 'border-b border-white/10 py-3' }, body: { padding: 'p-4' } }">
          <template #header>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 text-sm font-medium text-gray-200">
                <UIcon name="i-heroicons-star" class="w-4 h-4 text-amber-400" />
                インスペクション結果
              </div>
              <div class="flex items-center gap-2 text-xs text-gray-500">
                <span>{{ result.language }}</span>
                <span>{{ result.durationMs }}ms</span>
              </div>
            </div>
          </template>
          <div class="flex gap-6 items-start">
            <InspectionScoreGauge :score="result.scoreCard.overall" :grade="result.scoreCard.grade" />
            <div class="flex-1 min-w-0">
              <InspectionScoreBreakdown :dimensions="dimensions" />
            </div>
          </div>
          <p class="mt-4 text-xs text-gray-400 leading-relaxed border-t border-white/10 pt-3">{{ result.summary }}</p>
        </UCard>

        <!-- Findings + Diff viewer -->
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <!-- Findings -->
          <UCard :ui="{ base: 'bg-gray-900 border border-white/10', header: { base: 'border-b border-white/10 py-3' }, body: { padding: 'p-4' } }">
            <template #header>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2 text-sm font-medium text-gray-200">
                  <UIcon name="i-heroicons-bug-ant" class="w-4 h-4 text-red-400" />
                  指摘事項
                </div>
                <UBadge :label="`${result.findings.length}件`" color="red" variant="subtle" size="xs" />
              </div>
            </template>
            <InspectionFindingsList
              :findings="result.findings"
              @select="onFindingSelect"
            />
          </UCard>

          <!-- Diff viewer -->
          <UCard :ui="{ base: 'bg-gray-900 border border-white/10', header: { base: 'border-b border-white/10 py-3' }, body: { padding: 'p-4' } }">
            <template #header>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2 text-sm font-medium text-gray-200">
                  <UIcon name="i-heroicons-light-bulb" class="w-4 h-4 text-emerald-400" />
                  改善案
                </div>
                <UBadge :label="`${result.recommendations.length}件`" color="emerald" variant="subtle" size="xs" />
              </div>
            </template>
            <div v-if="!selectedRecommendation" class="flex flex-col items-center justify-center py-12 gap-2 text-gray-600">
              <UIcon name="i-heroicons-cursor-arrow-rays" class="w-8 h-8" />
              <p class="text-xs">指摘事項の「改善案を見る」をクリックしてください</p>
            </div>
            <InspectionDiffViewer v-else :recommendation="selectedRecommendation" />
          </UCard>
        </div>
      </template>
    </main>
  </div>
</template>
