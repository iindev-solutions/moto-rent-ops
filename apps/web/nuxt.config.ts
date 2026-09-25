export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', '@pinia/nuxt', '@vite-pwa/nuxt'],
  css: ['~/assets/css/main.css'],
  ssr: false,
  typescript: {
    strict: true,
    typeCheck: true,
  },
  build: {
    transpile: ['@book-moto/contracts', '@book-moto/db', '@book-moto/domain'],
  },
  runtimeConfig: {
    databaseUrl: process.env.DATABASE_URL,
    s3Endpoint: process.env.S3_ENDPOINT,
    s3Region: process.env.S3_REGION,
    s3Bucket: process.env.S3_BUCKET,
    s3AccessKeyId: process.env.S3_ACCESS_KEY_ID,
    s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    public: {
      appName: 'Book Moto',
      appUrl: process.env.NUXT_PUBLIC_APP_URL || 'http://localhost:3000',
    },
  },
  app: {
    head: {
      title: 'Book Moto — Rental Operations',
      meta: [
        { name: 'description', content: 'Motorcycle rental operations, fleet and finance control.' },
        { name: 'theme-color', content: '#10100f' },
      ],
    },
  },
  routeRules: {
    '/b/**': { ssr: false, headers: { 'cache-control': 'no-store' } },
    '/api/**': { headers: { 'cache-control': 'no-store' } },
  },
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Book Moto Operations',
      short_name: 'Book Moto',
      description: 'Motorcycle rental operations',
      theme_color: '#10100f',
      background_color: '#10100f',
      display: 'standalone',
      start_url: '/',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
  },
})
