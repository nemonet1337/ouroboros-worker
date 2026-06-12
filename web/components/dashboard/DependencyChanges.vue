<script setup lang="ts">
const { dependencyChanges } = useDashboard()

const severityConfig = {
  critical: { class: 'bg-red-500/20 text-red-400 border-red-500/30', label: 'Critical' },
  high: { class: 'bg-orange-500/20 text-orange-400 border-orange-500/30', label: 'High' },
  medium: { class: 'bg-amber-500/20 text-amber-400 border-amber-500/30', label: 'Medium' },
  low: { class: 'bg-blue-500/20 text-blue-400 border-blue-500/30', label: 'Low' },
  info: { class: 'bg-gray-500/20 text-gray-400 border-gray-500/30', label: 'Info' },
}

const typeConfig = {
  major: 'text-red-400',
  minor: 'text-amber-400',
  patch: 'text-emerald-400',
}
</script>

<template>
  <div class="space-y-2">
    <div
      v-for="dep in dependencyChanges"
      :key="dep.name"
      class="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 hover:bg-white/8 transition-colors"
    >
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-mono text-sm text-gray-200 font-medium">{{ dep.name }}</span>
          <span
            class="inline-flex items-center px-1.5 py-0.5 rounded text-xs border"
            :class="severityConfig[dep.severity].class"
          >
            {{ severityConfig[dep.severity].label }}
          </span>
          <span class="text-xs uppercase font-bold" :class="typeConfig[dep.type]">
            {{ dep.type }}
          </span>
        </div>
      </div>

      <div class="flex items-center gap-2 flex-shrink-0 text-xs font-mono">
        <span class="px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400">
          {{ dep.before }}
        </span>
        <UIcon name="i-heroicons-arrow-right" class="w-3.5 h-3.5 text-gray-500" />
        <span class="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
          {{ dep.after }}
        </span>
      </div>
    </div>
  </div>
</template>
