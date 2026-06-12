<script setup lang="ts">
import type { AiModel } from '~/composables/useConfig'

const config = useConfig()

const modelSearch = ref('')

const filteredModels = computed(() => {
  const models = config.availableModels.value
  if (!modelSearch.value.trim()) return models
  const q = modelSearch.value.toLowerCase()
  return models.filter(m => m.label.toLowerCase().includes(q) || m.value.toLowerCase().includes(q))
})

const isDropdownOpen = ref(false)

function selectModel(model: AiModel) {
  config.selectedModel.value = model
  modelSearch.value = ''
  isDropdownOpen.value = false
}

function clearModel() {
  config.selectedModel.value = null
  modelSearch.value = ''
}
</script>

<template>
  <div class="space-y-4">
    <UFormGroup label="AI Service" name="aiService">
      <USelect
        v-model="config.selectedAiService.value"
        :options="config.availableServices.value"
        option-attribute="label"
        value-attribute="value"
        :placeholder="config.isCloudflare.value ? 'Cloudflare Workers AI' : 'Select service (enter a token first)'"
        :disabled="config.isCloudflare.value || config.availableServices.value.length === 0"
      />
      <template v-if="config.isCloudflare.value" #help>
        <span class="text-orange-400 text-xs">Cloudflare deploy — Workers AI binding only</span>
      </template>
      <template v-else-if="config.availableServices.value.length === 0" #help>
        <span class="text-amber-400 text-xs">Enter at least one API token above to unlock</span>
      </template>
    </UFormGroup>

    <UFormGroup label="AI Model" name="aiModel">
      <div class="relative">
        <UInput
          v-model="modelSearch"
          :placeholder="config.selectedModel.value ? config.selectedModel.value.label : 'Search models...'"
          icon="i-heroicons-magnifying-glass"
          :disabled="!config.selectedAiService.value"
          :ui="{ icon: { trailing: { pointer: '' } } }"
          @focus="isDropdownOpen = true"
          @blur="setTimeout(() => { isDropdownOpen = false }, 150)"
        >
          <template v-if="config.selectedModel.value" #trailing>
            <UButton
              icon="i-heroicons-x-mark"
              color="gray"
              variant="link"
              :padded="false"
              @click="clearModel"
            />
          </template>
        </UInput>

        <Transition
          enter-active-class="transition duration-100 ease-out"
          enter-from-class="transform scale-95 opacity-0"
          enter-to-class="transform scale-100 opacity-100"
          leave-active-class="transition duration-75 ease-in"
          leave-from-class="transform scale-100 opacity-100"
          leave-to-class="transform scale-95 opacity-0"
        >
          <div
            v-if="isDropdownOpen && config.selectedAiService.value"
            class="absolute z-50 w-full mt-1 bg-gray-800 border border-white/10 rounded-lg shadow-xl max-h-52 overflow-y-auto"
          >
            <div v-if="filteredModels.length === 0" class="px-3 py-3 text-sm text-gray-500 text-center">
              No models found
            </div>
            <button
              v-for="model in filteredModels"
              :key="model.value"
              class="w-full text-left px-3 py-2 text-sm hover:bg-white/5 transition-colors flex items-center justify-between group"
              :class="config.selectedModel.value?.value === model.value ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-300'"
              @mousedown.prevent="selectModel(model)"
            >
              <span class="flex items-center gap-2">
                {{ model.label }}
                <span v-if="model.task" class="text-[10px] uppercase tracking-wide text-gray-500">{{ model.task }}</span>
              </span>
              <UIcon
                v-if="config.selectedModel.value?.value === model.value"
                name="i-heroicons-check"
                class="w-4 h-4 text-indigo-400"
              />
            </button>
          </div>
        </Transition>
      </div>

      <template v-if="config.selectedModel.value" #help>
        <span class="text-indigo-400 text-xs font-mono">{{ config.selectedModel.value.value }}</span>
      </template>
    </UFormGroup>
  </div>
</template>
