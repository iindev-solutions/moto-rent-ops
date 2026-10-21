import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Runs once before the Nuxt test server starts.
 * Fresh PGlite directory + seed so every run starts from the same fixtures.
 */
export default function setup() {
  const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const repoRoot = resolve(webRoot, '../..')
  const dataDir = process.env.PGLITE_DATA_DIR
  if (!dataDir) throw new Error('PGLITE_DATA_DIR is not set for tests')

  rmSync(dirname(dataDir), { recursive: true, force: true })
  execFileSync('npm', ['run', 'db:seed'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  })
}
