<script setup lang="ts">
const config = useConfig()
</script>

<template>
  <div class="space-y-4">
    <div class="space-y-1">
      <p class="text-xs font-medium text-gray-400">Repository</p>
      <p class="text-xs font-mono text-gray-200 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
        {{ config.gitRepository.value || 'Not configured' }}
      </p>
    </div>

    <div class="space-y-1">
      <p class="text-xs font-medium text-gray-400">GitHub Token</p>
      <p class="text-xs font-mono px-3 py-2 rounded-lg border" :class="config.gitTokenSet.value ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : 'text-gray-500 bg-white/5 border-white/10'">
        {{ config.gitTokenSet.value ? '●●●●●●●● (set)' : 'Not configured' }}
      </p>
    </div>

    <p class="text-[11px] text-gray-500 leading-relaxed">
      Managed via Cloudflare Secrets.<br>
      Use <code class="font-mono text-gray-400">wrangler secret put GITHUB_TOKEN</code> and
      <code class="font-mono text-gray-400">GITHUB_REPOSITORY</code> to configure.
    </p>
  </div>
</template>
