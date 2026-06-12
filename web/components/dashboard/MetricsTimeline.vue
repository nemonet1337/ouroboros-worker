<script setup lang="ts">
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  LineElement, PointElement, LinearScale, CategoryScale,
  Tooltip, Legend, Filler,
} from 'chart.js'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler)

defineProps<{ range?: string }>()

// Stub data — will be replaced with real API data
const data = {
  '7d':  { labels: ['5/17', '5/18', '5/19', '5/20', '5/21', '5/22', '5/23'], fixes: [30, 40, 38, 55, 52, 65, 72], prs: [20, 25, 30, 28, 42, 40, 50], risk: [70, 68, 62, 58, 55, 52, 48] },
  '30d': { labels: ['4/24', '4/27', '4/30', '5/3', '5/6', '5/9', '5/12', '5/15', '5/18', '5/21'], fixes: [10, 18, 25, 30, 38, 45, 55, 60, 68, 72], prs: [5, 12, 18, 20, 28, 32, 40, 44, 48, 50], risk: [85, 80, 76, 72, 68, 64, 60, 56, 52, 48] },
  '90d': { labels: ['Mar', 'Apr', 'May'], fixes: [15, 45, 72], prs: [8, 30, 50], risk: [90, 68, 48] },
}

const selectedRange = ref('7d')
watch(() => selectedRange.value, () => {})

const currentData = computed(() => data[selectedRange.value as keyof typeof data] ?? data['7d'])

const chartData = computed(() => ({
  labels: currentData.value.labels,
  datasets: [
    {
      label: 'Fixes',
      data: currentData.value.fixes,
      borderColor: '#818cf8',
      backgroundColor: 'rgba(129,140,248,0.08)',
      tension: 0.35,
      fill: true,
      pointRadius: 3,
      pointHoverRadius: 5,
    },
    {
      label: 'PRs Merged',
      data: currentData.value.prs,
      borderColor: '#34d399',
      backgroundColor: 'transparent',
      tension: 0.35,
      pointRadius: 3,
      borderDash: [4, 3],
    },
    {
      label: 'Risk Score',
      data: currentData.value.risk,
      borderColor: '#fbbf24',
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
      <button class="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors">
        <UIcon name="i-heroicons-arrow-down-tray" class="w-3.5 h-3.5" />
        CSV
      </button>
    </div>
    <div class="h-44">
      <Line :data="chartData" :options="chartOptions" />
    </div>
  </div>
</template>
