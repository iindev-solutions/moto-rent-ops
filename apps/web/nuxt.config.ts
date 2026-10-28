import { config, parse } from 'dotenv'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const envPath = resolve(process.cwd(), '../../.env')
const fileEnv = existsSync(envPath) ? parse(readFileSync(envPath)) : {}

// In development the local .env is authoritative: a stale variable inherited
// from the shell would silently shadow it (wrong tunnel URL in QR labels,
// rotated session passwords). Deployments keep their own environment.
if (process.env.NODE_ENV === 'development' && !process.env.VITEST && !process.env.NUXT_TEST) {
  for (const [key, value] of Object.entries(fileEnv)) {
    if (key !== 'NODE_ENV') {
      process.env[key] = value
    }
  }
}

config({ path: envPath })

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  colorMode: {
    preference: 'light',
    fallback: 'light',
    storageKey: 'moto-color-mode',
  },
  modules: ['@nuxt/ui', '@pinia/nuxt', '@vite-pwa/nuxt', 'nuxt-auth-utils'],
  // Icons are bundled from the local @iconify-json/lucide collection: runtime
  // calls to api.iconify.design make icons flicker on slow phone/tunnel links.
  icon: {
    serverBundle: 'local',
    clientBundle: { scan: true },
  },
  // Staff demo the QR flow from phones on the LAN; the dev server must accept
  // non-localhost origins. Production binds are handled by the host platform.
  devServer: { host: '0.0.0.0' },
  css: ['~/assets/css/main.css'],
  // Camera demo from phones needs HTTPS; the localtunnel host must be
  // allowed or Vite rejects cross-origin dev requests with 403.
  vite: {
    server: {
      allowedHosts: ['.loca.lt', '.trycloudflare.com'],
    },
  },
  ssr: true,
  typescript: {
    strict: true,
    typeCheck: true,
  },
  build: {
    transpile: ['@book-moto/contracts', '@book-moto/db', '@book-moto/domain', '@book-moto/storage'],
  },
  runtimeConfig: {
    databaseUrl: process.env.DATABASE_URL,
    databaseProvider: process.env.DATABASE_PROVIDER,
    pgliteDataDir: process.env.PGLITE_DATA_DIR,
    pgliteAutoMigrate: process.env.PGLITE_AUTO_MIGRATE,
    s3Endpoint: process.env.S3_ENDPOINT,
    s3Region: process.env.S3_REGION,
    s3Bucket: process.env.S3_BUCKET,
    s3AccessKeyId: process.env.S3_ACCESS_KEY_ID,
    s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    // nuxt-auth-utils resolves the session block through its own defu merge; a
    // plain boolean for cookie.secure is valid at runtime, but Nuxt's generated
    // RuntimeConfig types cannot express it inside a runtime namespace.
    // @ts-expect-error RuntimeValue strict typing vs runtime defu merge
    session: {
      cookie: {
        // Browsers silently drop `Secure` cookies on plain HTTP, which breaks
        // login from any non-localhost origin (e.g. a phone on the LAN).
        secure: (process.env.NUXT_PUBLIC_APP_URL || 'http://localhost:3000').startsWith('https'),
      },
    },
    public: {
      appName: 'MOTO//OPS',
      appUrl: process.env.NUXT_PUBLIC_APP_URL || 'http://localhost:3000',
      // HTTPS origin for phone demos: camera APIs are unavailable on plain HTTP.
      secureAppUrl: process.env.NUXT_PUBLIC_SECURE_APP_URL || '',
    },
  },
  app: {
    head: {
      title: 'MOTO//OPS — Rental Operations',
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'description', content: 'Motorcycle rental operations, fleet and finance control.' },
        { name: 'theme-color', content: '#f6f7f9' },
      ],
    },
  },
  routeRules: {
    // Only the public landing page is server-rendered. Everything behind the
    // staff session stays a client app: it is auth-gated, API-driven and has no
    // SEO value.
    '/login': { ssr: false },
    '/dashboard': { ssr: false },
    '/bikes': { ssr: false },
    '/rent': { ssr: false },
    '/rentals': { ssr: false },
    '/return': { ssr: false },
    '/finance': { ssr: false },
    '/documents': { ssr: false },
    '/maintenance': { ssr: false },
    '/incidents': { ssr: false },
    '/notifications': { ssr: false },
    '/recovery': { ssr: false },
    '/people': { ssr: false },
    '/people/**': { ssr: false },
    '/agreements/**': { ssr: false },
    '/print/**': { ssr: false, headers: { 'cache-control': 'no-store' } },
    '/b/**': { ssr: false, headers: { 'cache-control': 'no-store' } },
    '/offline': { ssr: false },
    '/api/**': { headers: { 'cache-control': 'no-store' } },
    '/**': {
      headers: {
        'x-frame-options': 'DENY',
        'x-content-type-options': 'nosniff',
        'x-permitted-cross-domain-policies': 'none',
        'referrer-policy': 'strict-origin-when-cross-origin',
        'permissions-policy': 'camera=(self), microphone=(), geolocation=()',
        'strict-transport-security': 'max-age=31536000; includeSubDomains',
      },
    },
  },
  nitro: {
    prerender: {
      routes: ['/offline'],
    },
  },
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'MOTO//OPS Operations',
      short_name: 'MOTO//OPS',
      description: 'Motorcycle rental operations',
      lang: 'en',
      theme_color: '#f6f7f9',
      background_color: '#f6f7f9',
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
      navigateFallback: '/offline',
      cleanupOutdatedCaches: true,
     },
  },
})
