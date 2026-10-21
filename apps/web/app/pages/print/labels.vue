<script setup lang="ts">
import type { BikeSummary, BikesResponse } from '@book-moto/contracts'
import { formatManualCode } from '@book-moto/domain/qr'

definePageMeta({ middleware: 'auth', layout: false })

type PrintableBike = BikeSummary & { qrToken: string, manualCode: string }

const route = useRoute()
const { t } = useLocale()
const printedAt = new Date()
const search = computed(() => (typeof route.query.search === 'string' ? route.query.search.trim() : ''))

const { data, error, status, refresh } = await useFetch<BikesResponse>(() => {
  const params = new URLSearchParams({ limit: '200' })
  if (search.value) params.set('search', search.value)
  return `/api/bikes?${params.toString()}`
})

const bikes = computed<PrintableBike[]>(() => (data.value?.bikes || []).filter((bike): bike is PrintableBike => Boolean(bike.qrToken && bike.manualCode)))
const total = computed(() => data.value?.total ?? bikes.value.length)
const skipped = computed(() => (data.value?.bikes || []).length - bikes.value.length)

function printLabels() {
  window.print()
}
</script>

<template>
  <div class="page-shell">
    <header class="topbar no-print">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <NuxtLink to="/" class="brand-mark">MOTO<em>//</em>OPS</NuxtLink>
        <LocaleSwitcher />
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div class="no-print flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="eyebrow">{{ t('bike.printLabel') }}</p>
          <h1 class="mt-2 text-3xl font-extrabold tracking-[-0.04em]">{{ t('print.title') }}</h1>
          <p class="mt-2 max-w-xl text-sm text-[var(--muted)]">{{ t('print.subtitle') }}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton class="button-secondary" variant="outline" icon="i-lucide-arrow-left" to="/bikes">{{ t('print.back') }}</UButton>
          <UButton class="button-primary" icon="i-lucide-printer" :disabled="status !== 'success' || bikes.length === 0" @click="printLabels">{{ t('print.action') }}</UButton>
        </div>
      </div>

      <p v-if="status === 'pending'" class="no-print mt-8 text-sm text-[var(--muted)]">{{ t('common.loading') }}</p>
      <div v-else-if="error" class="no-print mt-8">
        <div class="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/5 p-4 text-sm text-[var(--danger)]">
          <p>{{ t('common.error') }}</p>
          <UButton class="mt-3" variant="outline" @click="refresh()">{{ t('common.retry') }}</UButton>
        </div>
      </div>
      <template v-else>
        <p class="no-print mt-6 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
          {{ bikes.length }} / {{ total }} · {{ search ? `“${search}”` : t('print.all') }}
        </p>
        <p v-if="skipped" class="no-print mt-1 text-xs text-[var(--muted)]">{{ t('print.skipped') }}</p>

        <div v-if="bikes.length" class="label-sheet mt-6">
          <article v-for="bike in bikes" :key="bike.id" class="label-card">
            <div class="label-qr-wrap">
              <img class="label-qr" :src="`/api/bikes/${encodeURIComponent(bike.qrToken)}/qr.svg`" :alt="t('bike.qrAlt')" />
            </div>
            <div class="label-head">
              <p class="label-brand">MOTO//OPS</p>
              <p class="label-asset">{{ bike.assetCode }}</p>
              <p class="label-model">{{ bike.model }}</p>
              <p class="label-line">{{ bike.plate || t('bike.noPlate') }} · {{ bike.location || '—' }}</p>
            </div>
            <div class="label-foot">
              <p class="label-code">{{ t('bike.manualCode') }}: {{ formatManualCode(bike.manualCode) }}</p>
              <p class="label-instruction">{{ t('bike.printInstruction') }}</p>
              <p class="label-date">{{ t('bike.printedAt') }}: {{ formatDateTime(printedAt) }}</p>
            </div>
          </article>
        </div>
        <p v-else class="no-print mt-8 text-sm text-[var(--muted)]">{{ t('print.empty') }}</p>
      </template>
    </main>
  </div>
</template>

<style scoped>
.label-sheet {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88mm, 1fr));
  gap: 4mm;
}
.label-card {
  display: grid;
  grid-template-columns: 36mm minmax(0, 1fr);
  grid-template-areas: "qr head" "foot foot";
  gap: 3mm 4mm;
  break-inside: avoid;
  page-break-inside: avoid;
  border: 1px dashed #9aa0a6;
  border-radius: 2mm;
  background: #fff;
  color: #11110f;
  padding: 4mm;
  min-height: 58mm;
}
.label-qr-wrap { grid-area: qr; display: flex; align-items: center; justify-content: center; }
.label-qr { display: block; width: 34mm; height: 34mm; }
.label-head { grid-area: head; min-width: 0; }
.label-brand { font-family: var(--font-mono); font-size: 7pt; font-weight: 700; letter-spacing: 0.14em; }
.label-asset { margin-top: 1.5mm; font-size: 20pt; font-weight: 800; line-height: 1; letter-spacing: -0.02em; }
.label-model { margin-top: 1.5mm; font-size: 10pt; font-weight: 600; }
.label-line { margin-top: 1mm; font-size: 8pt; color: #444; }
.label-foot { grid-area: foot; border-top: 1px solid #d7d7d2; padding-top: 2mm; }
.label-code { font-family: var(--font-mono); font-size: 6.4pt; font-weight: 700; word-break: break-all; }
.label-instruction { margin-top: 1mm; font-size: 6.4pt; color: #444; }
.label-date { margin-top: 1mm; font-size: 6.4pt; color: #6b6b66; }

@page { size: A4; margin: 10mm; }
@media print {
  :global(html), :global(body) { background: #fff !important; }
  .no-print { display: none !important; }
  main { padding: 0 !important; }
  .label-sheet { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4mm; margin-top: 0 !important; }
  .label-card { border-radius: 0; }
}
</style>
