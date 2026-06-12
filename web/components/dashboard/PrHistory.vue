<script setup lang="ts">
const { prHistory } = useDashboard()

const emit = defineEmits<{ (e: 'select', pr: any): void }>()

const statusConfig = {
  merged: { label: 'Merged', color: 'purple' as const },
  open:   { label: 'Open',   color: 'emerald' as const },
  closed: { label: 'Closed', color: 'red' as const },
}

const causeConfig = {
  security:    { label: 'Security', class: 'bg-red-500/20 text-red-400 border-red-500/30' },
  performance: { label: 'Perf',     class: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  dependency:  { label: 'Dep',      class: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
}

const page = ref(1)
const perPage = 5
const totalPages = computed(() => Math.ceil(prHistory.value.length / perPage))
const paginated = computed(() => prHistory.value.slice((page.value - 1) * perPage, page.value * perPage))
</script>

<template>
  <div class="space-y-3">
    <div class="overflow-hidden rounded-lg border border-white/10">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-white/10 bg-white/5">
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-400">#</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-400">Title</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-400 hidden sm:table-cell">Cause</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-400 hidden md:table-cell">Date</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-400">Status</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-white/5">
          <tr
            v-for="pr in paginated"
            :key="pr.number"
            class="hover:bg-white/5 transition-colors cursor-pointer group"
            @click="emit('select', pr)"
          >
            <td class="px-3 py-2.5 text-gray-500 font-mono text-xs whitespace-nowrap">
              #{{ pr.number }}
            </td>
            <td class="px-3 py-2.5 max-w-[200px]">
              <p class="text-gray-200 text-xs truncate group-hover:text-white transition-colors" :title="pr.title">{{ pr.title }}</p>
              <p class="text-gray-500 text-xs font-mono truncate mt-0.5" :title="pr.branch">{{ pr.branch }}</p>
            </td>
            <td class="px-3 py-2.5 hidden sm:table-cell">
              <span
                class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border"
                :class="causeConfig[pr.cause].class"
              >
                {{ causeConfig[pr.cause].label }}
              </span>
            </td>
            <td class="px-3 py-2.5 text-gray-400 text-xs whitespace-nowrap hidden md:table-cell">
              {{ pr.date }}
            </td>
            <td class="px-3 py-2.5">
              <UBadge :label="statusConfig[pr.status].label" :color="statusConfig[pr.status].color" variant="subtle" size="xs" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-between">
      <span class="text-xs text-gray-500">
        {{ (page - 1) * perPage + 1 }}–{{ Math.min(page * perPage, prHistory.length) }} / {{ prHistory.length }} PRs
      </span>
      <div class="flex items-center gap-1">
        <button
          :disabled="page === 1"
          class="px-2.5 py-1 rounded-md border border-white/10 text-xs text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          @click="page--"
        >‹</button>
        <button
          v-for="p in totalPages" :key="p"
          class="w-7 h-7 rounded-md border text-xs transition-colors"
          :class="p === page ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'border-white/10 text-gray-400 hover:text-gray-200'"
          @click="page = p"
        >{{ p }}</button>
        <button
          :disabled="page === totalPages"
          class="px-2.5 py-1 rounded-md border border-white/10 text-xs text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          @click="page++"
        >›</button>
      </div>
    </div>
  </div>
</template>
