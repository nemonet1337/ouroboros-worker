<script setup lang="ts">
definePageMeta({ layout: 'default' })
useHead({ title: 'Self-Healing — Ouroboros' })

const { api } = useAuth()

interface RunRow {
  id: string
  status: string
  trigger: string
  workflow_id: string | null
  summary: string | null
  created_at: number
  updated_at: number
}

const runs = ref<RunRow[]>([])
const triggering = ref(false)
const dryRun = ref(true)

async function load() {
  const res = await api<{ runs: RunRow[] }>('/healing')
  runs.value = res.runs
}

async function trigger() {
  triggering.value = true
  try {
    await api('/healing', { method: 'POST', body: { dryRun: dryRun.value } })
    await load()
  } finally {
    triggering.value = false
  }
}

function statusColor(s: string) {
  return s === 'done' ? 'green' : s === 'failed' ? 'red' : 'amber'
}
function fmt(ts: number) {
  return new Date(ts).toLocaleString()
}

onMounted(load)
</script>

<template>
  <div class="p-6 space-y-6 max-w-4xl">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold">Self-Healing Runs</h1>
        <p class="text-sm text-gray-400">Scan → AI analysis → fix → PR cycles.</p>
      </div>
      <div class="flex items-center gap-3">
        <UCheckbox v-model="dryRun" label="Dry run" />
        <UButton :loading="triggering" @click="trigger">Trigger cycle</UButton>
        <UButton variant="ghost" icon="i-heroicons-arrow-path" @click="load" />
      </div>
    </div>

    <UCard>
      <div v-if="!runs.length" class="text-sm text-gray-400">No runs yet.</div>
      <table v-else class="w-full text-sm">
        <thead class="text-left text-gray-400">
          <tr><th class="py-2">Status</th><th>Trigger</th><th>Started</th><th>Summary</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in runs" :key="r.id" class="border-t border-gray-800 align-top">
            <td class="py-2"><UBadge :color="statusColor(r.status)" variant="soft">{{ r.status }}</UBadge></td>
            <td>{{ r.trigger }}</td>
            <td>{{ fmt(r.created_at) }}</td>
            <td class="text-gray-400"><code class="text-xs">{{ r.summary || '—' }}</code></td>
          </tr>
        </tbody>
      </table>
    </UCard>
  </div>
</template>
