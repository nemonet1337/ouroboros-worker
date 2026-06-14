<script setup lang="ts">
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  LineElement, PointElement, LinearScale, CategoryScale,
  Tooltip, Legend, Filler,
} from 'chart.js'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler)

defineProps<{ range?: string }>()

const { api } = useApi()

interface HistoryEntry {
  id: string
  date: string
  overall: number
  security: number
  performance: number
}

const allHistory = ref<HistoryEntry[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    const res = await api<{ history: HistoryEntry[] }>('/metrics')
    allHistory.value = res.history ?? []
  } catch {
    allHistory.value = []
  } finally {
    loading.value = false
  }
})

const selectedRange = ref('30d')

const filteredHistory = computed(() => {
  const now = Date.now()
  const days = selectedRange.value === '7d' ? 7 : selectedRange.value === '30d' ? 30 : 90
  const cutoff = now - days * 24 * 60 * 60 * 1000
  return allHistory.value.filter(h => new Date(h.date).getTime() >= cutoff)
})

const chartData = computed(() => ({
  labels: filteredHistory.value.map(h => h.date.slice(5)),
  datasets: [
    {
      label: 'Overall Score',
      data: filteredHistory.value.map(h => h.overall),
      borderColor: '#818cf8',
      backgroundColor: 'rgba(129,140,248,0.08)',
      tension: 0.35,
      fill: true,
      pointRadius: 3,
      pointHoverRadius: 5,
    },
    {
      label: 'Security',
      data: filteredHistory.value.map(h => h.security),
      borderColor: '#f87171',
      backgroundColor: 'transparent',
      tension: 0.35,
      pointRadius: 3,
      borderDash: [4, 3],
    },
    {
      label: 'Performance',
      data: filteredHistory.value.map(h => h.performance),
      borderColor: '#34d399',
      backgroundColor: 'transparent',
      tension: 0.35,
      pointRadius: 3,
      borderDash: [4, 3],
    },
  ],
}))

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: { color: '#9ca3af', font: { size: 11 }, boxWidth: 12, padding: 16 },
    },
    tooltip: {
      backgroundColor: '#1f2937',
      borderColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1,
      titleColor: '#f3f4f6',
      bodyColor: '#d1d5db',
    },
  },
  scales: {
    x: {
      ticks: { color: '#6b7280', font: { size: 10 } },
      grid: { color: 'rgba(255,255,255,0.04)' },
    },
    y: {
      min: 0,
      max: 100,
      ticks: { color: '#6b7280', font: { size: 10 } },
      grid: { color: 'rgba(255,255,255,0.06)' },
    },
  },
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-1">
        <button
          v-for="r in ['7d', '30d', '90d']"
          :key="r"
          class="px-2.5 py-1 rounded-md text-xs border transition-colors"
          :class="selectedRange === r
            ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
            : 'border-white/10 text-gray-400 hover:text-gray-200'"
          @click="selectedRange = r"
        >{{ r }}</button>
      </div>
    </div>
    <div v-if="loading" class="h-44 flex items-center justify-center text-gray-500 text-sm">
      Loading…
    </div>
    <div v-else-if="filteredHistory.length === 0" class="h-44 flex flex-col items-center justify-center text-gray-600 text-sm gap-2">
      <UIcon name="i-heroicons-chart-bar" class="w-8 h-8 opacity-30" />
      <span>No inspection data for this period</span>
    </div>
    <div v-else class="h-44">
      <Line :data="chartData" :options="chartOptions" />
    </div>
  </div>
</template>
