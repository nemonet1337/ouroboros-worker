export default defineNuxtConfig({
  // Build a static SPA (`nuxt generate`); the API is served by the Node server
  // or the Cloudflare Worker, which also host these assets.
  ssr: false,
  devtools: { enabled: false },
  modules: ['@nuxt/ui'],
  ui: {
    icons: ['heroicons', 'mdi'],
  },
  colorMode: {
    preference: 'dark',
    fallback: 'dark',
  },
  app: {
    head: {
      title: 'Ouroboros — Self-Healing CI/CD',
      meta: [{ name: 'description', content: 'Ouroboros AI-driven self-healing & inspection system' }],
    },
  },
  runtimeConfig: {
    public: {
      // Versioned API base; the static SPA calls the host app's /api/v1.
      apiBase: '/api/v1',
    },
  },
  compatibilityDate: '2024-11-01',
})
