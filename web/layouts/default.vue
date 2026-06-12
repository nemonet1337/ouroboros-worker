<script setup lang="ts">
const route = useRoute()
const colorMode = useColorMode()

const { user, logout } = useAuth()

const nav = computed(() => {
  const base = [
    { to: '/',           label: 'Self-Healing',  icon: 'i-heroicons-arrow-path' },
    { to: '/healing',    label: 'Runs',          icon: 'i-heroicons-queue-list' },
    { to: '/inspection', label: 'Inspection',    icon: 'i-heroicons-magnifying-glass' },
    { to: '/webhooks',   label: 'Webhooks',      icon: 'i-heroicons-bell' },
    { to: '/tokens',     label: 'API Tokens',    icon: 'i-heroicons-key' },
    { to: '/settings',   label: 'Settings',      icon: 'i-heroicons-cog-6-tooth' },
  ]
  if (user.value?.role === 'admin') {
    base.push({ to: '/admin', label: 'Admin', icon: 'i-heroicons-shield-check' })
  }
  return base
})

const searchOpen = ref(false)
const userMenuOpen = ref(false)
const searchQuery = ref('')

const configUser = computed(() => ({
  name: user.value?.email?.split('@')[0] ?? 'User',
  email: user.value?.email ?? '',
}))

function toggleTheme() {
  colorMode.preference = colorMode.preference === 'dark' ? 'light' : 'dark'
}

onMounted(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      searchOpen.value = true
    }
    if (e.key === 'Escape') searchOpen.value = false
  }
  document.addEventListener('keydown', handler)
  onUnmounted(() => document.removeEventListener('keydown', handler))
})
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-white flex flex-col">
    <!-- Header -->
    <header class="flex-shrink-0 border-b border-white/10 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-40">
      <div class="max-w-screen-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <!-- Left: Logo + Nav -->
        <div class="flex items-center gap-3 min-w-0">
          <!-- Logo -->
          <div class="flex items-center gap-2.5 flex-shrink-0">
            <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 text-white" />
            </div>
            <div class="hidden sm:block">
              <h1 class="text-sm font-bold tracking-tight leading-tight">Ouroboros</h1>
              <p class="text-[10px] text-gray-500 leading-none">Self-Healing System</p>
            </div>
          </div>

          <div class="hidden sm:block w-px h-6 bg-white/10 flex-shrink-0" />

          <!-- Navigation -->
          <nav class="flex items-center gap-0.5">
            <NuxtLink
              v-for="item in nav"
              :key="item.to"
              :to="item.to"
              class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all border-b-2"
              :class="route.path === item.to
                ? 'text-indigo-400 border-indigo-500'
                : 'text-gray-400 hover:text-gray-200 border-transparent hover:border-gray-600'"
            >
              <UIcon :name="item.icon" class="w-3.5 h-3.5" />
              <span class="hidden md:inline">{{ item.label }}</span>
            </NuxtLink>
          </nav>
        </div>

        <!-- Right: Search + Status + Controls -->
        <div class="flex items-center gap-2 flex-shrink-0">
          <!-- Search button -->
          <button
            class="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-xs text-gray-400 hover:text-gray-200 hover:bg-white/8 transition-colors"
            @click="searchOpen = true"
          >
            <UIcon name="i-heroicons-magnifying-glass" class="w-3.5 h-3.5" />
            <span>Search…</span>
            <kbd class="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-white/15 bg-white/5 text-[9px] font-mono">⌘K</kbd>
          </button>

          <!-- Online badge -->
          <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span class="text-xs text-emerald-400 font-medium hidden sm:inline">Online</span>
          </div>

          <!-- Version -->
          <span class="hidden lg:block text-[10px] text-gray-600 font-mono">v0.1.0</span>

          <!-- Theme toggle -->
          <button
            class="w-8 h-8 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-gray-200 hover:bg-white/8 transition-colors"
            :title="colorMode.preference === 'dark' ? 'ライトモードへ' : 'ダークモードへ'"
            @click="toggleTheme"
          >
            <UIcon
              :name="colorMode.preference === 'dark' ? 'i-heroicons-sun' : 'i-heroicons-moon'"
              class="w-4 h-4"
            />
          </button>

          <!-- User avatar -->
          <div class="relative">
            <button
              class="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white hover:opacity-90 transition-opacity"
              @click="userMenuOpen = !userMenuOpen"
            >
              {{ configUser.name.charAt(0).toUpperCase() }}
            </button>
            <!-- User dropdown -->
            <div
              v-if="userMenuOpen"
              class="absolute right-0 top-full mt-2 w-52 rounded-xl border border-white/10 bg-gray-900 shadow-xl shadow-black/50 py-1 z-50"
              @mouseleave="userMenuOpen = false"
            >
              <div class="px-4 py-3 border-b border-white/10">
                <p class="text-sm font-medium text-gray-100">{{ configUser.name }}</p>
                <p v-if="configUser.email" class="text-xs text-gray-500">{{ configUser.email }}</p>
              </div>
              <div class="py-1">
                <NuxtLink to="/settings" class="flex items-center gap-2.5 px-4 py-2 text-xs text-gray-300 hover:bg-white/5 transition-colors" @click="userMenuOpen = false">
                  <UIcon name="i-heroicons-cog-6-tooth" class="w-3.5 h-3.5" />
                  Settings
                </NuxtLink>
                <NuxtLink to="/tokens" class="flex items-center gap-2.5 px-4 py-2 text-xs text-gray-300 hover:bg-white/5 transition-colors" @click="userMenuOpen = false">
                  <UIcon name="i-heroicons-key" class="w-3.5 h-3.5" />
                  API Tokens
                </NuxtLink>
                <a href="#" class="flex items-center gap-2.5 px-4 py-2 text-xs text-gray-300 hover:bg-white/5 transition-colors">
                  <UIcon name="i-heroicons-arrow-top-right-on-square" class="w-3.5 h-3.5" />
                  Docs
                </a>
                <div class="border-t border-white/10 my-1" />
                <button type="button" class="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors" @click="userMenuOpen = false; logout()">
                  <UIcon name="i-heroicons-arrow-right-on-rectangle" class="w-3.5 h-3.5" />
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>

    <!-- Page content -->
    <slot />

    <!-- Global Search Modal -->
    <Teleport to="body">
      <div
        v-if="searchOpen"
        class="fixed inset-0 z-[100] flex items-start justify-center pt-24 px-4"
        @click.self="searchOpen = false"
      >
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="searchOpen = false" />
        <div class="relative w-full max-w-xl bg-gray-900 rounded-2xl border border-white/15 shadow-2xl shadow-black/60 overflow-hidden">
          <!-- Search input -->
          <div class="flex items-center gap-3 px-4 py-3.5 border-b border-white/10">
            <UIcon name="i-heroicons-magnifying-glass" class="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input
              v-model="searchQuery"
              autofocus
              placeholder="PRs、指摘事項、依存関係を検索…"
              class="flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-500 outline-none"
            />
            <kbd class="px-1.5 py-0.5 rounded border border-white/15 bg-white/5 text-[10px] font-mono text-gray-500">Esc</kbd>
          </div>
          <!-- Quick results placeholder -->
          <div class="p-3 space-y-1">
            <p class="text-[10px] text-gray-600 px-2 pb-1 uppercase tracking-wider">PR履歴</p>
            <button class="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 text-left transition-colors" @click="searchOpen = false">
              <UIcon name="i-heroicons-code-bracket-square" class="w-4 h-4 text-purple-400 flex-shrink-0" />
              <div class="min-w-0">
                <p class="text-xs text-gray-200">#42 · fix(deps): update lodash 4.17.15 → 4.17.21</p>
                <p class="text-[10px] text-gray-500">merged · 3 days ago</p>
              </div>
            </button>
            <p class="text-[10px] text-gray-600 px-2 pb-1 pt-2 uppercase tracking-wider">指摘事項</p>
            <button class="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 text-left transition-colors" @click="searchOpen = false">
              <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 text-red-400 flex-shrink-0" />
              <div class="min-w-0">
                <p class="text-xs text-gray-200">auth.ts · SQL injection in login()</p>
                <p class="text-[10px] text-gray-500">critical · Security</p>
              </div>
            </button>
          </div>
          <div class="px-4 py-2.5 border-t border-white/10 flex items-center gap-4 text-[10px] text-gray-600">
            <span><kbd class="font-mono">↑↓</kbd> 移動</span>
            <span><kbd class="font-mono">↵</kbd> 開く</span>
            <span><kbd class="font-mono">Esc</kbd> 閉じる</span>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
