<script setup lang="ts">
definePageMeta({ layout: 'default' })
useHead({ title: 'Admin — Ouroboros' })

const { api, user } = useAuth()

const registrationEnabled = ref(false)
const saving = ref(false)
const logFiles = ref<string[]>([])
const logContent = ref('')

const isAdmin = computed(() => user.value?.role === 'admin')

async function loadSettings() {
  if (!isAdmin.value) return
  const res = await api<{ registrationEnabled: boolean }>('/settings')
  registrationEnabled.value = res.registrationEnabled
}

async function toggleRegistration(value: boolean) {
  saving.value = true
  try {
    const res = await api<{ registrationEnabled: boolean }>('/settings', {
      method: 'PUT',
      body: { registrationEnabled: value },
    })
    registrationEnabled.value = res.registrationEnabled
  } finally {
    saving.value = false
  }
}

async function loadLogs() {
  if (!isAdmin.value) return
  const res = await api<{ files: string[] }>('/logs')
  logFiles.value = res.files
}

async function viewLog(file: string) {
  logContent.value = await api<string>(`/logs/${encodeURIComponent(file)}`, { responseType: 'text' as any })
}

onMounted(async () => {
  await loadSettings()
  await loadLogs()
})
</script>

<template>
  <div class="p-6 space-y-6 max-w-3xl">
    <h1 class="text-xl font-semibold">Admin</h1>

    <UAlert v-if="!isAdmin" color="red" variant="soft" title="Admin only"
            description="You need an admin account to view this page." />

    <template v-else>
      <UCard>
        <template #header><h2 class="font-medium">Access control</h2></template>
        <div class="flex items-center justify-between">
          <div>
            <p class="font-medium">Public registration</p>
            <p class="text-sm text-gray-400">Allow anyone to create an account from /register.</p>
          </div>
          <UToggle
            :model-value="registrationEnabled"
            :loading="saving"
            @update:model-value="toggleRegistration"
          />
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="font-medium">Telemetry logs</h2>
            <UButton size="xs" variant="ghost" icon="i-heroicons-arrow-path" @click="loadLogs" />
          </div>
        </template>
        <div class="flex gap-2 flex-wrap mb-3">
          <UButton v-for="f in logFiles" :key="f" size="xs" variant="soft" @click="viewLog(f)">{{ f }}</UButton>
          <span v-if="!logFiles.length" class="text-sm text-gray-400">No log files.</span>
        </div>
        <pre v-if="logContent" class="text-xs bg-gray-900 p-3 rounded overflow-auto max-h-96 whitespace-pre-wrap">{{ logContent }}</pre>
      </UCard>
    </template>
  </div>
</template>
