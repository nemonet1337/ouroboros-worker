<script setup lang="ts">
const { metrics } = useDashboard()

const colorMap: Record<string, string> = {
  indigo: 'from-indigo-500/20 to-indigo-600/10 border-indigo-500/30 text-indigo-400',
  blue: 'from-blue-500/20 to-blue-600/10 border-blue-500/30 text-blue-400',
  emerald: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30 text-emerald-400',
  amber: 'from-amber-500/20 to-amber-600/10 border-amber-500/30 text-amber-400',
}
</script>

<template>
  <div class="grid grid-cols-2 gap-3">
    <div
      v-for="metric in metrics"
      :key="metric.label"
      class="relative overflow-hidden rounded-xl border bg-gradient-to-br p-4"
      :class="colorMap[metric.color]"
    >
      <div class="flex items-start justify-between mb-2">
        <UIcon :name="metric.icon" class="w-5 h-5" />
        <span
          v-if="metric.delta !== undefined"
          class="text-xs font-medium px-1.5 py-0.5 rounded-full"
          :class="metric.delta > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'"
        >
          {{ metric.delta > 0 ? '+' : '' }}{{ metric.delta }}
        </span>
      </div>
      <div class="mt-1">
        <span class="text-2xl font-bold text-white tabular-nums">{{ metric.value }}</span>
        <span v-if="metric.suffix" class="text-sm text-gray-400 ml-0.5">{{ metric.suffix }}</span>
      </div>
      <p class="text-xs text-gray-400 mt-1">{{ metric.label }}</p>
    </div>
  </div>
</template>
