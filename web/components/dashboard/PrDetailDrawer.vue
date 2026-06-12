<script setup lang="ts">
interface PrEntry {
  number: number
  title: string
  status: 'merged' | 'open' | 'closed'
  date: string
  branch: string
  cause: 'security' | 'performance' | 'dependency'
}

const props = defineProps<{ pr: PrEntry | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const statusConfig = {
  merged: { label: 'Merged', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/30' },
  open:   { label: 'Open',   color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  closed: { label: 'Closed', color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/30' },
}

const causeConfig = {
  security:    { label: 'Security',    color: 'text-red-400',   bg: 'bg-red-500/10 border-red-500/30' },
  performance: { label: 'Performance', color: 'text-blue-400',  bg: 'bg-blue-500/10 border-blue-500/30' },
  dependency:  { label: 'Dependency',  color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' },
}

onMounted(() => {
  const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') emit('close') }
  document.addEventListener('keydown', handler)
  onUnmounted(() => document.removeEventListener('keydown', handler))
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div v-if="pr" class="fixed inset-0 z-50 flex justify-end">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="emit('close')" />
        <!-- Drawer -->
        <Transition
          enter-active-class="transition duration-200"
          enter-from-class="translate-x-full"
          enter-to-class="translate-x-0"
          leave-active-class="transition duration-150"
          leave-from-class="translate-x-0"
          leave-to-class="translate-x-full"
        >
          <div v-if="pr" class="relative w-full max-w-xl bg-gray-900 border-l border-white/10 flex flex-col shadow-2xl overflow-y-auto">
            <!-- Header -->
            <div class="flex items-start justify-between gap-3 p-5 border-b border-white/10 flex-shrink-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
                  :class="statusConfig[pr.status].bg + ' ' + statusConfig[pr.status].color"
                >
                  {{ statusConfig[pr.status].label }}
                </span>
                <span class="text-gray-400 font-mono text-sm">#{{ pr.number }}</span>
                <span
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
                  :class="causeConfig[pr.cause].bg + ' ' + causeConfig[pr.cause].color"
                >
                  {{ causeConfig[pr.cause].label }}
                </span>
              </div>
              <button
                class="text-gray-400 hover:text-gray-200 transition-colors flex-shrink-0"
                @click="emit('close')"
              >
                <UIcon name="i-heroicons-x-mark" class="w-5 h-5" />
              </button>
            </div>

            <div class="flex-1 p-5 space-y-6 overflow-y-auto">
              <!-- Title -->
              <div>
                <h2 class="text-base font-semibold text-gray-100 leading-snug">{{ pr.title }}</h2>
                <p class="text-xs text-gray-500 font-mono mt-1.5">{{ pr.branch }} → main · {{ pr.date }}</p>
                <p class="text-xs text-gray-500 mt-0.5">authored by ouroboros-bot</p>
              </div>

              <!-- Score before/after (stub) -->
              <div class="grid grid-cols-2 gap-3">
                <div class="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center">
                  <p class="text-xs text-gray-500 mb-2">Before</p>
                  <p class="text-3xl font-bold text-red-400 font-mono">D</p>
                  <p class="text-lg font-bold text-red-300 tabular-nums">48</p>
                </div>
                <div class="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
                  <p class="text-xs text-gray-500 mb-2">After</p>
                  <p class="text-3xl font-bold text-emerald-400 font-mono">A</p>
                  <p class="text-lg font-bold text-emerald-300 tabular-nums">88</p>
                </div>
              </div>

              <!-- Diff summary -->
              <div>
                <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Diff Summary</h3>
                <div class="rounded-lg border border-white/10 bg-gray-950 overflow-hidden">
                  <div class="flex items-center justify-between bg-gray-800/60 px-3 py-1.5">
                    <span class="text-[10px] font-mono text-gray-400">package.json</span>
                  </div>
                  <pre class="text-xs p-3 font-mono leading-relaxed"><span class="text-red-400">- "{{ pr.cause === 'security' ? 'axios' : 'lodash' }}": "0.27.2"</span>
<span class="text-emerald-400">+ "{{ pr.cause === 'security' ? 'axios' : 'lodash' }}": "1.7.4"</span></pre>
                </div>
              </div>

              <!-- Resolved findings -->
              <div>
                <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Resolved Findings (3)</h3>
                <div class="space-y-2">
                  <div class="flex items-center justify-between px-3 py-2 rounded-lg border border-white/10 bg-white/5">
                    <span class="text-xs text-gray-300">SSRF risk in client.ts:24</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/30 text-red-400">critical</span>
                  </div>
                  <div class="flex items-center justify-between px-3 py-2 rounded-lg border border-white/10 bg-white/5">
                    <span class="text-xs text-gray-300">Missing timeout in network call</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 border border-orange-500/30 text-orange-400">high</span>
                  </div>
                  <div class="flex items-center justify-between px-3 py-2 rounded-lg border border-white/10 bg-white/5">
                    <span class="text-xs text-gray-300">Deprecated default export</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 border border-blue-500/30 text-blue-400">low</span>
                  </div>
                </div>
              </div>

              <!-- Actions -->
              <div class="flex flex-wrap gap-2">
                <button class="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-colors">
                  <UIcon name="i-heroicons-arrow-top-right-on-square" class="w-3.5 h-3.5" />
                  Open on GitHub
                </button>
                <button class="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-white/15 hover:bg-white/5 text-xs font-medium text-gray-300 transition-colors">
                  <UIcon name="i-heroicons-magnifying-glass" class="w-3.5 h-3.5" />
                  Re-run Inspection
                </button>
                <button class="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-white/15 hover:bg-white/5 text-xs font-medium text-gray-400 transition-colors">
                  Mark as known issue
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
