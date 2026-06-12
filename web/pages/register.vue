<script setup lang="ts">
definePageMeta({ layout: false })
useHead({ title: 'Register — Ouroboros' })

const { register, api } = useAuth()
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const registrationEnabled = ref(true)
const isFirstUser = ref(false)

const { data } = await useAsyncData('registration', () =>
  api<{ enabled: boolean }>('/auth/registration').catch(() => ({ enabled: true }))
)
registrationEnabled.value = data.value?.enabled ?? true

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await register(email.value, password.value)
    await navigateTo('/')
  } catch (e: any) {
    error.value = e?.data?.error || 'Registration failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-950 p-4">
    <UCard class="w-full max-w-sm">
      <template #header>
        <h1 class="text-lg font-semibold flex items-center gap-2">
          <UIcon name="i-mdi-infinity" /> Ouroboros
        </h1>
        <p class="text-sm text-gray-400">Create an account</p>
      </template>

      <UAlert
        v-if="!registrationEnabled"
        color="amber"
        variant="soft"
        title="Registration is currently disabled"
        description="The first account becomes the admin. If an admin already exists, ask them to enable public registration."
        class="mb-4"
      />

      <form class="space-y-4" @submit.prevent="submit">
        <UFormGroup label="Email">
          <UInput v-model="email" type="email" required autocomplete="email" />
        </UFormGroup>
        <UFormGroup label="Password" help="At least 8 characters">
          <UInput v-model="password" type="password" required autocomplete="new-password" />
        </UFormGroup>
        <UAlert v-if="error" color="red" variant="soft" :title="error" />
        <UButton type="submit" block :loading="loading">Register</UButton>
      </form>

      <template #footer>
        <p class="text-sm text-gray-400">
          Have an account?
          <ULink to="/login" class="text-primary">Sign in</ULink>
        </p>
      </template>
    </UCard>
  </div>
</template>
