/**
 * Demo tunnel: exposes the local dev server over HTTPS (needed for the phone
 * camera) and keeps `.env` + the QR image in sync with the new public URL.
 *
 * Usage: npm run tunnel        (Ctrl+C stops the tunnel)
 *        npm run tunnel:off    (stops a tunnel left running in background)
 */
import { spawn } from 'node:child_process'
import { readFile, utimes, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const QRCode = require('qrcode')

const PORT = process.env.PORT || '3000'
const ENV_PATH = join(process.cwd(), '.env')
const QR_PATH = join(process.cwd(), 'qr-dev.png')
const NUXT_CONFIG = join(process.cwd(), 'apps', 'web', 'nuxt.config.ts')
const URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/

// A tunnel to a dead port only produces 502s; warn before opening it.
try {
  const probe = await fetch(`http://127.0.0.1:${PORT}/api/health`, { signal: AbortSignal.timeout(4000) })
  if (!probe.ok) console.log(`  Warning: :${PORT} answered ${probe.status}. Start \`npm run dev\` first.`)
} catch {
  console.log(`  Warning: nothing is listening on :${PORT}. Start \`npm run dev\` first.`)
}

const child = spawn(
  'npx',
  ['-y', 'cloudflared', 'tunnel', '--url', `http://127.0.0.1:${PORT}`, '--no-autoupdate'],
  { shell: true, stdio: ['ignore', 'pipe', 'pipe'] },
)

let publicUrl = ''

async function publish(url) {
  publicUrl = url
  const env = await readFile(ENV_PATH, 'utf8')
  const next = /^NUXT_PUBLIC_SECURE_APP_URL=.*$/m.test(env)
    ? env.replace(/^NUXT_PUBLIC_SECURE_APP_URL=.*$/m, `NUXT_PUBLIC_SECURE_APP_URL=${url}`)
    : `${env.trimEnd()}\nNUXT_PUBLIC_SECURE_APP_URL=${url}\n`
  await writeFile(ENV_PATH, next)
  await QRCode.toFile(QR_PATH, url, { margin: 1, width: 512 })

  // Nuxt bakes runtimeConfig at startup; touching the config makes the running
  // dev server restart on its own so labels/QR immediately use the new URL.
  try {
    const touched = new Date()
    await utimes(NUXT_CONFIG, touched, touched)
  } catch {
    console.log('  Could not touch nuxt.config.ts — restart `npm run dev` manually.')
  }

  console.log('')
  console.log(`  Public URL : ${url}`)
  console.log(`  .env       : NUXT_PUBLIC_SECURE_APP_URL updated`)
  console.log(`  QR image   : ${QR_PATH}`)
  console.log('')
  console.log('  Nuxt dev picks this up automatically (config touch → restart).')
  console.log('  Stop: Ctrl+C here, or `npm run tunnel:off` in another terminal.')
  console.log('')
}

function scan(chunk) {
  const match = String(chunk).match(URL_PATTERN)
  if (match && match[0] !== publicUrl) {
    void publish(match[0])
  }
}

child.stdout.on('data', scan)
child.stderr.on('data', scan)

child.on('exit', (code) => {
  console.log(`cloudflared exited${code === null ? '' : ` (code ${code})`}`)
  process.exit(code ?? 0)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child.kill()
    process.exit(0)
  })
}
