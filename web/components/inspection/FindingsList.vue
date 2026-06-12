<script setup lang="ts">
interface Finding {
  id: string
  category: string
  severity: string
  title: string
  description: string
  location: { file: string; startLine: number; endLine: number; snippet: string }
  impact: string
  scorePenalty: number
  hasRecommendation: boolean
}

const props = defineProps<{ findings: Finding[] }>()
const emit = defineEmits<{ (e: 'select', finding: Finding): void }>()

const selectedSeverity = ref<string>('all')
const selectedCategory = ref<string>('all')
const expandedIds = ref<Set<string>>(new Set())
const searchQuery = ref('')

const severities = ['all', 'critical', 'high', 'medium', 'low', 'info']
const categories = computed(() => {
  const cats = [...new Set(props.findings.map(f => f.category))]
  return ['all', ...cats]
})

const filtered = computed(() =>
  props.findings.filter(f =>
    (selectedSeverity.value === 'all' || f.severity === selectedSeverity.value) &&
    (selectedCategory.value === 'all' || f.category === selectedCategory.value) &&
    (
      !searchQuery.value ||
      f.title.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      f.location.file.toLowerCase().includes(searchQuery.value.toLowerCase())
    )
  )
)

const allExpanded = computed(() => filtered.value.length > 0 && filtered.value.every(f => expandedIds.value.has(f.id)))

function expandAll() { expandedIds.value = new Set(filtered.value.map(f => f.id)) }
function collapseAll() { expandedIds.value = new Set() }

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'red', high: 'orange', medium: 'amber', low: 'blue', info: 'gray',
}
const SEVERITY_ICON: Record<string, string> = {
  critical: 'i-heroicons-x-circle',
  high:     'i-heroicons-exclamation-triangle',
  medium:   'i-heroicons-exclamation-circle',
  low:      'i-heroicons-information-circle',
  info:     'i-heroicons-chat-bubble-left',
}
const CATEGORY_ICON: Record<string, string> = {
  security:    'i-heroicons-shield-check',
  performance: 'i-heroicons-bolt',
  redundancy:  'i-heroicons-document-duplicate',
  readability: 'i-heroicons-book-open',
  design:      'i-heroicons-squares-2x2',
  correctness: 'i-heroicons-check-badge',
}

function toggle(id: string) {
  const s = new Set(expandedIds.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  expandedIds.value = s
}

const countBySeverity = computed(() => {
  const map: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0, all: props.findings.length }
  props.findings.forEach(f => { if (map[f.severity] !== undefined) map[f.severity]++ })
  return map
})
</script>

<template>
  <div class="space-y-3">
    <!-- Search -->
    <div class="relative">
      <UIcon name="i-heroicons-magnifying-glass" class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
      <input
        v-model="searchQuery"
        placeholder="指摘事項を検索…"
        class="w-full bg-gray-800 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-indigo-500/50"
      />
    </div>

    <!-- Filters + expand/collapse -->
    <div class="flex items-start gap-2 flex-wrap">
      <div class="flex gap-1 flex-wrap flex-1">
        <button
          v-for="s in severities" :key="s"
          class="px-2 py-0.5 rounded text-xs border transition-colors"
          :class="selectedSeverity === s
            ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
            : 'border-white/10 text-gray-400 hover:text-gray-200'"
          @click="selectedSeverity = s"
        >
          {{ s }}
          <span v-if="countBySeverity[s] !== undefined" class="opacity-60 ml-0.5">({{ countBySeverity[s] }})</span>
        </button>
      </div>
      <button
        class="flex-shrink-0 px-2 py-0.5 text-xs border border-white/10 text-gray-400 hover:text-gray-200 rounded transition-colors"
        @click="allExpanded ? collapseAll() : expandAll()"
      >
        {{ allExpanded ? '⊖ Collapse' : '⊕ Expand all' }}
      </button>
    </div>

    <div class="flex gap-1 flex-wrap">
      <button
        v-for="c in categories" :key="c"
        class="px-2 py-0.5 rounded text-xs border transition-colors capitalize"
        :class="selectedCategory === c
          ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
          : 'border-white/10 text-gray-400 hover:text-gray-200'"
        @click="selectedCategory = c"
      >{{ c }}</button>
    </div>

    <!-- Empty state -->
    <div v-if="filtered.length === 0" class="flex flex-col items-center py-10 gap-2 text-gray-500">
      <UIcon name="i-heroicons-check-circle" class="w-8 h-8 text-emerald-500" />
      <p class="text-sm">フィルター条件に一致する指摘はありません</p>
    </div>

    <!-- Findings -->
    <div v-for="f in filtered" :key="f.id" class="rounded-lg border border-white/10 bg-gray-900/60 overflow-hidden">
      <!-- Header row -->
      <button
        class="w-full flex items-start gap-3 p-3 text-left hover:bg-white/5 transition-colors"
        @click="toggle(f.id)"
      >
        <UIcon
          :name="SEVERITY_ICON[f.severity] ?? 'i-heroicons-information-circle'"
          class="w-4 h-4 mt-0.5 flex-shrink-0"
          :class="{
            'text-red-400':    f.severity === 'critical',
            'text-orange-400': f.severity === 'high',
            'text-amber-400':  f.severity === 'medium',
            'text-blue-400':   f.severity === 'low',
            'text-gray-400':   f.severity === 'info',
          }"
        />
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs font-semibold text-gray-100">{{ f.title }}</span>
            <UBadge :color="SEVERITY_COLOR[f.severity] as any" variant="subtle" size="xs">
              {{ f.severity }}
            </UBadge>
            <span class="text-[10px] text-gray-500 flex items-center gap-0.5">
              <UIcon :name="CATEGORY_ICON[f.category] ?? 'i-heroicons-tag'" class="w-3 h-3" />
              {{ f.category }}
            </span>
            <span v-if="f.hasRecommendation" class="text-[10px] text-emerald-400 flex items-center gap-0.5">
              <UIcon name="i-heroicons-light-bulb" class="w-3 h-3" />
              改善案あり
            </span>
          </div>
          <p class="text-[11px] text-gray-400 mt-0.5 truncate">
            {{ f.location.file }}:{{ f.location.startLine }}–{{ f.location.endLine }}
          </p>
        </div>
        <div class="flex-shrink-0 flex items-center gap-2">
          <span class="text-[10px] text-red-400 font-mono">-{{ f.scorePenalty }}pt</span>
          <UIcon
            :name="expandedIds.has(f.id) ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
            class="w-4 h-4 text-gray-500"
          />
        </div>
      </button>

      <!-- Expanded body -->
      <div v-if="expandedIds.has(f.id)" class="border-t border-white/10 p-3 space-y-3">
        <p class="text-xs text-gray-300 leading-relaxed">{{ f.description }}</p>
        <div class="rounded-md overflow-hidden">
          <div class="flex items-center justify-between bg-gray-800 px-3 py-1.5">
            <span class="text-[10px] text-gray-400 font-mono">{{ f.location.file }}</span>
            <span class="text-[10px] text-gray-500">L{{ f.location.startLine }}–{{ f.location.endLine }}</span>
          </div>
          <pre class="text-xs text-gray-300 bg-gray-900 p-3 overflow-x-auto leading-relaxed font-mono">{{ f.location.snippet }}</pre>
        </div>
        <div class="rounded-md bg-amber-900/20 border border-amber-500/20 p-2.5">
          <p class="text-[11px] text-amber-300 leading-relaxed">
            <span class="font-semibold">影響: </span>{{ f.impact }}
          </p>
        </div>
        <div class="flex items-center gap-3">
          <button
            v-if="f.hasRecommendation"
            class="flex items-center gap-1.5 text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors"
            @click.stop="emit('select', f)"
          >
            <UIcon name="i-heroicons-light-bulb" class="w-3.5 h-3.5" />
            改善案を見る
          </button>
          <button class="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-400 transition-colors">
            <UIcon name="i-heroicons-eye-slash" class="w-3.5 h-3.5" />
            無視
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
