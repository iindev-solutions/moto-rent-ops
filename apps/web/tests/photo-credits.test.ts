import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { photoCredit } from '../app/utils/photoCredits'

/**
 * Every demo photo referenced by the seed must have a verified attribution and
 * a real file. This is the guard that keeps unlicensed images out of the repo.
 */
describe('demo photo licensing', () => {
  it('credits and ships every seeded photo', async () => {
    const seed = await readFile(
      fileURLToPath(new URL('../../../packages/db/src/seed.ts', import.meta.url)),
      'utf8',
    )
    const urls = [...seed.matchAll(/photoUrl: '(\/bike-photos\/[^']+)'/g)].map(match => match[1]!)

    expect(urls.length).toBeGreaterThan(0)

    for (const url of urls) {
      const credit = photoCredit(url)
      expect(credit, `missing credit for ${url}`).not.toBeNull()
      expect(credit!.author.length).toBeGreaterThan(0)
      expect(credit!.license.length).toBeGreaterThan(0)
      expect(credit!.licenseUrl).toMatch(/^https:\/\//)
      expect(credit!.sourceUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\//)

      const file = fileURLToPath(new URL(`../public${url}`, import.meta.url))
      await expect(stat(file)).resolves.toMatchObject({ size: expect.any(Number) })
    }
  })

  it('returns null for an unknown or empty photo', () => {
    expect(photoCredit('/bike-photos/unknown.jpg')).toBeNull()
    expect(photoCredit(null)).toBeNull()
  })
})
