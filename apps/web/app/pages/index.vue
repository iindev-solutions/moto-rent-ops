<script setup lang="ts">
definePageMeta({ layout: 'landing' })

const { t } = useLocale()
const { loggedIn } = useUserSession()
const config = useRuntimeConfig()

/**
 * Public business data for MOTORBIKE FOR RENT A. CHÂU.
 * Everything here is taken from the business' own Google Maps listing and the
 * public reviews there. Nothing on this page is invented.
 */
const business = {
  name: 'MOTORBIKE FOR RENT A. CHÂU',
  legalNote: '오토바이렌트 · cho thuê xe máy Đà Nẵng',
  address: '113 Phan Tứ, Ngũ Hành Sơn, Đà Nẵng 550000, Vietnam',
  phoneDisplay: '+84 911 710 610',
  phoneLocal: '091 171 0610',
  phoneHref: 'tel:+84911710610',
  whatsappHref: 'https://wa.me/84911710610',
  zaloHref: 'https://zalo.me/84911710610',
  kakao: 'C1497',
  mapsHref: 'https://maps.app.goo.gl/tgNSiEP1qwubY2YK7',
  mapEmbed: 'https://www.google.com/maps?q=MOTORBIKE+FOR+RENT+A.+CH%C3%82U,+113+Phan+T%E1%BB%A9,+Ng%C5%A9+H%C3%A0nh+S%C6%A1n,+%C4%90%C3%A0+N%E1%BA%B5ng&z=17&hl=vi&output=embed',
  rating: 4.8,
  reviewCount: 289,
  hours: '07:30 – 20:00',
} as const

/** Real Google reviews, verbatim. The critical one is kept on purpose. */
interface Review {
  author: string
  stars: number
  when: string
  text: string
  critical?: boolean
}

const reviews: [Review, Review, Review, Review, Review] = [
  {
    author: 'phillipvillefrance',
    stars: 5,
    when: '11 months ago',
    text: 'Good place to rent your motorbike. Good service. Nice and polite. Speaks English. Good variety of motorbikes in good condition and good prices. 100% Recommend. Thank you for making my holidays memorable.',
  },
  {
    author: 'wulc',
    stars: 5,
    when: '6 months ago',
    text: 'I rented a Honda ADV for a couple of days at first, then extended the lease several times. The owner gave me a discount for the extension, for which I am very grateful! The bike is in excellent condition. I loved everything!',
  },
  {
    author: 'SICILIAN-AMERICAN',
    stars: 5,
    when: 'a year ago',
    text: 'Friendly honest guy. I rented a Honda air blade. It was an older model but ran well. Came with a good phone holder. 1 million vnd for 2 weeks. Deposit was $100 usd deposit. Highly recommended.',
  },
  {
    author: 'Ramzi',
    stars: 4,
    when: 'a year ago',
    text: 'The owner is very friendly. I rented a Honda pcx for one month and everything is going fine. The owner fixed everything that happened to the bike. I am so satisfied.',
  },
  {
    author: '백홍석',
    stars: 3,
    when: '5 months ago',
    text: 'Be careful with this rental shop! Pls dont forget to take pics or videos before you rent! We returned the motorbike without any accident, but they falsely claimed we had dropped it and caused damage. They tried to charge us for scratches we did not make, without any proof. This experience felt like a scam targeting tourists…',
    critical: true,
  },
]

const heroQuote = reviews[0]
const steps = computed(() => [
  { title: t('lp.step1Title'), body: t('lp.step1Body') },
  { title: t('lp.step2Title'), body: t('lp.step2Body') },
  { title: t('lp.step3Title'), body: t('lp.step3Body') },
  { title: t('lp.step4Title'), body: t('lp.step4Body') },
])

const bikes = computed(() => [
  { name: t('lp.bikeScooter'), for: t('lp.bikeScooterFor'), note: t('lp.bikeScooterNote') },
  { name: t('lp.bikeAuto'), for: t('lp.bikeAutoFor'), note: t('lp.bikeAutoNote') },
  { name: t('lp.bikeTouring'), for: t('lp.bikeTouringFor'), note: t('lp.bikeTouringNote') },
  { name: t('lp.bikeElectric'), for: t('lp.bikeElectricFor'), note: t('lp.bikeElectricNote') },
])

useHead({
  title: 'Motorbike for rent A. Châu · Đà Nẵng — 4.8★ from 289 Google reviews',
  meta: [
    {
      name: 'description',
      content: 'Family-run motorbike rental in 113 Phan Tứ, Ngũ Hành Sơn, Đà Nẵng. Scooters, automatics, touring bikes and electric bikes. Open daily 07:30–20:00. Rated 4.8 on Google.',
    },
    { property: 'og:type', content: 'website' },
    { property: 'og:title', content: 'Motorbike for rent A. Châu · Đà Nẵng' },
    {
      property: 'og:description',
      content: 'Motorcycle rental in Ngũ Hành Sơn, Đà Nẵng. Open daily 07:30–20:00. Rated 4.8 on Google from 289 reviews.',
    },
    { property: 'og:url', content: config.public.appUrl },
    { name: 'twitter:card', content: 'summary_large_image' },
  ],
  link: [{ rel: 'canonical', href: config.public.appUrl }],
})
</script>

<template>
  <div class="lp-page">
    <!-- Hero · Quote-led: the headline is a real customer's sentence -->
    <section class="lp-hero">
      <div class="lp-wrap">
        <p class="lp-eyebrow">{{ business.name }} · {{ business.address }}</p>

        <div class="lp-hero__grid">
          <div class="lp-hero__quote">
            <blockquote class="lp-quote">“{{ heroQuote.text }}”</blockquote>
            <p class="lp-attribution">
              <span class="lp-stars" :aria-label="`${heroQuote.stars} out of 5 stars`">
                <span v-for="n in 5" :key="n" :class="['lp-star', { 'is-filled': n <= heroQuote.stars }]">★</span>
              </span>
              <span class="lp-attribution__who">{{ heroQuote.author }}</span>
              <span class="lp-attribution__meta">{{ heroQuote.stars }} stars · {{ t('lp.reviewSource') }} · {{ heroQuote.when }}</span>
            </p>
            <a class="lp-link" :href="business.mapsHref" target="_blank" rel="noopener noreferrer">
              {{ t('lp.allReviews') }} <span aria-hidden="true">→</span>
            </a>
          </div>

          <aside class="lp-panel">
            <div class="lp-rating">
              <span class="lp-rating__value">{{ business.rating }}</span>
              <span class="lp-rating__meta">
                <span class="lp-stars" aria-hidden="true">
                  <span v-for="n in 5" :key="n" :class="['lp-star', { 'is-filled': n <= 5 }]">★</span>
                </span>
                {{ business.reviewCount }} {{ t('lp.reviewCount') }}
              </span>
            </div>

            <div class="lp-cta-row">
              <a class="lp-btn lp-btn--primary" :href="business.phoneHref">{{ t('lp.callCta') }}</a>
              <a class="lp-btn lp-btn--ghost" :href="business.whatsappHref" target="_blank" rel="noopener noreferrer">{{ t('lp.whatsappCta') }}</a>
            </div>

            <dl class="lp-facts">
              <div class="lp-fact">
                <dt>{{ t('lp.factAddress') }}</dt>
                <dd>{{ business.address }}</dd>
              </div>
              <div class="lp-fact">
                <dt>{{ t('lp.factHours') }}</dt>
                <dd>{{ t('lp.hours') }}</dd>
              </div>
              <div class="lp-fact">
                <dt>{{ t('lp.factPhone') }}</dt>
                <dd>
                  <a :href="business.phoneHref">{{ business.phoneDisplay }}</a>
                  <span class="lp-fact__aside">{{ business.phoneLocal }} · {{ t('lp.factZalo') }} · {{ t('lp.factKakao') }} {{ business.kakao }}</span>
                </dd>
              </div>
            </dl>

            <p class="lp-note">{{ t('lp.heroNote') }}</p>
          </aside>
        </div>
      </div>
    </section>

    <!-- How renting works · step sequence -->
    <section class="lp-section lp-wrap" id="how">
      <header class="lp-head">
        <h2 class="lp-h2">{{ t('lp.stepsTitle') }}</h2>
        <p class="lp-lead">{{ t('lp.stepsLead') }}</p>
      </header>

      <ol class="lp-steps">
        <li v-for="(step, index) in steps" :key="step.title" class="lp-step">
          <span class="lp-step__num">{{ String(index + 1).padStart(2, '0') }}</span>
          <div>
            <h3 class="lp-step__title">{{ step.title }}</h3>
            <p class="lp-step__body">{{ step.body }}</p>
          </div>
        </li>
      </ol>
    </section>

    <!-- Which bike · tabular spec sheet -->
    <section class="lp-section lp-wrap" id="bikes">
      <header class="lp-head">
        <h2 class="lp-h2">{{ t('lp.bikesTitle') }}</h2>
        <p class="lp-lead">{{ t('lp.bikesLead') }}</p>
      </header>

      <div class="lp-table-wrap">
        <table class="lp-table">
          <thead>
            <tr>
              <th scope="col">{{ t('lp.colCategory') }}</th>
              <th scope="col">{{ t('lp.colForWho') }}</th>
              <th scope="col">{{ t('lp.colNote') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="bike in bikes" :key="bike.name">
              <th scope="row">{{ bike.name }}</th>
              <td>{{ bike.for }}</td>
              <td>{{ bike.note }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="lp-rates">{{ t('lp.ratesNote') }}</p>
    </section>

    <!-- Reviews · pull quotes with attribution -->
    <section class="lp-section lp-wrap" id="reviews">
      <header class="lp-head">
        <h2 class="lp-h2">{{ t('lp.reviewsTitle') }}</h2>
        <p class="lp-lead">{{ t('lp.reviewsLead') }}</p>
      </header>

      <div class="lp-reviews">
        <figure v-for="review in reviews" :key="review.author" class="lp-review" :class="{ 'is-critical': review.critical }">
          <blockquote class="lp-review__text">“{{ review.text }}”</blockquote>
          <figcaption class="lp-review__caption">
            <span class="lp-stars" :aria-label="`${review.stars} out of 5 stars`">
              <span v-for="n in 5" :key="n" :class="['lp-star', { 'is-filled': n <= review.stars }]">★</span>
            </span>
            <span class="lp-review__author">{{ review.author }}</span>
            <span class="lp-review__meta">{{ review.stars }} ★ · {{ t('lp.reviewSource') }} · {{ review.when }}</span>
          </figcaption>
        </figure>
      </div>

      <p class="lp-rates">
        <a class="lp-link" :href="business.mapsHref" target="_blank" rel="noopener noreferrer">{{ t('lp.allReviews') }} <span aria-hidden="true">→</span></a>
      </p>
    </section>

    <!-- Location · map + facts, heading anchored below -->
    <section class="lp-section lp-wrap" id="location">
      <div class="lp-location">
        <div class="lp-map">
          <iframe
            :src="business.mapEmbed"
            :title="t('lp.mapLabel')"
            loading="lazy"
            referrerpolicy="no-referrer-when-downgrade"
            allowfullscreen
          />
        </div>
        <div class="lp-location__side">
          <h2 class="lp-h2 lp-h2--small">{{ t('lp.contactTitle') }}</h2>
          <p class="lp-lead">{{ t('lp.contactLead') }}</p>
          <div class="lp-cta-row">
            <a class="lp-btn lp-btn--primary" :href="business.phoneHref">{{ business.phoneDisplay }}</a>
            <a class="lp-btn lp-btn--ghost" :href="business.mapsHref" target="_blank" rel="noopener noreferrer">{{ t('lp.visitMaps') }}</a>
          </div>
        </div>
      </div>
    </section>

    <!-- Footer · inline rule, single line -->
    <footer class="lp-footer">
      <div class="lp-wrap lp-footer__row">
        <span class="lp-footer__brand">A. CHÂU</span>
        <span class="lp-footer__text">{{ business.address }}</span>
        <span class="lp-footer__text">{{ t('lp.hours') }}</span>
        <a class="lp-footer__text" :href="business.phoneHref">{{ business.phoneDisplay }}</a>
        <NuxtLink v-if="!loggedIn" to="/login" class="lp-footer__text">{{ t('lp.staffSignIn') }}</NuxtLink>
        <NuxtLink v-else to="/dashboard" class="lp-footer__text">{{ t('common.openDashboard') }}</NuxtLink>
      </div>
    </footer>

    <!-- Mobile call bar -->
    <div class="lp-sticky">
      <a class="lp-btn lp-btn--primary" :href="business.phoneHref">{{ t('lp.callCta') }}</a>
      <a class="lp-btn lp-btn--ghost" :href="business.whatsappHref" target="_blank" rel="noopener noreferrer">{{ t('lp.whatsappCta') }}</a>
    </div>
  </div>
</template>
