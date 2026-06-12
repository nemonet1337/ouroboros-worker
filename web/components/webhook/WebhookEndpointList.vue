<script setup lang="ts">
interface Endpoint {
  id: string; name: string; url: string; adapter: string
  events: string[]; enabled: boolean
  scoreThresholds?: { overall?: number }
}

const props = defineProps<{ endpoints: Endpoint[] }>()
const emit = defineEmits<{
  (e: 'refresh'): void
  (e: 'edit', ep: Endpoint): void
}>()

const ADAPTER_ICON: Record<string, string> = {
  slack: 'i-mdi-slack', discord: 'i-mdi-discord',
  github: 'i-mdi-github', generic: 'i-heroicons-globe-alt',
}
const ADAPTER_COLOR: Record<string, string> = {
  slack: 'text-pink-400', discord: 'text-indigo-400',
  github: 'text-gray-300', generic: 'text-blue-400',
}

const { api } = useApi()
const testingId = ref<string | null>(null)
const testResult = ref<Record<string, { success: boolean; msg: string }>>({})
const deletingId = ref<string | null>(null)
const confirmDeleteId = ref<string | null>(null)
const confirmDeleteText = ref('')
const localEnabled = ref<Record<string, boolean>>({})

async function toggleEnabled(ep: Endpoint) {
  const nextVal = !getEnabled(ep)
  localEnabled.value[ep.id] = nextVal
  try {
    await api(`/webhooks/${ep.id}`, {
      method: 'PATCH',
      body: { enabled: nextVal }
    })
    emit('refresh')
  } catch {
    localEnabled.value[ep.id] = !nextVal
  }
}

function getEnabled(ep: Endpoint): boolean {
  return localEnabled.value[ep.id] !== undefined ? localEnabled.value[ep.id] : ep.enabled
}

async function testEndpoint(ep: Endpoint) {
  testingId.value = ep.id
  try {
    const res = await api<{ success: boolean; statusCode?: number }>(`/webhooks/${ep.id}/test`, { method: 'POST' })
    testResult.value[ep.id] = {
      success: res.success,
      msg: res.success ? `HTTP ${res.statusCode ?? 200} OK` : `Failed`,
    }
  } catch {
    testResult.value[ep.id] = { success: false, msg: 'Request failed' }
  } finally {
    testingId.value = null
    setTimeout(() => { delete testResult.value[ep.id] }, 4000)
  }
}

function openDeleteConfirm(id: string) {
  confirmDeleteId.value = id
  confirmDeleteText.value = ''
}

async function confirmDelete() {
  if (!confirmDeleteId.value || confirmDeleteText.value !== 'delete') return
  deletingId.value = confirmDeleteId.value
  try {
    await api(`/webhooks/${confirmDeleteId.value}`, { method: 'DELETE' })
    emit('refresh')
  } finally {
    deletingId.value = null
    confirmDeleteId.value = null
    confirmDeleteText.value = ''
  }
}

function cancelDelete() {
  confirmDeleteId.value = null
  confirmDeleteText.value = ''
}

const pendingEndpoint = computed(() =>
  confirmDeleteId.value ? props.endpoints.find(e => e.id === confirmDeleteId.value) : null
)
</script>

<template>
  <div class="space-y-3">
    <div v-if="endpoints.length === 0" class="flex flex-col items-center py-10 gap-2 text-gray-500">
      <UIcon name="i-heroicons-bell-slash" class="w-8 h-8" />
      <p class="text-sm">Webhookエンドポイントが設定されていません</p>
    </div>

    <div
      v-for="ep in endpoints"
      :key="ep.id"
      class="rounded-xl border border-white/10 bg-gray-900/60 p-4 space-y-3 transition-opacity"
      :class="{ 'opacity-60': !getEnabled(ep) }"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <UIcon
            :name="ADAPTER_ICON[ep.adapter] ?? 'i-heroicons-globe-alt'"
            class="w-4 h-4 flex-shrink-0"
            :class="ADAPTER_COLOR[ep.adapter]"
          />
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-medium text-gray-100">{{ ep.name }}</span>
              <span
                class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border"
                :class="getEnabled(ep)
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-gray-500/10 border-gray-500/30 text-gray-500'"
              >
                <span class="w-1 h-1 rounded-full" :class="getEnabled(ep) ? 'bg-emerald-400' : 'bg-gray-500'" />
                {{ getEnabled(ep) ? 'enabled' : 'disabled' }}
              </span>
            </div>
            <p class="text-[11px] text-gray-500 font-mono truncate mt-0.5">{{ ep.url }}</p>
          </div>
        </div>

        <div class="flex items-center gap-1.5 flex-shrink-0">
          <!-- Enable/disable toggle -->
          <button
            class="relative w-10 h-5 rounded-full border transition-colors flex-shrink-0"
            :class="getEnabled(ep)
              ? 'bg-indigo-500/30 border-indigo-500/60'
              : 'bg-gray-700 border-gray-600'"
            @click="toggleEnabled(ep)"
          >
            <span
              class="absolute top-0.5 w-4 h-4 rounded-full transition-all"
              :class="getEnabled(ep) ? 'bg-indigo-400 right-0.5' : 'bg-gray-400 left-0.5'"
            />
          </button>
          <UButton size="xs" color="blue" variant="ghost" :loading="testingId === ep.id" @click="testEndpoint(ep)">▶ Test</UButton>
          <UButton size="xs" color="gray" variant="ghost" icon="i-heroicons-pencil-square" @click="emit('edit', ep)" />
          <UButton size="xs" color="red" variant="ghost" icon="i-heroicons-trash" :loading="deletingId === ep.id" @click="openDeleteConfirm(ep.id)" />
        </div>
      </div>

      <div class="flex flex-wrap gap-1.5">
        <span
          v-for="ev in ep.events" :key="ev"
          class="text-[10px] px-2 py-0.5 rounded-full border font-medium"
          :class="ev === 'inspection.completed'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : ev === 'inspection.failed'
              ? 'bg-red-500/10 border-red-500/30 text-red-400'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-400'"
        >{{ ev }}</span>
        <span
          v-if="ep.scoreThresholds?.overall"
          class="text-[10px] px-2 py-0.5 rounded-full bg-amber-900/30 border border-amber-500/20 text-amber-400"
        >threshold ≤ {{ ep.scoreThresholds.overall }}</span>
      </div>

      <div
        v-if="testResult[ep.id]"
        class="flex items-center gap-1.5 text-[11px] rounded-lg px-3 py-1.5 border"
        :class="testResult[ep.id].success ? 'bg-emerald-900/30 text-emerald-300 border-emerald-500/20' : 'bg-red-900/30 text-red-300 border-red-500/20'"
      >
        <UIcon :name="testResult[ep.id].success ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'" class="w-3.5 h-3.5" />
        {{ testResult[ep.id].msg }}
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <Teleport to="body">
      <div v-if="confirmDeleteId" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="cancelDelete" />
        <div class="relative w-full max-w-md bg-gray-900 rounded-2xl border border-white/15 shadow-2xl shadow-black/60">
          <div class="p-6 space-y-4">
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center flex-shrink-0">
                <UIcon name="i-heroicons-trash" class="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 class="text-base font-semibold text-gray-100">Delete webhook?</h3>
                <p class="text-xs text-gray-500 font-mono mt-0.5">{{ pendingEndpoint?.name }} · {{ pendingEndpoint?.adapter }}</p>
              </div>
            </div>
            <div class="border-t border-white/10" />
            <p class="text-sm text-gray-400 leading-relaxed">このエンドポイントを削除すると、過去の配信ログは保持されますが、新しいイベントは送信されません。</p>
            <div class="rounded-lg border border-amber-500/20 bg-amber-900/15 px-3 py-2.5">
              <p class="text-xs text-amber-300">
                <UIcon name="i-heroicons-exclamation-triangle" class="w-3.5 h-3.5 inline mr-1" />
                This action cannot be undone.
              </p>
            </div>
            <div class="space-y-1.5">
              <label class="text-xs text-gray-400">確認のため <span class="font-mono text-gray-200">delete</span> と入力してください</label>
              <input
                v-model="confirmDeleteText"
                placeholder='Type "delete" to confirm'
                class="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 font-mono placeholder-gray-600 focus:outline-none focus:border-red-500/50 transition-colors"
              />
            </div>
            <div class="flex justify-end gap-2">
              <button class="px-4 py-2 rounded-lg border border-white/10 text-sm text-gray-400 hover:bg-white/5 transition-colors" @click="cancelDelete">Cancel</button>
              <button
                class="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                :class="confirmDeleteText === 'delete' ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'"
                :disabled="confirmDeleteText !== 'delete'"
                @click="confirmDelete"
              >
                <UIcon name="i-heroicons-trash" class="w-4 h-4" />
                Delete endpoint
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
