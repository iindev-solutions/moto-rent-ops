export interface PhotoCredit {
  author: string
  license: string
  licenseUrl: string
  sourceUrl: string
}

/**
 * Attribution for the bundled demo motorcycle photos.
 *
 * Every entry was verified byte-for-byte against the linked Wikimedia Commons
 * file (or its 1280 px thumbnail) on 2026-10-30. Keep this table in sync with
 * `docs/third-party/bike-photos.md`; photos without an entry are not shown.
 */
const credits: Record<string, PhotoCredit> = {
  '/bike-photos/ducati-scrambler.jpg': {
    author: 'HansFritzvonUmlauts',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Ducati_Scrambler_Classic_2014.jpg',
  },
  '/bike-photos/honda-cb300r.jpg': {
    author: 'Onjacktallcuca',
    license: 'Public domain',
    licenseUrl: 'https://creativecommons.org/publicdomain/mark/1.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Honda_CB_300_R.jpg',
  },
  '/bike-photos/honda-cb500f.jpg': {
    author: 'Thesupermat',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Salon_de_la_Moto_et_du_Scooter_de_Paris_2013_-_Honda_-_CB500F_-_006.jpg',
  },
  '/bike-photos/honda-vision.jpg': {
    author: 'Jelle Jansen',
    license: 'CC BY 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/2.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Honda_Vision_Met-in.jpg',
  },
  '/bike-photos/honda-winner-x.jpg': {
    author: 'Wilzz99',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Honda_Supra_GTR_150_-_Jakarta_Fair_2016_-_June_21_2016.jpg',
  },
  '/bike-photos/suzuki-raider.jpg': {
    author: 'Khaosaming',
    license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Suzuki_Raider_150_Thailand.jpg',
  },
  '/bike-photos/yamaha-mt07.jpg': {
    author: 'Na-Thur',
    license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Yamaha_MT-07.jpg',
  },
}

export function photoCredit(photoUrl: string | null | undefined): PhotoCredit | null {
  return photoUrl ? credits[photoUrl] ?? null : null
}
