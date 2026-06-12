<script setup lang="ts">
const config = useConfig()
const showToken = ref(false)
</script>

<template>
  <div class="space-y-4">
    <UFormGroup label="Git Service" name="gitService">
      <USelect
        v-model="config.gitService.value"
        :options="config.gitServiceOptions"
        option-attribute="label"
        value-attribute="value"
        placeholder="Select a Git service"
      />
    </UFormGroup>

    <UFormGroup label="Repository (owner/repo)" name="gitPackage">
      <UInput
        v-model="config.gitPackage.value"
        placeholder="e.g. acme-corp/my-service"
        icon="i-heroicons-code-bracket"
      />
    </UFormGroup>

    <UFormGroup label="Git Access Token" name="gitToken">
      <UInput
        v-model="config.gitToken.value"
        :type="showToken ? 'text' : 'password'"
        placeholder="ghp_xxxxxxxxxxxx"
        icon="i-heroicons-key"
        :ui="{ icon: { trailing: { pointer: '' } } }"
      >
        <template #trailing>
          <UButton
            :icon="showToken ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'"
            color="gray"
            variant="link"
            :padded="false"
            @click="showToken = !showToken"
          />
        </template>
      </UInput>
    </UFormGroup>
  </div>
</template>
