import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'

if (process.env.NODE_ENV !== 'production') {
  config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) })
}

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', '@pinia/nuxt', '@vite-pwa/nuxt', 'nuxt-auth-utils'],
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
      appName: 'MOTO//OPS',
      appUrl: process.env.NUXT_PUBLIC_APP_URL || 'http://localhost:3000',
    },
  },
  app: {
    head: {
      title: 'MOTO//OPS — Rental Operations',
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
      name: 'MOTO//OPS Operations',
      short_name: 'MOTO//OPS',
      description: 'Motorcycle rental operations',
      lang: 'ru',
      theme_color: '#10100f',
      background_color: '#10100f',
      display: 'standalone',
      start_url: '/',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,ico,webp}'],
      navigateFallback: '/',
      cleanupOutdatedCaches: true,
     },
  },
})
