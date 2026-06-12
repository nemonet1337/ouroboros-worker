<script setup lang="ts">
interface Recommendation {
  id: string
  findingId: string
  title: string
  before: string
  after: string
  diff: string
  rationale: string
  impactDescription: string
  effort: string
}

defineProps<{ recommendation: Recommendation }>()

const tab = ref<'split' | 'unified'>('split')

const EFFORT_COLOR: Record<string, string> = {
  trivial: 'emerald', minor: 'blue', moderate: 'amber', major: 'red',
}
</script>

<template>
  <div class="space-y-3">
    <!-- Header -->
    <div class="flex items-start justify-between gap-3">
      <h3 class="text-sm font-semibold text-gray-100">{{ recommendation.title }}</h3>
      <UBadge
        :color="(EFFORT_COLOR[recommendation.effort] as any) ?? 'gray'"
        variant="subtle" size="xs" class="flex-shrink-0"
      >
        {{ recommendation.effort }}
      </UBadge>
    </div>

    <!-- Tab switcher -->
    <div class="flex gap-1 border-b border-white/10 pb-2">
      <button
        v-for="t in (['split', 'unified'] as const)" :key="t"
        @click="tab = t"
        class="px-3 py-1 text-xs rounded-md transition-colors"
        :class="tab === t ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:text-gray-200'"
      >{{ t === 'split' ? '分割表示' : 'Diff表示' }}</button>
    </div>

    <!-- Split view -->
    <div v-if="tab === 'split'" class="grid grid-cols-2 gap-2">
      <div>
        <div class="flex items-center gap-2 bg-red-900/30 border border-red-500/20 rounded-t px-3 py-1.5">
          <UIcon name="i-heroicons-minus-circle" class="w-3.5 h-3.5 text-red-400" />
          <span class="text-[11px] text-red-300 font-medium">Before</span>
        </div>
        <pre class="text-xs text-gray-300 bg-gray-900/80 border border-red-500/10 rounded-b p-3 overflow-x-auto leading-relaxed font-mono min-h-[80px]">{{ recommendation.before }}</pre>
      </div>
      <div>
        <div class="flex items-center gap-2 bg-emerald-900/30 border border-emerald-500/20 rounded-t px-3 py-1.5">
          <UIcon name="i-heroicons-plus-circle" class="w-3.5 h-3.5 text-emerald-400" />
          <span class="text-[11px] text-emerald-300 font-medium">After</span>
        </div>
        <pre class="text-xs text-gray-300 bg-gray-900/80 border border-emerald-500/10 rounded-b p-3 overflow-x-auto leading-relaxed font-mono min-h-[80px]">{{ recommendation.after }}</pre>
      </div>
    </div>

    <!-- Unified diff view -->
    <div v-else class="rounded-lg overflow-hidden border border-white/10">
      <div class="bg-gray-800 px-3 py-1.5 text-[10px] text-gray-400 font-mono">unified diff</div>
      <pre class="text-xs bg-gray-900 p-3 overflow-x-auto leading-relaxed font-mono"><template v-for="(line, i) in recommendation.diff.split('\n')" :key="i"><span
  :class="{
    'text-emerald-400 block': line.startsWith('+') && !line.startsWith('+++'),
    'text-red-400 block':     line.startsWith('-') && !line.startsWith('---'),
    'text-blue-400 block':    line.startsWith('@@'),
    'text-gray-500 block':    line.startsWith('---') || line.startsWith('+++'),
    'text-gray-400 block':    !line.startsWith('+') && !line.startsWith('-') && !line.startsWith('@'),
  }"
>{{ line }}</span></template></pre>
    </div>

    <!-- Rationale -->
    <div class="rounded-lg bg-indigo-900/20 border border-indigo-500/20 p-3 space-y-1">
      <p class="text-[11px] font-semibold text-indigo-300">技術的根拠</p>
      <p class="text-[11px] text-gray-300 leading-relaxed">{{ recommendation.rationale }}</p>
    </div>
    <div class="rounded-lg bg-emerald-900/20 border border-emerald-500/20 p-3 space-y-1">
      <p class="text-[11px] font-semibold text-emerald-300">期待される改善効果</p>
      <p class="text-[11px] text-gray-300 leading-relaxed">{{ recommendation.impactDescription }}</p>
    </div>
  </div>
</template>
