import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from 'vitest/config'

// Deterministic test environment: never touch the developer's local PGlite data.
const testDataRoot = join(tmpdir(), 'moto-rent-ops-tests')
process.env.PGLITE_DATA_DIR = join(testDataRoot, 'pglite')
process.env.PGLITE_AUTO_MIGRATE = 'true'
process.env.SEED_ADMIN_EMAIL ||= 'owner@moto.test'
process.env.SEED_ADMIN_PASSWORD ||= 'test-password-2026'
process.env.TOKEN_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString('base64')
process.env.NUXT_SESSION_PASSWORD ||= 'test-session-password-0123456789abcdef'

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.spec.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 240_000,
    globalSetup: ['./tests/e2e/global-setup.ts'],
    fileParallelism: false,
  },
})
