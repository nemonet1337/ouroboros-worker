<script setup lang="ts">
definePageMeta({ layout: 'default' })
useHead({ title: 'Admin — Ouroboros' })

const { api, user } = useAuth()

const registrationEnabled = ref(false)
const saving = ref(false)
const adminEmail = ref('')
const adminPassword = ref('')
const adminSaving = ref(false)
const adminSaveStatus = ref<'idle' | 'saved' | 'error'>('idle')
const adminError = ref('')
const logFiles = ref<string[]>([])
const logContent = ref('')

const isAdmin = computed(() => user.value?.role === 'admin')

async function loadSettings() {
  if (!isAdmin.value) return
  const res = await api<{ registrationEnabled: boolean; adminEmail?: string }>('/settings')
  registrationEnabled.value = res.registrationEnabled
  adminEmail.value = res.adminEmail ?? ''
}

// ADMIN_EMAIL / ADMIN_PASSWORD are configured here in the GUI. Saving
// immediately (re)creates the admin account in SQL when it is missing,
// or rotates its password when it exists.
async function saveAdminAccount() {
  adminSaving.value = true
  adminSaveStatus.value = 'idle'
  adminError.value = ''
  try {
    await api('/settings', {
      method: 'PUT',
      body: { adminEmail: adminEmail.value, adminPassword: adminPassword.value },
    })
    adminPassword.value = ''
    adminSaveStatus.value = 'saved'
  } catch (err: any) {
    adminError.value = err?.data?.error?.message ?? 'failed to save admin account'
    adminSaveStatus.value = 'error'
  } finally {
    adminSaving.value = false
    setTimeout(() => { adminSaveStatus.value = 'idle' }, 3000)
  }
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
        <template #header><h2 class="font-medium">Admin account</h2></template>
        <div class="space-y-4">
          <p class="text-sm text-gray-400">
            ADMIN_EMAIL / ADMIN_PASSWORD はここ（GUI）で設定します。保存すると
            アカウントが SQL 上に存在しない場合はこの値で登録され、存在する場合は
            パスワードが更新されます。
          </p>
          <UFormGroup label="ADMIN_EMAIL" name="adminEmail">
            <UInput v-model="adminEmail" type="email" placeholder="admin@example.com" />
          </UFormGroup>
          <UFormGroup label="ADMIN_PASSWORD" name="adminPassword" help="8 文字以上。保存後にこの欄はクリアされます。">
            <UInput v-model="adminPassword" type="password" placeholder="••••••••" />
          </UFormGroup>
          <div class="flex items-center gap-3">
            <UButton
              :loading="adminSaving"
              :disabled="!adminEmail || adminPassword.length < 8"
              @click="saveAdminAccount"
            >
              Save admin account
            </UButton>
            <span v-if="adminSaveStatus === 'saved'" class="text-sm text-emerald-400">✓ Saved</span>
            <span v-else-if="adminSaveStatus === 'error'" class="text-sm text-red-400">{{ adminError }}</span>
          </div>
        </div>
      </UCard>

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
