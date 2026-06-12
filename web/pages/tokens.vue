<script setup lang="ts">
definePageMeta({ layout: 'default' })
useHead({ title: 'API Tokens — Ouroboros' })

const { api } = useAuth()

interface TokenRow {
  id: string
  name: string
  prefix: string
  scopes: string
  created_at: number
  last_used_at: number | null
  revoked_at: number | null
}

const tokens = ref<TokenRow[]>([])
const newName = ref('')
const newScopes = ref<string[]>(['read'])
const allScopes = ['read', 'inspect', 'heal', 'admin']
const createdSecret = ref('')
const loading = ref(false)

async function load() {
  const res = await api<{ tokens: TokenRow[] }>('/tokens')
  tokens.value = res.tokens
}

async function create() {
  loading.value = true
  createdSecret.value = ''
  try {
    const res = await api<{ secret: string }>('/tokens', {
      method: 'POST',
      body: { name: newName.value || 'token', scopes: newScopes.value },
    })
    createdSecret.value = res.secret
    newName.value = ''
    await load()
  } finally {
    loading.value = false
  }
}

async function revoke(id: string) {
  await api(`/tokens/${id}`, { method: 'DELETE' })
  await load()
}

function fmt(ts: number | null) {
  return ts ? new Date(ts).toLocaleString() : '—'
}

onMounted(load)
</script>

<template>
  <div class="p-6 space-y-6 max-w-3xl">
    <div>
      <h1 class="text-xl font-semibold">API Tokens</h1>
      <p class="text-sm text-gray-400">Scoped, per-user tokens for programmatic access. Send as <code>Authorization: Bearer ouro_…</code></p>
    </div>

    <UCard>
      <template #header><h2 class="font-medium">Create token</h2></template>
      <div class="flex flex-wrap items-end gap-3">
        <UFormGroup label="Name" class="flex-1 min-w-48">
          <UInput v-model="newName" placeholder="ci-pipeline" />
        </UFormGroup>
        <UFormGroup label="Scopes">
          <USelectMenu v-model="newScopes" :options="allScopes" multiple />
        </UFormGroup>
        <UButton :loading="loading" @click="create">Generate</UButton>
      </div>
      <UAlert
        v-if="createdSecret"
        class="mt-4"
        color="green"
        variant="soft"
        title="Copy your token now — it won't be shown again"
        :description="createdSecret"
      />
    </UCard>

    <UCard>
      <template #header><h2 class="font-medium">Your tokens</h2></template>
      <div v-if="!tokens.length" class="text-sm text-gray-400">No tokens yet.</div>
      <table v-else class="w-full text-sm">
        <thead class="text-left text-gray-400">
          <tr><th class="py-2">Name</th><th>Prefix</th><th>Scopes</th><th>Last used</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="t in tokens" :key="t.id" class="border-t border-gray-800">
            <td class="py-2">{{ t.name }}</td>
            <td><code>{{ t.prefix }}</code></td>
            <td>{{ t.scopes }}</td>
            <td>{{ fmt(t.last_used_at) }}</td>
            <td class="text-right">
              <UBadge v-if="t.revoked_at" color="red" variant="soft">revoked</UBadge>
              <UButton v-else color="red" variant="ghost" size="xs" @click="revoke(t.id)">Revoke</UButton>
            </td>
          </tr>
        </tbody>
      </table>
    </UCard>
  </div>
</template>
