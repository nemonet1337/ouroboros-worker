<script setup lang="ts">
definePageMeta({ layout: 'default' })

const route = useRoute()
const id = computed(() => route.params.id as string)

useHead(() => ({ title: `Inspection ${id.value} — Ouroboros` }))

// Stub data (would be fetched from /api/inspect/[id])
const inspection = ref({
  id: id.value,
  status: 'completed',
  language: 'TypeScript',
  createdAt: '2026-05-23 14:02',
  durationMs: 2400,
  model: 'claude-haiku-4-5',
  scoreCard: {
    overall: 78,
    grade: 'B',
    breakdown: {
      security:    { score: 55, weight: 0.25, summary: 'auth/login.ts に SQLi、CSRF 対策不足' },
      performance: { score: 84, weight: 0.20, summary: 'ループ最適化済み' },
      redundancy:  { score: 70, weight: 0.15, summary: '重複ロジックが散在' },
      readability: { score: 72, weight: 0.15, summary: 'ES2015 以前の構文と命名の揺れ' },
      design:      { score: 78, weight: 0.15, summary: '責務分離OK' },
      correctness: { score: 90, weight: 0.10, summary: '型安全な記述' },
    },
  },
  files: [
    { path: 'src/auth/login.ts', score: 42, grade: 'F' },
    { path: 'src/utils/list.ts',  score: 90, grade: 'A' },
    { path: 'src/http/client.ts', score: 76, grade: 'B' },
  ],
  summary: '全体的に堅実だが、ES2015 以前の構文と命名の揺れが目立つ。auth/login.ts に重大な SQLi。',
  findings: [
    { id: 'f1', severity: 'critical', category: 'Security',      title: 'SQL injection in login()',         file: 'src/auth/login.ts:24' },
    { id: 'f2', severity: 'high',     category: 'Performance',   title: 'Quadratic loop in mapUsers()',     file: 'src/utils/list.ts:42' },
    { id: 'f3', severity: 'high',     category: 'Readability',   title: 'var を const/let に置換',          file: 'src/utils/list.ts:8' },
    { id: 'f4', severity: 'high',     category: 'Redundancy',    'title': '巨大関数 (180行) の分割推奨',    file: 'src/utils/list.ts:42' },
    { id: 'f5', severity: 'medium',   category: 'Design',        title: 'Magic number の定数化',           file: 'src/utils/list.ts:120' },
    { id: 'f6', severity: 'low',      category: 'Correctness',   title: '未使用 import',                   file: 'src/utils/list.ts:3' },
    { id: 'f7', severity: 'critical', category: 'Security',      title: 'Missing CSRF token',              file: 'src/http/client.ts:80' },
  ],
  recommendations: [
    { title: 'Parameterized query in login()', effect: '+12 security',    selected: true },
    { title: 'Map/Set for O(n) lookup',        effect: '+6 performance',  selected: true },
    { title: 'Replace var with const/let',     effect: '+8 readability',  selected: false },
    { title: 'Extract validateInput()',        effect: '+4 redundancy',   selected: false },
  ],
  previous: {
    overall: 48,
    grade: 'D',
    resolvedCount: 5,
    newCount: 1,
  },
})

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'bg-red-500/15 border-red-500/30 text-red-400',
  high:     'bg-orange-500/15 border-orange-500/30 text-orange-400',
  medium:   'bg-amber-500/15 border-amber-500/30 text-amber-400',
  low:      'bg-blue-500/15 border-blue-500/30 text-blue-400',
}

const GAUGE_GRADE_COLOR: Record<string, string> = {
  S: '#10b981', A: '#10b981', B: '#3b82f6', C: '#f59e0b', D: '#f97316', F: '#ef4444',
}

function gradeColor(g: string) { return GAUGE_GRADE_COLOR[g] ?? '#ef4444' }

const scoreImprovment = computed(() => inspection.value.scoreCard.overall - inspection.value.previous.overall)

const selectedRecs = ref<Set<number>>(new Set([0, 1]))

function toggleRec(i: number) {
  const s = new Set(selectedRecs.value)
  if (s.has(i)) s.delete(i)
  else s.add(i)
  selectedRecs.value = s
}

const projectedGain = computed(() => {
  let total = 0
  inspection.value.recommendations.forEach((r, i) => {
    if (selectedRecs.value.has(i)) total += parseInt(r.effect.match(/\d+/)?.[0] ?? '0')
  })
  return total
})

const dimensionEntries = computed(() =>
  Object.entries(inspection.value.scoreCard.breakdown).map(([key, val]) => ({
    key, ...val,
    label: { security: 'セキュリティ', performance: 'パフォーマンス', redundancy: '冗長性', readability: '可読性', design: '設計', correctness: '正確性' }[key] ?? key,
  }))
)

function barColor(score: number) {
  if (score >= 85) return 'bg-emerald-500'
  if (score >= 70) return 'bg-blue-500'
  if (score >= 55) return 'bg-amber-500'
  return 'bg-red-500'
}
</script>

<template>
  <div class="flex-1 max-w-screen-xl mx-auto w-full px-4 py-6 overflow-y-auto">

    <!-- Page header -->
    <div class="flex items-start justify-between gap-4 mb-6">
      <div class="space-y-1.5">
        <div class="flex items-center gap-2 flex-wrap">
          <NuxtLink to="/inspection" class="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1">
            <UIcon name="i-heroicons-arrow-left" class="w-3 h-3" />
            Inspection
          </NuxtLink>
          <span class="text-gray-600">/</span>
          <span class="text-xs text-gray-400 font-mono">{{ id }}</span>
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            completed
          </span>
          <span class="px-2 py-0.5 rounded-full text-[10px] bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
            {{ inspection.language }}
          </span>
        </div>
        <h1 class="text-xl font-bold text-gray-100">
          main.ts &nbsp;
          <span class="text-gray-500 text-base font-normal">· {{ inspection.createdAt }}</span>
        </h1>
        <p class="text-xs text-gray-500">
          {{ inspection.durationMs }}ms · model: {{ inspection.model }}
        </p>
      </div>

      <div class="flex flex-wrap gap-2 flex-shrink-0">
        <button class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-gray-300 hover:bg-white/5 transition-colors">
          <UIcon name="i-heroicons-arrow-path" class="w-3.5 h-3.5" />
          Re-inspect
        </button>
        <button class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-gray-300 hover:bg-white/5 transition-colors">
          <UIcon name="i-heroicons-arrows-right-left" class="w-3.5 h-3.5" />
          Compare
        </button>
        <button class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-gray-300 hover:bg-white/5 transition-colors">
          <UIcon name="i-heroicons-arrow-down-tray" class="w-3.5 h-3.5" />
          Export ▾
        </button>
        <button class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 text-xs text-gray-400 hover:bg-white/5 transition-colors">
          <UIcon name="i-heroicons-link" class="w-3.5 h-3.5" />
          Copy URL
        </button>
      </div>
    </div>

    <div class="flex gap-5 items-start">

      <!-- Left: Summary card -->
      <div class="w-80 flex-shrink-0 space-y-4">
        <UCard :ui="{ base: 'bg-gray-900 border border-white/10', body: { padding: 'p-5' } }">
          <!-- Gauge -->
          <div class="flex flex-col items-center gap-2 mb-5">
            <div class="relative w-36 h-36">
              <svg viewBox="0 0 100 100" class="w-full h-full">
                <circle cx="50" cy="50" r="40" fill="none" stroke="#1f2937" stroke-width="9"
                  :stroke-dasharray="`${251.2 * (240/360)} ${251.2}`"
                  stroke-linecap="round"
                  :transform="`rotate(150 50 50)`" />
                <circle cx="50" cy="50" r="40" fill="none"
                  :stroke="gradeColor(inspection.scoreCard.grade)" stroke-width="9"
                  :stroke-dasharray="`${251.2 * (240/360) * (inspection.scoreCard.overall / 100)} ${251.2}`"
                  stroke-linecap="round"
                  :transform="`rotate(150 50 50)`"
                  class="transition-all duration-700" />
              </svg>
              <div class="absolute inset-0 flex flex-col items-center justify-center mt-2">
                <span class="text-3xl font-bold tabular-nums" :style="{ color: gradeColor(inspection.scoreCard.grade) }">
                  {{ inspection.scoreCard.overall }}
                </span>
                <span class="text-xs text-gray-400">/100</span>
              </div>
            </div>
            <div
              class="px-4 py-1 rounded-full text-sm font-bold border"
              :style="{ color: gradeColor(inspection.scoreCard.grade), borderColor: gradeColor(inspection.scoreCard.grade) + '40', background: gradeColor(inspection.scoreCard.grade) + '15' }"
            >
              Grade {{ inspection.scoreCard.grade }}
            </div>
            <div
              class="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full"
              :class="scoreImprovment >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'"
            >
              {{ scoreImprovment >= 0 ? '+' : '' }}{{ scoreImprovment }} vs previous
            </div>
          </div>

          <div class="border-t border-white/10 pt-4 space-y-3">
            <div v-for="dim in dimensionEntries" :key="dim.key" class="space-y-1">
              <div class="flex items-center justify-between text-xs">
                <span class="text-gray-300">{{ dim.label }}</span>
                <div class="flex items-center gap-2">
                  <span class="text-gray-500 text-[10px]">{{ Math.round(dim.weight * 100) }}%</span>
                  <span class="font-bold tabular-nums" :class="{
                    'text-emerald-400': dim.score >= 85,
                    'text-blue-400':   dim.score >= 70 && dim.score < 85,
                    'text-amber-400':  dim.score >= 55 && dim.score < 70,
                    'text-red-400':    dim.score < 55,
                  }">{{ dim.score }}</span>
                </div>
              </div>
              <div class="h-1.5 rounded-full bg-gray-800 overflow-hidden">
                <div :class="['h-full rounded-full transition-all', barColor(dim.score)]" :style="{ width: `${dim.score}%` }" />
              </div>
            </div>
          </div>

          <div class="border-t border-white/10 pt-4 mt-4">
            <p class="text-xs text-gray-500 mb-2">Files inspected ({{ inspection.files.length }})</p>
            <div class="space-y-1.5">
              <div v-for="f in inspection.files" :key="f.path" class="flex items-center justify-between text-xs">
                <span class="font-mono text-gray-400 truncate">{{ f.path }}</span>
                <span
                  class="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0"
                  :class="{
                    'bg-emerald-500/15 text-emerald-400': f.score >= 80,
                    'bg-amber-500/15 text-amber-400':     f.score >= 60,
                    'bg-red-500/15 text-red-400':         f.score < 60,
                  }"
                >{{ f.score }}</span>
              </div>
            </div>
          </div>

          <div class="border-t border-white/10 pt-4 mt-4">
            <p class="text-xs text-gray-500 mb-2">Share</p>
            <div class="flex gap-2">
              <button class="flex-1 py-1.5 rounded-lg border border-white/10 text-xs text-gray-400 hover:bg-white/5 transition-colors">🔗 Link</button>
              <button class="flex-1 py-1.5 rounded-lg border border-white/10 text-xs text-gray-400 hover:bg-white/5 transition-colors">↗ Slack</button>
              <button class="flex-1 py-1.5 rounded-lg border border-white/10 text-xs text-gray-400 hover:bg-white/5 transition-colors">↗ Issue</button>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Right: Details -->
      <div class="flex-1 min-w-0 space-y-4">

        <!-- Compare with previous -->
        <UCard :ui="{ base: 'bg-gray-900 border border-white/10', header: { base: 'border-b border-white/10 py-3' }, body: { padding: 'p-4' } }">
          <template #header>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 text-sm font-medium text-gray-200">
                <UIcon name="i-heroicons-arrows-right-left" class="w-4 h-4 text-blue-400" />
                Compare with previous run
              </div>
              <span class="text-xs text-gray-500">vs 2 days ago</span>
            </div>
          </template>
          <div class="grid grid-cols-3 gap-3">
            <div class="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center">
              <p class="text-xs text-gray-500 mb-1">Before</p>
              <p class="text-2xl font-bold text-red-400">{{ inspection.previous.grade }}</p>
              <p class="text-lg font-bold text-red-300 tabular-nums">{{ inspection.previous.overall }}</p>
              <div class="h-1.5 rounded-full bg-gray-800 mt-2 overflow-hidden">
                <div class="h-full bg-red-500 rounded-full" :style="{ width: `${inspection.previous.overall}%` }" />
              </div>
            </div>
            <div class="flex items-center justify-center">
              <UIcon name="i-heroicons-arrow-right" class="w-8 h-8 text-gray-600" />
            </div>
            <div class="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
              <p class="text-xs text-gray-500 mb-1">After</p>
              <p class="text-2xl font-bold text-emerald-400">{{ inspection.scoreCard.grade }}</p>
              <p class="text-lg font-bold text-emerald-300 tabular-nums">{{ inspection.scoreCard.overall }}</p>
              <div class="h-1.5 rounded-full bg-gray-800 mt-2 overflow-hidden">
                <div class="h-full bg-emerald-500 rounded-full" :style="{ width: `${inspection.scoreCard.overall}%` }" />
              </div>
            </div>
          </div>
          <div class="mt-3 flex gap-2">
            <span class="px-2 py-1 text-xs rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">−{{ inspection.previous.resolvedCount }} resolved</span>
            <span class="px-2 py-1 text-xs rounded-full bg-red-500/10 border border-red-500/30 text-red-400">+{{ inspection.previous.newCount }} new</span>
          </div>
        </UCard>

        <!-- All findings -->
        <UCard :ui="{ base: 'bg-gray-900 border border-white/10', header: { base: 'border-b border-white/10 py-3' }, body: { padding: 'p-4' } }">
          <template #header>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 text-sm font-medium text-gray-200">
                <UIcon name="i-heroicons-bug-ant" class="w-4 h-4 text-red-400" />
                All Findings ({{ inspection.findings.length }})
              </div>
            </div>
          </template>
          <div class="space-y-1">
            <div
              v-for="f in inspection.findings"
              :key="f.id"
              class="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors"
              style="border-bottom: 1px dashed rgba(255,255,255,0.08)"
            >
              <div class="flex items-center gap-3">
                <span
                  class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border"
                  :class="SEVERITY_COLOR[f.severity]"
                >{{ f.severity }}</span>
                <span class="text-[10px] text-gray-500 px-1.5 py-0.5 rounded bg-white/5 border border-white/10">{{ f.category }}</span>
                <span class="text-xs text-gray-200">{{ f.title }}</span>
              </div>
              <span class="text-[10px] text-gray-500 font-mono flex-shrink-0 ml-3">{{ f.file }}</span>
            </div>
          </div>
        </UCard>

        <!-- Recommendations -->
        <UCard :ui="{ base: 'bg-gray-900 border border-white/10', header: { base: 'border-b border-white/10 py-3' }, body: { padding: 'p-4' } }">
          <template #header>
            <div class="flex items-center gap-2 text-sm font-medium text-gray-200">
              <UIcon name="i-heroicons-light-bulb" class="w-4 h-4 text-emerald-400" />
              Recommendations
            </div>
          </template>
          <p class="text-xs text-gray-500 mb-3">Apply individually or in batch — patch downloadable as .diff</p>
          <div class="space-y-2">
            <div
              v-for="(rec, i) in inspection.recommendations"
              :key="i"
              class="flex items-center justify-between p-3 rounded-xl border border-white/10 hover:bg-white/5 transition-colors"
            >
              <div class="flex items-center gap-3">
                <button
                  class="w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors"
                  :class="selectedRecs.has(i)
                    ? 'bg-indigo-500 border-indigo-500'
                    : 'border-white/20 bg-white/5'"
                  @click="toggleRec(i)"
                >
                  <UIcon v-if="selectedRecs.has(i)" name="i-heroicons-check" class="w-2.5 h-2.5 text-white" />
                </button>
                <span class="text-sm text-gray-200">{{ rec.title }}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">{{ rec.effect }}</span>
                <button class="text-xs text-gray-400 hover:text-gray-200 border border-white/10 px-2.5 py-1 rounded-lg transition-colors">View diff</button>
              </div>
            </div>
          </div>

          <div class="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
            <span class="text-xs text-gray-500">
              {{ selectedRecs.size }} / {{ inspection.recommendations.length }} selected · projected +{{ projectedGain }} overall
            </span>
            <div class="flex gap-2">
              <button class="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-white/10 text-gray-300 rounded-lg hover:bg-white/5 transition-colors">
                <UIcon name="i-heroicons-arrow-down-tray" class="w-3.5 h-3.5" />
                Download .patch
              </button>
              <button class="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors font-medium">
                <UIcon name="i-heroicons-arrow-up-tray" class="w-3.5 h-3.5" />
                Open PR
              </button>
            </div>
          </div>
        </UCard>
      </div>
    </div>
  </div>
</template>
