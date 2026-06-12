<script setup lang="ts">
const { codeStats } = useDashboard()

const stats = computed(() => [
  { label: 'Lines Added', value: `+${codeStats.value.additions.toLocaleString()}`, color: 'text-emerald-400' },
  { label: 'Lines Removed', value: `-${codeStats.value.deletions.toLocaleString()}`, color: 'text-red-400' },
  { label: 'Files Changed', value: codeStats.value.filesChanged.toString(), color: 'text-blue-400' },
  { label: 'Commits', value: codeStats.value.commits.toString(), color: 'text-purple-400' },
  { label: 'Lines Scanned', value: codeStats.value.linesScanned.toLocaleString(), color: 'text-gray-300' },
])

const netChange = computed(() => codeStats.value.additions - codeStats.value.deletions)
const addPct = computed(() =>
  Math.round((codeStats.value.additions / (codeStats.value.additions + codeStats.value.deletions)) * 100)
)
</script>

<template>
  <div class="space-y-4">
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div
        v-for="stat in stats"
        :key="stat.label"
        class="rounded-lg bg-white/5 border border-white/10 px-3 py-2"
      >
        <p class="text-xs text-gray-500 mb-0.5">{{ stat.label }}</p>
        <p class="text-lg font-bold font-mono" :class="stat.color">{{ stat.value }}</p>
      </div>
    </div>

    <div class="rounded-lg bg-white/5 border border-white/10 p-3">
      <div class="flex items-center justify-between text-xs text-gray-400 mb-2">
        <span>Code churn</span>
        <span class="font-mono" :class="netChange >= 0 ? 'text-emerald-400' : 'text-red-400'">
          Net {{ netChange >= 0 ? '+' : '' }}{{ netChange.toLocaleString() }} lines
        </span>
      </div>
      <div class="h-2 rounded-full bg-red-500/30 overflow-hidden">
        <div
          class="h-full rounded-full bg-emerald-500 transition-all duration-700"
          :style="{ width: `${addPct}%` }"
        />
      </div>
      <div class="flex justify-between text-xs text-gray-500 mt-1">
        <span>Additions {{ addPct }}%</span>
        <span>Deletions {{ 100 - addPct }}%</span>
      </div>
    </div>
  </div>
</template>
