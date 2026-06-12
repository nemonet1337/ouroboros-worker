<script setup lang="ts">
const props = defineProps<{
  editingEndpoint?: {
    id: string
    name: string
    url: string
    adapter: 'slack' | 'discord' | 'github' | 'generic'
    events: string[]
    secret: string
    scoreThresholds?: { overall?: number }
  }
}>()

const emit = defineEmits<{
  (e: 'saved'): void
  (e: 'cancel'): void
}>()

const form = reactive({
  name: '',
  url: '',
  adapter: 'generic' as 'slack' | 'discord' | 'github' | 'generic',
  events: ['inspection.completed'] as string[],
  secret: '',
  scoreThresholds: { overall: 70 as number | undefined },
  enabled: true,
})

onMounted(() => {
  if (props.editingEndpoint) {
    form.name = props.editingEndpoint.name
    form.url = props.editingEndpoint.url
    form.adapter = props.editingEndpoint.adapter
    form.events = [...props.editingEndpoint.events]
    form.secret = props.editingEndpoint.secret || ''
    if (props.editingEndpoint.scoreThresholds?.overall !== undefined) {
      form.scoreThresholds.overall = props.editingEndpoint.scoreThresholds.overall
    }
  }
})

const adapters = [
  { value: 'slack',   label: 'Slack',   icon: 'i-mdi-slack' },
  { value: 'discord', label: 'Discord', icon: 'i-mdi-discord' },
  { value: 'github',  label: 'GitHub',  icon: 'i-mdi-github' },
  { value: 'generic', label: 'Generic HTTP', icon: 'i-heroicons-globe-alt' },
]

const eventOptions = [
  { value: 'inspection.completed',          label: 'インスペクション完了' },
  { value: 'inspection.threshold_breached', label: 'スコア閾値超過' },
  { value: 'inspection.failed',             label: 'インスペクション失敗' },
]

const saving = ref(false)
const error = ref('')
const { api } = useApi()

async function save() {
  if (!form.name || !form.url) { error.value = 'Name と URL は必須です'; return }
  saving.value = true; error.value = ''
  try {
    if (props.editingEndpoint) {
      await api(`/webhooks/${props.editingEndpoint.id}`, {
        method: 'PATCH',
        body: {
          name: form.name,
          url: form.url,
          type: form.adapter,
          events: form.events,
          secret: form.secret,
          scoreThresholds: { overall: form.scoreThresholds.overall }
        }
      })
    } else {
      await api('/webhooks', {
        method: 'POST',
        body: { ...form, scoreThresholds: { overall: form.scoreThresholds.overall } },
      })
    }
    emit('saved')
  } catch (e: any) {
    error.value = e?.data?.error?.message ?? e?.message ?? 'Unknown error'
  } finally {
    saving.value = false
  }
}

function toggleEvent(val: string) {
  const idx = form.events.indexOf(val)
  if (idx >= 0) form.events.splice(idx, 1)
  else form.events.push(val)
}
</script>

<template>
  <div class="space-y-4">
    <div class="grid grid-cols-2 gap-3">
      <!-- Name -->
      <div class="space-y-1 col-span-2">
        <label class="text-xs text-gray-400">エンドポイント名</label>
        <UInput v-model="form.name" placeholder="My Slack Channel" size="sm" />
      </div>
      <!-- URL -->
      <div class="space-y-1 col-span-2">
        <label class="text-xs text-gray-400">Webhook URL</label>
        <UInput v-model="form.url" placeholder="https://hooks.slack.com/..." size="sm" />
      </div>
      <!-- Adapter -->
      <div class="space-y-1">
        <label class="text-xs text-gray-400">アダプター</label>
        <USelect
          v-model="form.adapter"
          :options="adapters.map(a => ({ value: a.value, label: a.label }))"
          size="sm"
        />
      </div>
      <!-- Secret -->
      <div class="space-y-1">
        <label class="text-xs text-gray-400">署名シークレット（任意）</label>
        <UInput v-model="form.secret" type="password" placeholder="HMAC-SHA256 secret" size="sm" />
      </div>
    </div>

    <!-- Events -->
    <div class="space-y-2">
      <label class="text-xs text-gray-400">通知イベント</label>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="ev in eventOptions" :key="ev.value"
          @click="toggleEvent(ev.value)"
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-colors"
          :class="form.events.includes(ev.value)
            ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
            : 'border-white/10 text-gray-400 hover:text-gray-200'"
        >
          <UIcon
            :name="form.events.includes(ev.value) ? 'i-heroicons-check' : 'i-heroicons-plus'"
            class="w-3 h-3"
          />
          {{ ev.label }}
        </button>
      </div>
    </div>

    <!-- Score threshold -->
    <div v-if="form.events.includes('inspection.threshold_breached')" class="space-y-1">
      <label class="text-xs text-gray-400">総合スコア閾値（この値を下回ると通知）</label>
      <div class="flex items-center gap-2">
        <input
          v-model.number="form.scoreThresholds.overall"
          type="range" min="0" max="100" step="5"
          class="flex-1 accent-indigo-500"
        />
        <span class="text-sm font-bold text-indigo-300 w-8 tabular-nums">{{ form.scoreThresholds.overall }}</span>
      </div>
    </div>

    <!-- Error -->
    <p v-if="error" class="text-xs text-red-400">{{ error }}</p>

    <!-- Actions -->
    <div class="flex gap-2 pt-1">
      <UButton size="sm" color="indigo" :loading="saving" @click="save">保存</UButton>
      <UButton size="sm" color="gray" variant="ghost" @click="emit('cancel')">キャンセル</UButton>
    </div>
  </div>
</template>
