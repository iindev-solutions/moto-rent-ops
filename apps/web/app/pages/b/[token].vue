<script setup lang="ts">
import type { BikeSummary } from '@book-moto/contracts'
import { normalizeLocatorToken } from '@book-moto/domain/qr'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const { t } = useLocale()
const token = computed(() => normalizeLocatorToken(String(route.params.token || '')) || '')
const { data: bike, error, status } = await useFetch<BikeSummary>(() => `/api/bikes/${encodeURIComponent(token.value)}`, {
  retry: 0,
})

const statusKeys = {
  available: 'status.available',
  reserved: 'status.reserved',
  rented: 'status.rented',
  inspection: 'status.inspection',
  maintenance: 'status.maintenance',
  blocked: 'status.blocked',
  retired: 'status.retired',
} as const

const statusLabel = computed(() => {
  const key = statusKeys[bike.value?.status as keyof typeof statusKeys]
  return key ? t(key) : t('common.unknown')
})
</script>

<template>
  <div class="page-shell">
    <header class="topbar">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div class="flex items-center gap-5">
          <NuxtLink to="/" class="brand-mark">MOTO<em>//</em>OPS</NuxtLink>
          <span class="hidden font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)] sm:inline">{{ t('bike.motorcycle') }} / {{ token || '—' }}</span>
        </div>
        <LocaleSwitcher />
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <NuxtLink to="/" class="quiet-link inline-flex items-center gap-2 text-[var(--ink)] underline decoration-2 underline-offset-4">← {{ t('bike.back') }}</NuxtLink>

      <div v-if="status === 'pending'" class="surface mt-8 p-8">
        <USkeleton class="h-6 w-32" />
        <USkeleton class="mt-6 h-16 w-3/4" />
        <USkeleton class="mt-4 h-5 w-1/2" />
      </div>

      <section v-else-if="bike" class="mt-8">
        <div class="surface overflow-hidden">
          <div class="flex flex-wrap items-start justify-between gap-6 bg-[var(--ink)] p-6 text-[var(--surface)] sm:p-10">
            <div>
              <p class="eyebrow text-white/50">{{ t('bike.motorcycle') }} / {{ bike.assetCode }}</p>
              <h1 class="mt-4 text-4xl font-extrabold tracking-[-0.065em] sm:text-6xl">{{ bike.model }}</h1>
              <p class="mt-3 font-mono text-sm text-white/60">{{ bike.plate || t('bike.noPlate') }}</p>
            </div>
            <span class="status-pill text-[var(--acid)]">{{ statusLabel }}</span>
          </div>
          <div class="grid gap-px bg-[var(--line)] sm:grid-cols-3">
            <div class="bg-[var(--surface)] p-6"><p class="data-label">{{ t('bike.location') }}</p><p class="mt-3 text-xl font-extrabold">{{ bike.location || '—' }}</p></div>
            <div class="bg-[var(--surface)] p-6"><p class="data-label">{{ t('bike.status') }}</p><p class="mt-3 text-xl font-extrabold">{{ statusLabel }}</p></div>
            <div class="bg-[var(--surface)] p-6"><p class="data-label">{{ t('bike.nextAction') }}</p><p class="mt-3 text-xl font-extrabold">{{ bike.nextAction || t('bike.noAction') }}</p></div>
          </div>
        </div>
        <p class="mt-6 font-mono text-xs text-[var(--muted)]">{{ t('bike.deepLinkConfirmed') }}</p>
      </section>

      <section v-else class="surface mt-8 p-8 sm:p-10">
        <p class="eyebrow text-[var(--signal)]">{{ t('bike.lookupFailed') }}</p>
        <h1 class="mt-4 text-4xl font-extrabold tracking-[-0.055em]">{{ t('bike.notFound') }}</h1>
        <p class="mt-4 max-w-xl leading-7 text-[var(--muted)]">{{ t('bike.notFoundBody') }}</p>
        <UButton class="button-secondary mt-8" to="/">{{ t('bike.backPanel') }}</UButton>
      </section>
    </main>
  </div>
</template>
