<script setup lang="ts">
const config = useConfig()

interface TokenField {
  key: 'anthropicToken' | 'openaiToken' | 'geminiToken' | 'openrouterToken'
  label: string
  placeholder: string
  icon: string
}

const tokenFields: TokenField[] = [
  { key: 'anthropicToken', label: 'Anthropic API Token', placeholder: 'sk-ant-api03-...', icon: 'i-heroicons-sparkles' },
  { key: 'openaiToken', label: 'OpenAI API Token', placeholder: 'sk-proj-...', icon: 'i-heroicons-cpu-chip' },
  { key: 'geminiToken', label: 'Gemini API Token', placeholder: 'AIzaSy...', icon: 'i-heroicons-bolt' },
  { key: 'openrouterToken', label: 'OpenRouter API Token', placeholder: 'sk-or-v1-...', icon: 'i-heroicons-arrows-right-left' },
]

const visibility = reactive<Record<string, boolean>>({})
</script>

<template>
  <UAlert
    v-if="config.isCloudflare.value"
    icon="i-heroicons-cloud"
    color="orange"
    variant="subtle"
    title="Cloudflare Workers AI"
    description="This deployment runs on Cloudflare and uses the Workers AI binding exclusively. External AI gateway tokens (Anthropic, OpenAI, Gemini, OpenRouter) are not accepted."
  />
  <div v-else class="space-y-3">
    <div v-for="field in tokenFields" :key="field.key">
      <UFormGroup :label="field.label" :name="field.key">
        <UInput
          v-model="(config as any)[field.key].value"
          :type="visibility[field.key] ? 'text' : 'password'"
          :placeholder="field.placeholder"
          :icon="field.icon"
          :ui="{ icon: { trailing: { pointer: '' } } }"
        >
          <template #trailing>
            <div class="flex items-center gap-1">
              <UIcon
                v-if="(config as any)[field.key].value"
                name="i-heroicons-check-circle"
                class="w-4 h-4 text-emerald-400"
              />
              <UButton
                :icon="visibility[field.key] ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'"
                color="gray"
                variant="link"
                :padded="false"
                @click="visibility[field.key] = !visibility[field.key]"
              />
            </div>
          </template>
        </UInput>
      </UFormGroup>
    </div>
  </div>
</template>
