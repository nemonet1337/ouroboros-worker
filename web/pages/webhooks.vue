<script setup lang="ts">
definePageMeta({ layout: 'default' })

const showForm = ref(false)
const editingEndpoint = ref<any>(null)

const { api } = useApi()
const { data: endpoints, refresh } = await useAsyncData('webhooks', async () => {
  const res = await api<{ webhooks: any[] }>('/webhooks').catch(() => ({ webhooks: [] }))
  return res.webhooks ?? []
})

async function onSaved() {
  showForm.value = false
  editingEndpoint.value = null
  await refresh()
}

function onEdit(ep: any) {
  editingEndpoint.value = ep
  showForm.value = true
}

function onCancel() {
  showForm.value = false
  editingEndpoint.value = null
}
</script>

<template>
  <div class="flex-1 max-w-screen-lg mx-auto w-full px-4 py-6 space-y-6 overflow-y-auto">

    <!-- Page header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-bold text-gray-100">Webhook設定</h2>
        <p class="text-xs text-gray-500 mt-0.5">インスペクション結果をSlack・Discord・GitHubなどへ自動通知します</p>
      </div>
      <UButton
        color="indigo" size="sm"
        :icon="showForm ? 'i-heroicons-x-mark' : 'i-heroicons-plus'"
        @click="showForm = !showForm"
      >
        {{ showForm ? 'キャンセル' : 'エンドポイントを追加' }}
      </UButton>
    </div>

    <!-- Add form -->
    <UCard
      v-if="showForm"
      :ui="{ base: 'bg-gray-900 border border-indigo-500/30', header: { base: 'border-b border-white/10 py-3' }, body: { padding: 'p-4' } }"
    >
      <template #header>
        <div class="flex items-center gap-2 text-sm font-medium text-gray-200">
          <UIcon :name="editingEndpoint ? 'i-heroicons-pencil-square' : 'i-heroicons-plus-circle'" class="w-4 h-4 text-indigo-400" />
          {{ editingEndpoint ? 'エンドポイントの編集' : '新しいエンドポイント' }}
        </div>
      </template>
      <WebhookWebhookEndpointForm :editing-endpoint="editingEndpoint" @saved="onSaved" @cancel="onCancel" />
    </UCard>

    <!-- Adapter guide -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div v-for="adapter in [
        { icon: 'i-mdi-slack',        name: 'Slack',        desc: 'Block Kit形式', color: 'text-pink-400' },
        { icon: 'i-mdi-discord',      name: 'Discord',      desc: 'Embed形式',     color: 'text-indigo-400' },
        { icon: 'i-mdi-github',       name: 'GitHub',       desc: 'PRコメント形式', color: 'text-gray-300' },
        { icon: 'i-heroicons-globe-alt', name: 'Generic', desc: 'JSON Payload',  color: 'text-blue-400' },
      ]" :key="adapter.name"
        class="rounded-lg border border-white/10 bg-gray-900/60 p-3 flex items-center gap-2"
      >
        <UIcon :name="adapter.icon" class="w-5 h-5 flex-shrink-0" :class="adapter.color" />
        <div>
          <p class="text-xs font-medium text-gray-200">{{ adapter.name }}</p>
          <p class="text-[10px] text-gray-500">{{ adapter.desc }}</p>
        </div>
      </div>
    </div>

    <!-- Endpoint list -->
    <UCard :ui="{ base: 'bg-gray-900 border border-white/10', header: { base: 'border-b border-white/10 py-3' }, body: { padding: 'p-4' } }">
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 text-sm font-medium text-gray-200">
            <UIcon name="i-heroicons-bell" class="w-4 h-4 text-indigo-400" />
            設定済みエンドポイント
          </div>
          <UBadge :label="`${(endpoints as any[])?.length ?? 0}件`" color="gray" variant="outline" size="xs" />
        </div>
      </template>
      <WebhookWebhookEndpointList :endpoints="(endpoints as any[]) ?? []" @refresh="refresh" @edit="onEdit" />
    </UCard>

    <!-- Event documentation -->
    <UCard :ui="{ base: 'bg-gray-900 border border-white/10', header: { base: 'border-b border-white/10 py-3' }, body: { padding: 'p-4' } }">
      <template #header>
        <div class="flex items-center gap-2 text-sm font-medium text-gray-200">
          <UIcon name="i-heroicons-document-text" class="w-4 h-4 text-gray-400" />
          イベントリファレンス
        </div>
      </template>
      <div class="space-y-3">
        <div v-for="ev in [
          { name: 'inspection.completed', color: 'emerald', desc: 'インスペクションが正常に完了した際に発火します。スコアや指摘件数を含む完全なサマリーが送信されます。' },
          { name: 'inspection.threshold_breached', color: 'amber', desc: 'スコアが設定した閾値を下回った際に発火します。どの次元が閾値を超えたかの詳細情報が含まれます。' },
          { name: 'inspection.failed', color: 'red', desc: 'インスペクション実行中にエラーが発生した際に発火します。エラーメッセージが含まれます。' },
        ]" :key="ev.name">
          <div class="flex items-start gap-3">
            <UBadge :color="(ev.color as any)" variant="subtle" size="xs" class="mt-0.5 flex-shrink-0">{{ ev.name }}</UBadge>
            <p class="text-xs text-gray-400">{{ ev.desc }}</p>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
