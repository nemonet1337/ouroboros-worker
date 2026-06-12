<script setup lang="ts">
const props = defineProps<{ score: number; grade: string }>()

const RADIUS = 40
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const GAP_DEG = 60 // degrees kept empty at the bottom

const gradeColor = computed(() => ({
  S: '#10b981', A: '#10b981', B: '#3b82f6', C: '#f59e0b', D: '#f97316', F: '#ef4444',
}[props.grade] ?? '#ef4444'))

// Arc covers (360 - GAP_DEG) degrees of the circle
const arcFraction = computed(() => ((360 - GAP_DEG) / 360) * (props.score / 100))
const dashArray = computed(() => {
  const total = CIRCUMFERENCE
  const filled = total * ((360 - GAP_DEG) / 360) * (props.score / 100)
  return `${filled} ${total}`
})
const bgDashArray = computed(() => {
  const arc = CIRCUMFERENCE * ((360 - GAP_DEG) / 360)
  return `${arc} ${CIRCUMFERENCE}`
})
// Rotate so gap is at the bottom centre
const rotation = computed(() => 90 + GAP_DEG / 2)
</script>

<template>
  <div class="flex flex-col items-center gap-2">
    <div class="relative w-36 h-36">
      <svg viewBox="0 0 100 100" class="w-full h-full -rotate-0">
        <!-- Background arc -->
        <circle
          cx="50" cy="50" :r="RADIUS"
          fill="none" stroke="#1f2937" stroke-width="9"
          :stroke-dasharray="bgDashArray"
          stroke-linecap="round"
          :transform="`rotate(${rotation} 50 50)`"
        />
        <!-- Score arc -->
        <circle
          cx="50" cy="50" :r="RADIUS"
          fill="none" :stroke="gradeColor" stroke-width="9"
          :stroke-dasharray="dashArray"
          stroke-linecap="round"
          :transform="`rotate(${rotation} 50 50)`"
          class="transition-all duration-700 ease-out"
        />
      </svg>
      <!-- Center label -->
      <div class="absolute inset-0 flex flex-col items-center justify-center mt-2">
        <span class="text-3xl font-bold tabular-nums" :style="{ color: gradeColor }">{{ score }}</span>
        <span class="text-xs text-gray-400">/100</span>
      </div>
    </div>
    <!-- Grade badge -->
    <div
      class="px-3 py-0.5 rounded-full text-sm font-bold border"
      :style="{ color: gradeColor, borderColor: gradeColor + '40', backgroundColor: gradeColor + '15' }"
    >
      Grade {{ grade }}
    </div>
  </div>
</template>
