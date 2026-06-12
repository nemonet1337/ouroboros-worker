<script setup lang="ts">
interface Dimension {
  key: string
  label: string
  score: number
  weight: number
  summary: string
}

defineProps<{ dimensions: Dimension[] }>()

function barColor(score: number) {
  if (score >= 85) return 'bg-emerald-500'
  if (score >= 70) return 'bg-blue-500'
  if (score >= 55) return 'bg-amber-500'
  if (score >= 40) return 'bg-orange-500'
  return 'bg-red-500'
}

function textColor(score: number) {
  if (score >= 85) return 'text-emerald-400'
  if (score >= 70) return 'text-blue-400'
  if (score >= 55) return 'text-amber-400'
  if (score >= 40) return 'text-orange-400'
  return 'text-red-400'
}

const ICON: Record<string, string> = {
  security:    'i-heroicons-shield-check',
  performance: 'i-heroicons-bolt',
  redundancy:  'i-heroicons-document-duplicate',
  readability: 'i-heroicons-book-open',
  design:      'i-heroicons-squares-2x2',
  correctness: 'i-heroicons-check-badge',
}
</script>

<template>
  <div class="space-y-3">
    <div v-for="dim in dimensions" :key="dim.key" class="space-y-1">
      <div class="flex items-center justify-between text-xs">
        <div class="flex items-center gap-1.5 text-gray-300">
          <UIcon :name="ICON[dim.key] ?? 'i-heroicons-chart-bar'" class="w-3.5 h-3.5 text-gray-400" />
          <span class="font-medium capitalize">{{ dim.label }}</span>
          <span class="text-gray-600 text-[10px]">(weight {{ Math.round(dim.weight * 100) }}%)</span>
        </div>
        <span :class="['font-bold tabular-nums', textColor(dim.score)]">{{ dim.score }}</span>
      </div>
      <!-- Progress bar -->
      <div class="h-1.5 w-full rounded-full bg-gray-800">
        <div
          :class="['h-full rounded-full transition-all duration-700 ease-out', barColor(dim.score)]"
          :style="{ width: `${dim.score}%` }"
        />
      </div>
      <p class="text-[11px] text-gray-500 leading-tight">{{ dim.summary }}</p>
    </div>
  </div>
</template>
