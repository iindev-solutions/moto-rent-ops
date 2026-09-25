<script setup lang="ts">
import { normalizeLocatorToken } from '@book-moto/domain/qr'

const router = useRouter()
const { t } = useLocale()
const manualCode = ref('')
const scannerOpen = ref(false)
const scannerError = ref('')
const { data: health } = await useFetch('/api/health')

function openManualLookup() {
  const token = normalizeLocatorToken(manualCode.value)
  if (!token) {
    scannerError.value = t('home.invalidCode')
    return
  }

  scannerError.value = ''
  router.push(`/b/${token}`)
}

function onScan(value: string) {
  const token = normalizeLocatorToken(value)
  if (!token) {
    scannerError.value = t('home.invalidQr')
    return
  }

  scannerOpen.value = false
  router.push(`/b/${token}`)
}
</script>

<template>
  <div class="page-shell">
    <header class="topbar">
      <div class="mx-auto flex max-w-7xl items-center justify-between gap-5 px-4 py-4 sm:px-6 lg:px-8">
        <div class="flex items-center gap-6">
          <NuxtLink to="/" class="brand-mark">MOTO<em>//</em>OPS</NuxtLink>
          <nav class="hidden items-center gap-5 lg:flex" aria-label="Primary navigation">
            <NuxtLink to="/" class="quiet-link text-[var(--ink)]">{{ t('nav.today') }}</NuxtLink>
            <NuxtLink to="/" class="quiet-link">{{ t('nav.bikes') }}</NuxtLink>
            <NuxtLink to="/" class="quiet-link">{{ t('nav.people') }}</NuxtLink>
            <NuxtLink to="/" class="quiet-link">{{ t('nav.notifications') }}</NuxtLink>
          </nav>
        </div>
        <div class="flex items-center gap-3">
          <span class="hidden items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)] sm:flex">
            <span class="status-dot" aria-hidden="true" />
            {{ health?.status === 'ok' ? t('common.apiOnline') : t('common.apiCheck') }}
          </span>
          <LocaleSwitcher />
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <section class="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.75fr)]">
        <div class="surface p-6 sm:p-10">
          <p class="eyebrow">{{ t('home.eyebrow') }}</p>
          <h1 class="display-title mt-8">{{ t('home.title') }}</h1>
          <p class="mt-6 max-w-xl text-base leading-7 text-[var(--muted)] sm:text-lg">{{ t('home.subtitle') }}</p>

          <div class="mt-10 grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
            <UButton class="button-primary justify-center px-5" icon="i-lucide-scan-line" @click="scannerOpen = true">
              {{ t('home.scan') }}
            </UButton>
            <UInput
              v-model="manualCode"
              class="brutal-input"
              :placeholder="t('home.placeholder')"
              :aria-label="t('home.lookup')"
              @keyup.enter="openManualLookup"
            />
            <UButton class="button-secondary justify-center px-5" @click="openManualLookup">{{ t('home.open') }}</UButton>
          </div>
          <p v-if="scannerError" class="mt-3 font-mono text-xs text-[var(--signal)]" role="alert">{{ scannerError }}</p>
          <p class="mt-5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">{{ t('home.deepLink') }}</p>
        </div>

        <aside class="surface-dark flex flex-col justify-between p-6 sm:p-8">
          <div>
            <div class="flex items-center justify-between border-b border-white/20 pb-4 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">
              <span>{{ t('home.system') }}</span>
              <span class="text-[var(--acid)]">{{ t('home.live') }}</span>
            </div>
            <h2 class="mt-8 max-w-xs text-3xl font-extrabold leading-[0.98] tracking-[-0.055em] text-[var(--surface)]">{{ t('home.source') }}</h2>
          </div>
          <div class="mt-12 grid grid-cols-2 gap-2">
            <div class="metric-card"><p class="data-label text-white/50">{{ t('home.fleet') }}</p><p class="metric-value text-[var(--surface)]">—</p></div>
            <div class="metric-card"><p class="data-label text-white/50">{{ t('home.attention') }}</p><p class="metric-value text-[var(--acid)]">—</p></div>
            <div class="metric-card"><p class="data-label text-white/50">{{ t('home.payments') }}</p><p class="metric-value text-[var(--surface)]">—</p></div>
            <div class="metric-card"><p class="data-label text-white/50">{{ t('home.residency') }}</p><p class="mt-3 font-mono text-xs font-bold uppercase text-[var(--acid)]">Vietnam</p></div>
          </div>
        </aside>
      </section>

      <section class="mt-5 grid gap-5 md:grid-cols-3">
        <article class="surface p-6">
          <div class="flex items-center justify-between"><p class="eyebrow">{{ t('home.todayKicker') }}</p><UIcon name="i-lucide-arrow-up-right" class="size-4 text-[var(--muted)]" /></div>
          <h2 class="mt-8 text-2xl font-extrabold tracking-[-0.045em]">{{ t('home.todayTitle') }}</h2>
          <p class="mt-3 text-sm leading-6 text-[var(--muted)]">{{ t('home.todayBody') }}</p>
          <UButton class="mt-8" variant="ghost" trailing-icon="i-lucide-arrow-right">{{ t('home.openQueue') }}</UButton>
        </article>
        <article class="surface p-6">
          <div class="flex items-center justify-between"><p class="eyebrow">{{ t('home.fleetKicker') }}</p><UIcon name="i-lucide-bike" class="size-4 text-[var(--muted)]" /></div>
          <h2 class="mt-8 text-2xl font-extrabold tracking-[-0.045em]">{{ t('home.fleetTitle') }}</h2>
          <p class="mt-3 text-sm leading-6 text-[var(--muted)]">{{ t('home.fleetBody') }}</p>
          <UButton class="mt-8" variant="ghost" trailing-icon="i-lucide-arrow-right">{{ t('home.openFleet') }}</UButton>
        </article>
        <article class="surface p-6">
          <div class="flex items-center justify-between"><p class="eyebrow">{{ t('home.financeKicker') }}</p><UIcon name="i-lucide-landmark" class="size-4 text-[var(--muted)]" /></div>
          <h2 class="mt-8 text-2xl font-extrabold tracking-[-0.045em]">{{ t('home.financeTitle') }}</h2>
          <p class="mt-3 text-sm leading-6 text-[var(--muted)]">{{ t('home.financeBody') }}</p>
          <UButton class="mt-8" variant="ghost" trailing-icon="i-lucide-arrow-right">{{ t('home.openFinance') }}</UButton>
        </article>
      </section>
    </main>

    <BikeScanner v-if="scannerOpen" @close="scannerOpen = false" @found="onScan" />
  </div>
</template>
