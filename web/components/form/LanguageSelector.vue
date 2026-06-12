<script setup lang="ts">
const config = useConfig()

function toggleLanguage(lang: string) {
  const idx = config.selectedLanguages.value.indexOf(lang)
  if (idx === -1) {
    config.selectedLanguages.value.push(lang)
  } else {
    config.selectedLanguages.value.splice(idx, 1)
  }
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <span class="text-sm font-medium text-gray-300">Languages</span>
      <UButton
        size="xs"
        variant="outline"
        icon="i-heroicons-magnifying-glass"
        :loading="config.isAutoDetecting.value"
        @click="config.autoDetectLanguages()"
      >
        Auto-detect
      </UButton>
    </div>

    <div class="grid grid-cols-2 gap-2">
      <label
        v-for="lang in LANGUAGES"
        :key="lang"
        class="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer border transition-colors"
        :class="
          config.selectedLanguages.value.includes(lang)
            ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
            : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20'
        "
        @click="toggleLanguage(lang)"
      >
        <span
          class="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors"
          :class="
            config.selectedLanguages.value.includes(lang)
              ? 'border-indigo-500 bg-indigo-500'
              : 'border-white/20'
          "
        >
          <UIcon
            v-if="config.selectedLanguages.value.includes(lang)"
            name="i-heroicons-check"
            class="w-3 h-3 text-white"
          />
        </span>
        <span class="text-xs font-medium">{{ lang }}</span>
      </label>
    </div>

    <p class="text-xs text-gray-500">
      {{ config.selectedLanguages.value.length }} language{{ config.selectedLanguages.value.length !== 1 ? 's' : '' }} selected
    </p>
  </div>
</template>
