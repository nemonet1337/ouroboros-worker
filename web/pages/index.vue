<script setup lang="ts">
definePageMeta({ layout: 'default' })
const config = useConfig()

onMounted(() => { config.loadConfig() })

const formSections = [
  { id: 'git',  title: 'Git',       icon: 'i-heroicons-code-bracket-square' },
  { id: 'lang', title: 'Languages', icon: 'i-heroicons-language' },
]

const activeSection = ref('git')
const mobileConfigOpen = ref(false)

// PR Drawer
const selectedPr = ref<any>(null)

function onPrSelect(pr: any) {
  selectedPr.value = pr
}
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden">

    <!-- Mobile Configuration drawer overlay -->
    <Teleport to="body">
      <div v-if="mobileConfigOpen" class="lg:hidden fixed inset-0 z-50 flex">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="mobileConfigOpen = false" />
        <div class="relative w-80 max-w-[90vw] bg-gray-950 border-r border-white/10 flex flex-col gap-3 p-4 overflow-y-auto">
          <div class="flex items-center justify-between mb-1">
            <h2 class="text-sm font-semibold text-gray-300">Configuration</h2>
            <button
              class="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/8 transition-colors"
              @click="mobileConfigOpen = false"
            >
              <UIcon name="i-heroicons-x-mark" class="w-4 h-4" />
            </button>
          </div>

          <!-- Section nav pills -->
          <div class="flex gap-1 flex-wrap">
            <button
              v-for="sec in formSections"
              :key="sec.id"
              class="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors border"
              :class="activeSection === sec.id
                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                : 'text-gray-400 hover:text-gray-200 border-transparent hover:border-white/10'"
              @click="activeSection = sec.id"
            >
              <UIcon :name="sec.icon" class="w-3 h-3" />
              {{ sec.title }}
            </button>
          </div>

          <UCard
            v-show="activeSection === 'git'"
            class="flex-shrink-0"
            :ui="{ base: 'bg-gray-900 border border-white/10', header: { base: 'border-b border-white/10 py-3' }, body: { padding: 'p-4' } }"
          >
            <template #header>
              <div class="flex items-center gap-2 text-sm font-medium text-gray-200">
                <UIcon name="i-heroicons-code-bracket-square" class="w-4 h-4 text-indigo-400" />
                Git Configuration
              </div>
            </template>
            <FormGitConfig />
          </UCard>

          <UCard
            v-show="activeSection === 'lang'"
            class="flex-shrink-0"
            :ui="{ base: 'bg-gray-900 border border-white/10', header: { base: 'border-b border-white/10 py-3' }, body: { padding: 'p-4' } }"
          >
            <template #header>
              <div class="flex items-center gap-2 text-sm font-medium text-gray-200">
                <UIcon name="i-heroicons-language" class="w-4 h-4 text-indigo-400" />
                Target Languages
              </div>
            </template>
            <FormLanguageSelector />
          </UCard>

          <div class="rounded-xl border border-white/10 bg-gray-900 p-4 space-y-2">
            <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Setup Status</p>
            <div class="space-y-2.5">
              <div class="flex items-center justify-between text-xs">
                <span class="text-gray-400">Repository</span>
                <span :class="config.gitRepository.value ? 'text-emerald-400 font-mono' : 'text-gray-600'">
                  {{ config.gitRepository.value || 'Not set' }}
                </span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-gray-400">Git Token</span>
                <span :class="config.gitTokenSet.value ? 'text-emerald-400' : 'text-gray-600'">
                  {{ config.gitTokenSet.value ? '●●●●●●' : 'Not set' }}
                </span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-gray-400">Languages</span>
                <span class="text-gray-300">{{ config.selectedLanguages.value.length }} selected</span>
              </div>
            </div>
            <div class="pt-3 border-t border-white/10 space-y-1.5">
              <div class="flex items-center justify-between text-xs">
                <span class="text-gray-400">Scan Schedule</span>
                <span class="flex items-center gap-1.5 text-indigo-400">
                  <UIcon name="i-heroicons-clock" class="w-3 h-3" />
                  Daily 03:00
                </span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-gray-400">Alert Threshold</span>
                <span class="text-amber-400">≤ 70</span>
              </div>
            </div>
            <NuxtLink to="/settings" class="flex items-center justify-center gap-1.5 w-full mt-2 py-1.5 rounded-lg border border-white/10 text-xs text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors" @click="mobileConfigOpen = false">
              <UIcon name="i-heroicons-cog-6-tooth" class="w-3 h-3" />
              Edit in Settings
            </NuxtLink>
          </div>
        </div>
      </div>
    </Teleport>

    <div class="flex-1 flex overflow-hidden max-w-screen-2xl mx-auto w-full px-4 py-4 gap-4">

      <!-- LEFT: Configuration panel (desktop only) -->
      <aside class="hidden lg:flex w-72 xl:w-80 flex-shrink-0 flex-col gap-3 overflow-y-auto pb-4">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-gray-300">Configuration</h2>
        </div>

        <!-- Section nav pills -->
        <div class="flex gap-1 flex-wrap">
          <button
            v-for="sec in formSections"
            :key="sec.id"
            class="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors border"
            :class="activeSection === sec.id
              ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
              : 'text-gray-400 hover:text-gray-200 border-transparent hover:border-white/10'"
            @click="activeSection = sec.id"
          >
            <UIcon :name="sec.icon" class="w-3 h-3" />
            {{ sec.title }}
          </button>
        </div>

        <!-- Git Configuration -->
        <UCard
          v-show="activeSection === 'git'"
          class="flex-shrink-0"
          :ui="{ base: 'bg-gray-900 border border-white/10', header: { base: 'border-b border-white/10 py-3' }, body: { padding: 'p-4' } }"
        >
          <template #header>
            <div class="flex items-center gap-2 text-sm font-medium text-gray-200">
              <UIcon name="i-heroicons-code-bracket-square" class="w-4 h-4 text-indigo-400" />
              Git Configuration
            </div>
          </template>
          <FormGitConfig />
        </UCard>

        <!-- Languages -->
        <UCard
          v-show="activeSection === 'lang'"
          class="flex-shrink-0"
          :ui="{ base: 'bg-gray-900 border border-white/10', header: { base: 'border-b border-white/10 py-3' }, body: { padding: 'p-4' } }"
        >
          <template #header>
            <div class="flex items-center gap-2 text-sm font-medium text-gray-200">
              <UIcon name="i-heroicons-language" class="w-4 h-4 text-indigo-400" />
              Target Languages
            </div>
          </template>
          <FormLanguageSelector />
        </UCard>

        <!-- Setup Status -->
        <div class="rounded-xl border border-white/10 bg-gray-900 p-4 space-y-2">
          <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Setup Status</p>
          <div class="space-y-2.5">
            <div class="flex items-center justify-between text-xs">
              <span class="text-gray-400">Repository</span>
              <span :class="config.gitRepository.value ? 'text-emerald-400 font-mono' : 'text-gray-600'">
                {{ config.gitRepository.value || 'Not set' }}
              </span>
            </div>
            <div class="flex items-center justify-between text-xs">
              <span class="text-gray-400">Git Token</span>
              <span :class="config.gitTokenSet.value ? 'text-emerald-400' : 'text-gray-600'">
                {{ config.gitTokenSet.value ? '●●●●●●' : 'Not set' }}
              </span>
            </div>
            <div class="flex items-center justify-between text-xs">
              <span class="text-gray-400">Languages</span>
              <span class="text-gray-300">{{ config.selectedLanguages.value.length }} selected</span>
            </div>
          </div>
          <!-- Scan schedule -->
          <div class="pt-3 border-t border-white/10 space-y-1.5">
            <div class="flex items-center justify-between text-xs">
              <span class="text-gray-400">Scan Schedule</span>
              <span class="flex items-center gap-1.5 text-indigo-400">
                <UIcon name="i-heroicons-clock" class="w-3 h-3" />
                Daily 03:00
              </span>
            </div>
            <div class="flex items-center justify-between text-xs">
              <span class="text-gray-400">Alert Threshold</span>
              <span class="text-amber-400">≤ 70</span>
            </div>
          </div>
          <NuxtLink to="/settings" class="flex items-center justify-center gap-1.5 w-full mt-2 py-1.5 rounded-lg border border-white/10 text-xs text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors">
            <UIcon name="i-heroicons-cog-6-tooth" class="w-3 h-3" />
            Edit in Settings
          </NuxtLink>
        </div>
      </aside>

      <!-- RIGHT: Dashboard -->
      <main class="flex-1 overflow-y-auto pb-4 space-y-4 min-w-0">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <!-- Mobile: Configuration button -->
            <button
              class="lg:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/5 text-xs text-gray-400 hover:text-gray-200 hover:bg-white/8 transition-colors flex-shrink-0"
              @click="mobileConfigOpen = true"
            >
              <UIcon name="i-heroicons-cog-6-tooth" class="w-3.5 h-3.5" />
              Config
            </button>
            <h2 class="text-sm font-semibold text-gray-300 truncate">Dashboard</h2>
          </div>
          <NuxtLink
            to="/inspection"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs text-white transition-colors flex-shrink-0"
          >
            <UIcon name="i-heroicons-magnifying-glass" class="w-3.5 h-3.5" />
            <span class="hidden sm:inline">インスペクション実行</span>
            <span class="sm:hidden">実行</span>
          </NuxtLink>
        </div>

        <!-- Row 1: Metrics + Code Stats -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <UCard :ui="{ base: 'bg-gray-900 border border-white/10', header: { base: 'border-b border-white/10 py-3' }, body: { padding: 'p-4' } }">
            <template #header>
              <div class="flex items-center gap-2 text-sm font-medium text-gray-200">
                <UIcon name="i-heroicons-chart-bar" class="w-4 h-4 text-blue-400" />
                Service Metrics
              </div>
            </template>
            <DashboardMetricsCards />
          </UCard>

          <UCard :ui="{ base: 'bg-gray-900 border border-white/10', header: { base: 'border-b border-white/10 py-3' }, body: { padding: 'p-4' } }">
            <template #header>
              <div class="flex items-center gap-2 text-sm font-medium text-gray-200">
                <UIcon name="i-heroicons-code-bracket" class="w-4 h-4 text-emerald-400" />
                Code Statistics
              </div>
            </template>
            <DashboardCodeStats />
          </UCard>
        </div>

        <!-- Metrics Timeline -->
        <UCard :ui="{ base: 'bg-gray-900 border border-white/10', header: { base: 'border-b border-white/10 py-3' }, body: { padding: 'p-4' } }">
          <template #header>
            <div class="flex items-center gap-2 text-sm font-medium text-gray-200">
              <UIcon name="i-heroicons-chart-bar-square" class="w-4 h-4 text-indigo-400" />
              Metrics Timeline
            </div>
          </template>
          <DashboardMetricsTimeline />
        </UCard>

        <!-- Row 2: Pie Chart + Dependency Changes -->
        <div class="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <UCard class="lg:col-span-2" :ui="{ base: 'bg-gray-900 border border-white/10', header: { base: 'border-b border-white/10 py-3' }, body: { padding: 'p-4' } }">
            <template #header>
              <div class="flex items-center gap-2 text-sm font-medium text-gray-200">
                <UIcon name="i-heroicons-chart-pie" class="w-4 h-4 text-red-400" />
                Fix Cause Analysis
              </div>
            </template>
            <DashboardCausePieChart />
          </UCard>

          <UCard class="lg:col-span-3" :ui="{ base: 'bg-gray-900 border border-white/10', header: { base: 'border-b border-white/10 py-3' }, body: { padding: 'p-4' } }">
            <template #header>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2 text-sm font-medium text-gray-200">
                  <UIcon name="i-heroicons-arrow-up-circle" class="w-4 h-4 text-amber-400" />
                  Dependency Updates
                </div>
                <div class="flex items-center gap-1.5">
                  <button class="px-2 py-0.5 rounded text-xs border border-red-500/30 bg-red-500/10 text-red-400">Critical</button>
                  <button class="px-2 py-0.5 rounded text-xs border border-white/10 text-gray-400 hover:text-gray-200 transition-colors">All</button>
                </div>
              </div>
            </template>
            <DashboardDependencyChanges />
          </UCard>
        </div>

        <!-- Row 3: PR History -->
        <UCard :ui="{ base: 'bg-gray-900 border border-white/10', header: { base: 'border-b border-white/10 py-3' }, body: { padding: 'p-4' } }">
          <template #header>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 text-sm font-medium text-gray-200">
                <UIcon name="i-heroicons-queue-list" class="w-4 h-4 text-purple-400" />
                Pull Request History
              </div>
              <div class="flex items-center gap-2">
                <UBadge :label="`${7} PRs`" color="purple" variant="subtle" size="xs" />
                <button class="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 transition-colors">
                  <UIcon name="i-heroicons-arrow-down-tray" class="w-3.5 h-3.5" />
                  Export
                </button>
              </div>
            </div>
          </template>
          <DashboardPrHistory @select="onPrSelect" />
          <p class="text-[10px] text-gray-600 mt-2">← 行をクリックで詳細ドロワーを表示</p>
        </UCard>
      </main>
    </div>

    <!-- PR Detail Drawer -->
    <DashboardPrDetailDrawer :pr="selectedPr" @close="selectedPr = null" />
  </div>
</template>
