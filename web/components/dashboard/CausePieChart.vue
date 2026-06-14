<script setup lang="ts">
import { Doughnut } from 'vue-chartjs'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
} from 'chart.js'

ChartJS.register(ArcElement, Tooltip, Legend)

const { causeData } = useDashboard()

const hasData = computed(() => causeData.value.security > 0 || causeData.value.performance > 0)

const chartData = computed<ChartData<'doughnut'>>(() => ({
  labels: ['Security', 'Performance'],
  datasets: [
    {
      data: [causeData.value.security, causeData.value.performance],
      backgroundColor: ['rgba(239, 68, 68, 0.8)', 'rgba(59, 130, 246, 0.8)'],
      borderColor: ['rgb(239, 68, 68)', 'rgb(59, 130, 246)'],
      borderWidth: 2,
      hoverBackgroundColor: ['rgba(239, 68, 68, 1)', 'rgba(59, 130, 246, 1)'],
    },
  ],
}))

const chartOptions = computed<ChartOptions<'doughnut'>>(() => ({
  responsive: true,
  maintainAspectRatio: true,
  cutout: '65%',
  plugins: {
    legend: {
      position: 'bottom',
      labels: {
        color: '#9ca3af',
        font: { size: 12 },
        padding: 16,
        usePointStyle: true,
        pointStyleWidth: 10,
      },
    },
    tooltip: {
      callbacks: {
        label: (ctx) => ` ${ctx.label}: ${ctx.parsed}%`,
      },
    },
  },
}))
</script>

<template>
  <div class="flex flex-col items-center gap-4">
    <div v-if="!hasData" class="flex flex-col items-center justify-center h-40 gap-2 text-gray-600">
      <UIcon name="i-heroicons-chart-pie" class="w-8 h-8 opacity-30" />
      <span class="text-sm">修復データなし</span>
    </div>
    <div v-else class="w-40 h-40">
      <Doughnut :data="chartData" :options="chartOptions" />
    </div>
    <div v-if="hasData" class="grid grid-cols-2 gap-3 w-full">
      <div class="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
        <span class="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
        <div>
          <p class="text-xs text-gray-400">Security</p>
          <p class="text-lg font-bold text-red-400">{{ causeData.security }}%</p>
        </div>
      </div>
      <div class="flex items-center gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2">
        <span class="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
        <div>
          <p class="text-xs text-gray-400">Performance</p>
          <p class="text-lg font-bold text-blue-400">{{ causeData.performance }}%</p>
        </div>
      </div>
    </div>
  </div>
</template>
