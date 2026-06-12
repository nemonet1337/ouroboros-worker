<script setup lang="ts">
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  LineElement, PointElement, LinearScale, CategoryScale,
  Tooltip, Legend, Filler,
} from 'chart.js'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler)

interface HistoryEntry { date: string; overall: number; security: number; performance: number }

const props = defineProps<{ history: HistoryEntry[] }>()

const chartData = computed(() => ({
  labels: props.history.map(h => h.date),
  datasets: [
    {
      label: '総合スコア',
      data: props.history.map(h => h.overall),
      borderColor: '#818cf8',
      backgroundColor: 'rgba(129,140,248,0.08)',
      tension: 0.35,
      fill: true,
      pointRadius: 4,
      pointHoverRadius: 6,
    },
    {
      label: 'パフォーマンス',
      data: props.history.map(h => h.performance),
      borderColor: '#34d399',
      backgroundColor: 'transparent',
      tension: 0.35,
      pointRadius: 3,
      borderDash: [4, 3],
    },
    {
      label: 'セキュリティ',
      data: props.history.map(h => h.security),
      borderColor: '#60a5fa',
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
      min: 0, max: 100,
      ticks: { color: '#6b7280', font: { size: 10 }, stepSize: 20 },
      grid: { color: 'rgba(255,255,255,0.06)' },
    },
  },
}
</script>

<template>
  <div class="h-52">
    <Line :data="chartData" :options="chartOptions" />
  </div>
</template>
