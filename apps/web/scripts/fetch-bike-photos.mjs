import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Downloads one free Wikimedia Commons photo per seeded model for the demo. */
const models = [
  { slug: 'honda-cb500f', query: 'Honda CB500F' },
  { slug: 'yamaha-mt07', query: 'Yamaha MT-07' },
  { slug: 'ktm-390-adventure', query: 'KTM 390 Adventure' },
  { slug: 'honda-xr150l', query: 'Honda XR150' },
  { slug: 'yamaha-xtz150', query: 'Yamaha XTZ 150' },
  { slug: 'honda-vision', query: 'Honda Vision scooter' },
  { slug: 'ducati-scrambler', query: 'Ducati Scrambler' },
  { slug: 'honda-cb300r', query: 'Honda CB300R' },
  { slug: 'suzuki-raider', query: 'Suzuki Raider R150' },
  { slug: 'honda-winner-x', query: 'Honda Winner' },
]

const outDir = join(process.cwd(), 'apps', 'web', 'public', 'bike-photos')
await mkdir(outDir, { recursive: true })

for (const { slug, query } of models) {
  const api = new URL('https://commons.wikimedia.org/w/api.php')
  api.search = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '6',
    gsrlimit: '5',
    prop: 'imageinfo',
    iiprop: 'url|size',
    iiurlwidth: '1280',
    format: 'json',
  }).toString()

  const response = await fetch(api)
  if (!response.ok) {
    console.log(`${slug}: search failed ${response.status}`)
    continue
  }
  const data = await response.json()
  const pages = Object.values(data.query?.pages ?? {})
  const candidate = pages
    .flatMap(page => (page.imageinfo ?? []).map(info => ({ title: page.title, ...info })))
    .find(info => info.thumburl && (info.width ?? 0) >= 800 && /\.(jpe?g|png)$/i.test(info.title))

  if (!candidate?.thumburl) {
    console.log(`${slug}: no image`)
    continue
  }

  const image = await fetch(candidate.thumburl)
  if (!image.ok) {
    console.log(`${slug}: download failed ${image.status}`)
    continue
  }
  const bytes = Buffer.from(await image.arrayBuffer())
  await writeFile(join(outDir, `${slug}.jpg`), bytes)
  console.log(`${slug}: ${Math.round(bytes.length / 1024)} KB  <- ${candidate.title}`)
}
