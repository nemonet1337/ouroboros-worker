<template>
  <UAlert
    icon="i-heroicons-cloud"
    color="orange"
    variant="subtle"
    title="Cloudflare Workers AI"
    description="Ouroboros connects exclusively to LLMs on Cloudflare Workers AI. The only AI credential is the WORKERS_AI_API_TOKEN Worker secret (set via `wrangler secret put WORKERS_AI_API_TOKEN`) — external AI gateway tokens (Anthropic, OpenAI, Gemini, OpenRouter) are not accepted."
  />
</template>
