import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Downloads the curated Wikimedia Commons demo photos.
 *
 * Do not switch this back to a text search: the first search hit is not a
 * license review. Every file below is listed with its author and license in
 * docs/third-party/bike-photos.md and must be verified before being replaced.
 */
const models = [
  { slug: 'honda-cb500f', title: 'File:Salon de la Moto et du Scooter de Paris 2013 - Honda - CB500F - 006.jpg' },
  { slug: 'yamaha-mt07', title: 'File:Yamaha MT-07.jpg' },
  { slug: 'honda-vision', title: 'File:Honda Vision Met-in.jpg' },
  { slug: 'ducati-scrambler', title: 'File:Ducati Scrambler Classic 2014.jpg' },
  { slug: 'honda-cb300r', title: 'File:Honda CB 300 R.jpg' },
  { slug: 'suzuki-raider', title: 'File:Suzuki Raider 150 Thailand.jpg' },
  { slug: 'honda-winner-x', title: 'File:Honda Supra GTR 150 - Jakarta Fair 2016 - June 21 2016.jpg' },
]

const outDir = join(process.cwd(), 'apps', 'web', 'public', 'bike-photos')
await mkdir(outDir, { recursive: true })

for (const { slug, title } of models) {
  const api = new URL('https://commons.wikimedia.org/w/api.php')
  api.search = new URLSearchParams({
    action: 'query',
    titles: title,
    prop: 'imageinfo',
    iiprop: 'url|size',
    iiurlwidth: '1280',
    format: 'json',
  }).toString()

  const response = await fetch(api, {
    headers: { 'Api-User-Agent': 'MOTO-OPS demo photo fetch (curated list)' },
  })
  if (!response.ok) {
    console.log(`${slug}: lookup failed ${response.status}`)
    continue
  }
  const data = await response.json()
  const info = Object.values(data.query?.pages ?? {})
    .flatMap(page => page.imageinfo ?? [])[0]

  if (!info?.thumburl) {
    console.log(`${slug}: no image for ${title}`)
    continue
  }

  const image = await fetch(info.thumburl, {
    headers: { 'Api-User-Agent': 'MOTO-OPS demo photo fetch (curated list)' },
  })
  if (!image.ok) {
    console.log(`${slug}: download failed ${image.status}`)
    continue
  }
  const bytes = Buffer.from(await image.arrayBuffer())
  await writeFile(join(outDir, `${slug}.jpg`), bytes)
  console.log(`${slug}: ${Math.round(bytes.length / 1024)} KB  <- ${title}`)
}
