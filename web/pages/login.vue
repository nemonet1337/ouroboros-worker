<script setup lang="ts">
definePageMeta({ layout: false })
useHead({ title: 'Sign in — Ouroboros' })

const { login } = useAuth()
const email = ref('')
const password = ref('')
const showPassword = ref(false)
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await login(email.value, password.value)
    await navigateTo('/')
  } catch (e: any) {
    error.value = e?.data?.error?.message ?? e?.data?.error ?? 'ログインに失敗しました'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-950 p-4">
    <!-- Background decoration -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none">
      <div class="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-indigo-500/5 blur-3xl" />
      <div class="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-purple-500/5 blur-3xl" />
    </div>

    <div class="relative w-full max-w-sm">
      <!-- Logo / Branding -->
      <div class="flex flex-col items-center mb-8">
        <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-4">
          <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-white" />
        </div>
        <h1 class="text-xl font-bold text-white tracking-tight">Ouroboros</h1>
        <p class="text-xs text-gray-500 mt-0.5">Self-Healing System</p>
      </div>

      <!-- Card -->
      <div class="rounded-2xl border border-white/10 bg-gray-900/80 backdrop-blur-sm shadow-2xl shadow-black/50 p-6">
        <h2 class="text-sm font-semibold text-gray-200 mb-5">管理者としてサインイン</h2>

        <form class="space-y-4" @submit.prevent="submit">
          <!-- Email -->
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-gray-400">メールアドレス</label>
            <div class="relative">
              <UIcon name="i-heroicons-envelope" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              <input
                v-model="email"
                type="email"
                required
                autocomplete="email"
                placeholder="admin@example.com"
                class="w-full pl-9 pr-4 py-2.5 rounded-xl bg-gray-800/60 border border-white/8 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-indigo-500/60 focus:bg-gray-800 transition-colors"
              />
            </div>
          </div>

          <!-- Password -->
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-gray-400">パスワード</label>
            <div class="relative">
              <UIcon name="i-heroicons-lock-closed" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                required
                autocomplete="current-password"
                placeholder="••••••••"
                class="w-full pl-9 pr-10 py-2.5 rounded-xl bg-gray-800/60 border border-white/8 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-indigo-500/60 focus:bg-gray-800 transition-colors"
              />
              <button
                type="button"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                :title="showPassword ? 'パスワードを隠す' : 'パスワードを表示'"
                @click="showPassword = !showPassword"
              >
                <UIcon :name="showPassword ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'" class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- Error -->
          <div
            v-if="error"
            class="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400"
          >
            <UIcon name="i-heroicons-exclamation-circle" class="w-4 h-4 flex-shrink-0" />
            {{ error }}
          </div>

          <!-- Submit -->
          <button
            type="submit"
            :disabled="loading"
            class="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold text-white transition-colors shadow-lg shadow-indigo-500/20"
          >
            <span v-if="loading" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <UIcon v-else name="i-heroicons-arrow-right-on-rectangle" class="w-4 h-4" />
            {{ loading ? 'サインイン中…' : 'サインイン' }}
          </button>
        </form>
      </div>

      <p class="text-center text-[11px] text-gray-600 mt-5">
        管理者アカウントは環境変数 <code class="font-mono text-gray-500">ADMIN_EMAIL</code> / <code class="font-mono text-gray-500">ADMIN_PASSWORD</code> で設定します
      </p>
    </div>
  </div>
</template>
