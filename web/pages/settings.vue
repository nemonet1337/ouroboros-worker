<script setup lang="ts">
definePageMeta({ layout: 'default' })

useHead({ title: 'Settings — Ouroboros' })

const navSections = [
  { id: 'general',      label: 'General',          icon: 'i-heroicons-cog-6-tooth' },
  { id: 'weights',      label: 'Score weights',     icon: 'i-heroicons-chart-bar' },
  { id: 'thresholds',   label: 'Grade thresholds',  icon: 'i-heroicons-academic-cap' },
  { id: 'schedule',     label: 'Scan schedule',     icon: 'i-heroicons-clock' },
  { id: 'notifications',label: 'Notifications',     icon: 'i-heroicons-bell' },
  { id: 'danger',       label: 'Danger zone',       icon: 'i-heroicons-exclamation-triangle' },
]

const activeSection = ref('general')

const weights = reactive({
  security: 25,
  performance: 20,
  redundancy: 15,
  readability: 15,
  design: 15,
  correctness: 10,
})

const gradeThresholds = reactive({
  S: 95, A: 85, B: 70, C: 55, D: 40, F: 0,
})

const scheduleMode = ref<'cron' | 'interval' | 'manual'>('cron')
const cronTimezone = ref('Asia/Tokyo')
const intervalMinutes = ref(60)

// Cron GUI state
const DAYS_OF_WEEK = [
  { label: '月', value: 1 },
  { label: '火', value: 2 },
  { label: '水', value: 3 },
  { label: '木', value: 4 },
  { label: '金', value: 5 },
  { label: '土', value: 6 },
  { label: '日', value: 0 },
]
const cronSelectedDays = ref<number[]>([1, 2, 3, 4, 5]) // Mon-Fri default
const cronHour = ref(3)
const cronMinute = ref(0)

const cronExpr = computed(() => {
  if (cronSelectedDays.value.length === 0) return `${cronMinute.value} ${cronHour.value} * * *`
  const days = [...cronSelectedDays.value].sort((a, b) => a - b).join(',')
  return `${cronMinute.value} ${cronHour.value} * * ${days}`
})

function toggleDay(day: number) {
  const idx = cronSelectedDays.value.indexOf(day)
  if (idx >= 0) cronSelectedDays.value.splice(idx, 1)
  else cronSelectedDays.value.push(day)
}

function parseCronToGui(expr: string) {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return
  const [minute, hour, , , days] = parts
  cronMinute.value = Number(minute) || 0
  cronHour.value = Number(hour) || 0
  if (days === '*') {
    cronSelectedDays.value = []
  } else {
    cronSelectedDays.value = days.split(',').map(Number).filter(n => !isNaN(n))
  }
}

const notifications = reactive({
  browserPush: true,
  emailDigest: true,
  emailThreshold: false,
  sound: false,
})


const totalWeight = computed(() => Object.values(weights).reduce((a, b) => a + b, 0))

const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const { api } = useApi()
const { user } = useAuth()

const email = ref('')
const password = ref('')
const profileSaveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const profileError = ref('')

watch(() => user.value?.email, (newVal) => {
  if (newVal) email.value = newVal
}, { immediate: true })

async function saveProfile() {
  profileSaveStatus.value = 'saving'
  profileError.value = ''
  try {
    const res = await api<{ user: any }>('/auth/me', {
      method: 'PUT',
      body: {
        email: email.value,
        password: password.value || undefined
      }
    })
    user.value = res.user
    password.value = ''
    profileSaveStatus.value = 'saved'
  } catch (err: any) {
    profileError.value = err?.data?.error?.message || 'プロファイルの更新に失敗しました'
    profileSaveStatus.value = 'error'
  } finally {
    setTimeout(() => { profileSaveStatus.value = 'idle' }, 2000)
  }
}

async function saveSection(section: string, payload: Record<string, unknown>) {
  saveStatus.value = 'saving'
  try {
    await api('/settings', { method: 'PUT', body: { [section]: payload } })
    saveStatus.value = 'saved'
  } catch {
    saveStatus.value = 'error'
  } finally {
    setTimeout(() => { saveStatus.value = 'idle' }, 2000)
  }
}

async function saveWeights() {
  await saveSection('weights', { ...weights })
}

async function saveThresholds() {
  await saveSection('gradeThresholds', { ...gradeThresholds })
}

async function saveSchedule() {
  await saveSection('schedule', {
    mode: scheduleMode.value,
    cronExpr: cronExpr.value,
    cronTimezone: cronTimezone.value,
    intervalMinutes: intervalMinutes.value,
  })
}

onMounted(async () => {
  const stored = await api<Record<string, any>>('/settings').catch(() => null)
  if (stored) {
    if (stored.weights) Object.assign(weights, stored.weights)
    if (stored.gradeThresholds) Object.assign(gradeThresholds, stored.gradeThresholds)
    if (stored.schedule) {
      if (stored.schedule.mode) scheduleMode.value = stored.schedule.mode
      if (stored.schedule.cronExpr) parseCronToGui(stored.schedule.cronExpr)
      if (stored.schedule.cronTimezone) cronTimezone.value = stored.schedule.cronTimezone
      if (stored.schedule.intervalMinutes) intervalMinutes.value = stored.schedule.intervalMinutes
    }
    if (stored.notifications) Object.assign(notifications, stored.notifications)
  }
})

const gradeBars = [
  { label: 'F', from: 0,  to: 40,  bg: 'rgba(239,68,68,0.25)' },
  { label: 'D', from: 40, to: 55,  bg: 'rgba(249,115,22,0.25)' },
  { label: 'C', from: 55, to: 70,  bg: 'rgba(245,158,11,0.30)' },
  { label: 'B', from: 70, to: 85,  bg: 'rgba(245,158,11,0.40)' },
  { label: 'A', from: 85, to: 95,  bg: 'rgba(16,185,129,0.30)' },
  { label: 'S', from: 95, to: 100, bg: 'rgba(16,185,129,0.50)' },
]

const dimensionColor: Record<string, string> = {
  security:    'bg-red-500',
  performance: 'bg-emerald-500',
  redundancy:  'bg-amber-400',
  readability: 'bg-emerald-400',
  design:      'bg-amber-500',
  correctness: 'bg-indigo-500',
}

function scrollTo(id: string) {
  activeSection.value = id
  const el = document.getElementById('section-' + id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div class="flex-1 max-w-screen-xl mx-auto w-full px-4 py-6 flex gap-6 overflow-hidden">

    <!-- Left: Section nav -->
    <aside class="w-52 flex-shrink-0">
      <div class="sticky top-24 space-y-0.5">
        <button
          v-for="s in navSections"
          :key="s.id"
          class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-left transition-colors"
          :class="activeSection === s.id
            ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
            : 'text-gray-400 hover:text-gray-200 hover:bg-white/5 border border-transparent'"
          @click="scrollTo(s.id)"
        >
          <UIcon :name="s.icon" class="w-3.5 h-3.5 flex-shrink-0" />
          {{ s.label }}
        </button>
      </div>
    </aside>

    <!-- Right: Settings sections -->
    <main class="flex-1 space-y-6 overflow-y-auto pb-6">

      <!-- General Settings -->
      <section :id="'section-general'">
        <UCard :ui="{ base: 'bg-gray-900 border border-white/10', header: { base: 'border-b border-white/10 py-3' }, body: { padding: 'p-5' } }">
          <template #header>
            <div class="flex items-center gap-2 text-sm font-medium text-gray-200">
              <UIcon name="i-heroicons-cog-6-tooth" class="w-4 h-4 text-indigo-400" />
              General Settings
            </div>
          </template>
          <div class="space-y-4">
            <UFormGroup label="Login ID (Email)">
              <UInput v-model="email" type="email" required placeholder="admin@example.com" />
            </UFormGroup>
            <UFormGroup label="New Password" help="変更する場合のみ入力（8文字以上）">
              <UInput v-model="password" type="password" placeholder="••••••••" />
            </UFormGroup>
            <UAlert v-if="profileError" color="red" variant="soft" :title="profileError" />
          </div>
          <div class="flex justify-end mt-4 pt-4 border-t border-white/10">
            <button
              class="px-3 py-1.5 text-xs text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
              @click="saveProfile"
            >
              {{ profileSaveStatus === 'saving' ? '…' : profileSaveStatus === 'saved' ? '✓ Saved' : '💾 Save' }}
            </button>
          </div>
        </UCard>
      </section>

      <!-- Score Weights -->
      <section :id="'section-weights'">
        <UCard :ui="{ base: 'bg-gray-900 border border-white/10', header: { base: 'border-b border-white/10 py-3' }, body: { padding: 'p-5' } }">
          <template #header>
            <div class="flex items-center gap-2 text-sm font-medium text-gray-200">
              <UIcon name="i-heroicons-chart-bar" class="w-4 h-4 text-indigo-400" />
              Default Score Weights
            </div>
          </template>
          <p class="text-xs text-gray-500 mb-4">合計 100% に正規化されます。</p>
          <div class="space-y-4">
            <div
              v-for="(val, dim) in weights"
              :key="dim"
              class="flex items-center gap-3"
            >
              <span class="w-32 text-sm text-gray-300 capitalize">{{ dim }}</span>
              <div class="flex-1 h-2 rounded-full bg-gray-800 overflow-hidden">
                <div
                  class="h-full rounded-full transition-all"
                  :class="dimensionColor[dim]"
                  :style="{ width: `${val * 4}%` }"
                />
              </div>
              <div class="flex items-center gap-2">
                <input
                  v-model.number="weights[dim]"
                  type="number" min="0" max="100" step="5"
                  class="w-16 bg-gray-800 border border-white/10 rounded-lg px-2 py-1 text-xs text-center font-mono text-gray-200 focus:outline-none focus:border-indigo-500/50"
                />
                <span class="text-xs text-gray-500">%</span>
              </div>
            </div>
          </div>
          <div class="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
            <span class="text-xs" :class="totalWeight === 100 ? 'text-emerald-400' : 'text-red-400'">
              Σ = {{ totalWeight }}%
              <span v-if="totalWeight !== 100" class="ml-1">(should be 100%)</span>
            </span>
            <div class="flex gap-2">
              <button class="px-3 py-1.5 text-xs text-gray-400 border border-white/10 rounded-lg hover:bg-white/5 transition-colors">↺ Reset</button>
              <button class="px-3 py-1.5 text-xs text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors" @click="saveWeights">
                {{ saveStatus === 'saving' ? '…' : saveStatus === 'saved' ? '✓ Saved' : '💾 Save' }}
              </button>
            </div>
          </div>
        </UCard>
      </section>

      <!-- Grade Thresholds -->
      <section :id="'section-thresholds'">
        <UCard :ui="{ base: 'bg-gray-900 border border-white/10', header: { base: 'border-b border-white/10 py-3' }, body: { padding: 'p-5' } }">
          <template #header>
            <div class="flex items-center gap-2 text-sm font-medium text-gray-200">
              <UIcon name="i-heroicons-academic-cap" class="w-4 h-4 text-amber-400" />
              Grade Thresholds
            </div>
          </template>
          <p class="text-xs text-gray-500 mb-4">スコア → グレードの境界値</p>

          <div class="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-5">
            <div
              v-for="(threshold, grade) in gradeThresholds"
              :key="grade"
              class="rounded-lg border border-white/10 bg-white/5 p-3 text-center"
            >
              <p class="text-lg font-bold mb-1" :class="{
                'text-emerald-400': grade === 'S' || grade === 'A',
                'text-amber-400': grade === 'B' || grade === 'C',
                'text-red-400': grade === 'D' || grade === 'F',
              }">{{ grade }}</p>
              <div class="flex items-center justify-center gap-1 text-xs text-gray-400">
                <span>≥</span>
                <input
                  v-model.number="gradeThresholds[grade as keyof typeof gradeThresholds]"
                  type="number" min="0" max="100"
                  class="w-10 bg-gray-800 border border-white/10 rounded px-1 py-0.5 text-xs text-center font-mono text-gray-200 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <!-- Grade bar visualization -->
          <div class="relative h-10 rounded-lg overflow-hidden border border-white/10">
            <div
              v-for="bar in gradeBars"
              :key="bar.label"
              class="absolute top-0 bottom-0 flex items-center justify-center text-xs font-bold text-gray-300 border-r border-white/10"
              :style="{ left: bar.from + '%', width: (bar.to - bar.from) + '%', background: bar.bg }"
            >
              {{ bar.label }}
            </div>
          </div>
          <div class="flex justify-end mt-3">
            <button class="px-3 py-1.5 text-xs text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors" @click="saveThresholds">
              {{ saveStatus === 'saving' ? '…' : saveStatus === 'saved' ? '✓ Saved' : '💾 Save' }}
            </button>
          </div>
        </UCard>
      </section>

      <!-- Scan Schedule -->
      <section :id="'section-schedule'">
        <UCard :ui="{ base: 'bg-gray-900 border border-white/10', header: { base: 'border-b border-white/10 py-3' }, body: { padding: 'p-5' } }">
          <template #header>
            <div class="flex items-center gap-2 text-sm font-medium text-gray-200">
              <UIcon name="i-heroicons-clock" class="w-4 h-4 text-blue-400" />
              Scan Schedule
            </div>
          </template>
          <div class="flex gap-2 mb-4">
            <button
              v-for="m in (['cron', 'interval', 'manual'] as const)"
              :key="m"
              class="px-3 py-1.5 rounded-lg text-xs border transition-colors capitalize"
              :class="scheduleMode === m
                ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                : 'border-white/10 text-gray-400 hover:text-gray-200'"
              @click="scheduleMode = m"
            >
              <span class="mr-1">{{ scheduleMode === m ? '●' : '○' }}</span>
              {{ m }}
            </button>
          </div>

          <div v-if="scheduleMode === 'cron'" class="space-y-5">
            <!-- Day of week picker -->
            <div class="space-y-2">
              <label class="text-xs text-gray-400">実行曜日</label>
              <div class="flex gap-1.5">
                <button
                  v-for="d in DAYS_OF_WEEK"
                  :key="d.value"
                  class="w-9 h-9 rounded-lg text-xs font-medium border transition-colors"
                  :class="cronSelectedDays.includes(d.value)
                    ? 'bg-indigo-500/25 border-indigo-500/60 text-indigo-300'
                    : 'border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20'"
                  @click="toggleDay(d.value)"
                >{{ d.label }}</button>
                <button
                  class="ml-1 px-2 h-9 rounded-lg text-[10px] border border-white/10 text-gray-500 hover:text-gray-300 transition-colors"
                  @click="cronSelectedDays = cronSelectedDays.length > 0 ? [] : [1,2,3,4,5,6,0]"
                >{{ cronSelectedDays.length > 0 ? '全解除' : '全選択' }}</button>
              </div>
              <p v-if="cronSelectedDays.length === 0" class="text-[11px] text-amber-400">曜日未選択の場合は毎日実行されます</p>
            </div>

            <!-- Time picker -->
            <div class="space-y-2">
              <label class="text-xs text-gray-400">実行時刻</label>
              <div class="flex items-center gap-2">
                <div class="space-y-1">
                  <p class="text-[10px] text-gray-500">時</p>
                  <select
                    v-model.number="cronHour"
                    class="w-16 bg-gray-800 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-indigo-500/50"
                  >
                    <option v-for="h in 24" :key="h-1" :value="h-1">{{ String(h-1).padStart(2,'0') }}</option>
                  </select>
                </div>
                <span class="text-gray-500 mt-4">:</span>
                <div class="space-y-1">
                  <p class="text-[10px] text-gray-500">分</p>
                  <select
                    v-model.number="cronMinute"
                    class="w-16 bg-gray-800 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-indigo-500/50"
                  >
                    <option v-for="m in [0,5,10,15,20,25,30,35,40,45,50,55]" :key="m" :value="m">{{ String(m).padStart(2,'0') }}</option>
                  </select>
                </div>
                <div class="space-y-1 ml-2">
                  <p class="text-[10px] text-gray-500">Timezone</p>
                  <input
                    v-model="cronTimezone"
                    class="w-32 bg-gray-800 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-indigo-500/50"
                  />
                </div>
              </div>
            </div>

            <!-- Generated cron preview -->
            <div class="flex items-center gap-2 rounded-lg bg-gray-800/60 border border-white/10 px-3 py-2">
              <span class="text-[10px] text-gray-500 uppercase tracking-wide">Cron</span>
              <code class="text-xs font-mono text-indigo-300 flex-1">{{ cronExpr }}</code>
            </div>
          </div>

          <div v-else-if="scheduleMode === 'manual'" class="text-sm text-gray-400">
            スキャンはインスペクションページから手動で実行します。
          </div>
          <div v-else class="space-y-2">
            <label class="text-xs text-gray-400">Interval (minutes)</label>
            <input
              v-model.number="intervalMinutes"
              type="number" min="1" max="10080"
              class="w-24 bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500/50"
            />
            <p class="text-xs text-gray-500">{{ intervalMinutes }} 分ごとにスキャンを実行します。</p>
          </div>

          <div class="flex justify-end mt-4">
            <button class="px-3 py-1.5 text-xs text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors" @click="saveSchedule">
              {{ saveStatus === 'saving' ? '…' : saveStatus === 'saved' ? '✓ Saved' : '💾 Save' }}
            </button>
          </div>
        </UCard>
      </section>

      <!-- Notifications -->
      <section :id="'section-notifications'">
        <UCard :ui="{ base: 'bg-gray-900 border border-white/10', header: { base: 'border-b border-white/10 py-3' }, body: { padding: 'p-5' } }">
          <template #header>
            <div class="flex items-center gap-2 text-sm font-medium text-gray-200">
              <UIcon name="i-heroicons-bell" class="w-4 h-4 text-purple-400" />
              Notifications
            </div>
          </template>
          <div class="space-y-4">
            <div
              v-for="[key, label] in [
                ['browserPush', 'Browser push notifications'],
                ['emailDigest', 'Email digest (daily)'],
                ['emailThreshold', 'Email on threshold_breached'],
                ['sound', 'Sound on completion'],
              ]"
              :key="key"
              class="flex items-center justify-between"
            >
              <span class="text-sm text-gray-300">{{ label }}</span>
              <button
                class="relative w-11 h-6 rounded-full border transition-colors"
                :class="notifications[key as keyof typeof notifications]
                  ? 'bg-indigo-500/40 border-indigo-500/70'
                  : 'bg-gray-700 border-gray-600'"
                @click="notifications[key as keyof typeof notifications] = !notifications[key as keyof typeof notifications]"
              >
                <span
                  class="absolute top-0.5 w-5 h-5 rounded-full transition-all"
                  :class="notifications[key as keyof typeof notifications] ? 'bg-indigo-400 right-0.5' : 'bg-gray-400 left-0.5'"
                />
              </button>
            </div>
          </div>
        </UCard>
      </section>

      <!-- Danger Zone -->
      <section :id="'section-danger'">
        <div class="rounded-xl border border-red-500/30 bg-red-500/5 p-5 space-y-4">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 text-red-400" />
            <h3 class="text-sm font-semibold text-red-400">Danger Zone</h3>
          </div>
          <div class="space-y-3">
            <div
              v-for="action in [
                { label: 'Reset all settings to default', btn: 'Reset' },
                { label: 'Clear inspection history', btn: 'Clear (124 records)' },
                { label: 'Disconnect Git provider', btn: 'Disconnect' },
              ]"
              :key="action.label"
              class="flex items-center justify-between py-2 border-b border-red-500/10 last:border-0"
            >
              <span class="text-sm text-gray-300">{{ action.label }}</span>
              <button class="px-3 py-1.5 text-xs text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors">
                {{ action.btn }}
              </button>
            </div>
          </div>
        </div>
      </section>

    </main>
  </div>
</template>
