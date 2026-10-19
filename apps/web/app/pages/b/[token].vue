<script setup lang="ts">
import type { BikeSummary } from '@book-moto/contracts'
import { normalizeLocatorToken } from '@book-moto/domain/qr'

definePageMeta({ middleware: 'auth', layout: false })

const route = useRoute()
const router = useRouter()
const { t, tStatus, tDepositType, tObligationType } = useLocale()
const token = computed(() => normalizeLocatorToken(String(route.params.token || '')) || '')
const tokenReady = Boolean(token.value)
const { data: bike, error, status } = await useFetch<BikeSummary>(() => `/api/bikes/${encodeURIComponent(token.value)}`, {
  retry: 0,
  immediate: tokenReady,
})

const { data: context, error: contextError } = await useFetch<any>(() => `/api/bikes/${encodeURIComponent(token.value)}/context`, {
  retry: 0,
  immediate: tokenReady,
})

const { data: eventsData, error: eventsError } = await useFetch<{ events: Array<{ id: string; action: string; reason: string | null; createdAt: string; actorName: string | null; actorEmail: string | null }> }>(() => `/api/bikes/${encodeURIComponent(token.value)}/events`, {
  retry: 0,
  immediate: tokenReady,
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

function goBack() {
  if (import.meta.client && window.history.length > 1) {
    router.back()
  } else {
    router.push('/bikes')
  }
}

const rotateOpen = ref(false)
const revokeOpen = ref(false)
const reason = ref('')
const pending = ref(false)
const actionError = ref('')

function resetActionState() {
  reason.value = ''
  actionError.value = ''
}

async function rotateQr() {
  if (!token.value) return
  pending.value = true
  actionError.value = ''
  try {
    const response = await $fetch<{ qrToken: string }>(`/api/bikes/${encodeURIComponent(token.value)}/rotate`, {
      method: 'POST',
      body: { reason: reason.value || 'QR label rotated' },
    })
    rotateOpen.value = false
    await router.push(`/b/${response.qrToken}`)
  } catch (error) {
    actionError.value = apiErrorMessage(error, t('common.error'))
  } finally {
    pending.value = false
  }
}

async function revokeQr() {
  if (!token.value || reason.value.trim().length < 3) {
    actionError.value = t('common.error')
    return
  }
  pending.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/bikes/${encodeURIComponent(token.value)}/revoke`, {
      method: 'POST',
      body: { reason: reason.value },
    })
    revokeOpen.value = false
    await router.push('/')
  } catch (error) {
    actionError.value = apiErrorMessage(error, t('common.error'))
  } finally {
    pending.value = false
  }
}

function printLabel() {
  window.print()
}
</script>

<template>
  <div class="page-shell">
    <header class="topbar no-print">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div class="flex items-center gap-5">
          <NuxtLink to="/" class="brand-mark">MOTO<em>//</em>OPS</NuxtLink>
          <span class="hidden font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)] sm:inline">{{ t('bike.motorcycle') }} / {{ token || '—' }}</span>
        </div>
        <LocaleSwitcher />
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <button type="button" class="quiet-link inline-flex items-center gap-2 text-[var(--ink)] underline decoration-2 underline-offset-4 no-print" @click="goBack">← {{ t('bike.back') }}</button>

      <div v-if="status === 'pending'" class="surface mt-8 p-8 no-print">
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

        <div class="no-print mt-6 flex flex-wrap gap-3">
          <UButton class="button-secondary" icon="i-lucide-printer" @click="printLabel">{{ t('bike.printLabel') }}</UButton>
          <UButton class="button-secondary" icon="i-lucide-refresh-cw" @click="rotateOpen = true; resetActionState()">{{ t('bike.rotateQr') }}</UButton>
          <UButton class="button-secondary" icon="i-lucide-ban" variant="outline" @click="revokeOpen = true; resetActionState()">{{ t('bike.revokeQr') }}</UButton>
        </div>

        <p v-if="actionError" class="no-print mt-4 text-sm text-[var(--danger)]" role="alert">{{ actionError }}</p>

        <div v-if="rotateOpen" class="no-print surface mt-6 p-6">
          <p class="eyebrow">{{ t('bike.rotateQr') }}</p>
          <div class="mt-4 grid gap-3">
            <UInput v-model="reason" class="w-full" :placeholder="t('bike.reasonPlaceholder')" />
            <div class="flex gap-2">
              <UButton class="button-primary" :loading="pending" @click="rotateQr">{{ t('bike.confirmRotate') }}</UButton>
              <UButton class="button-secondary" variant="ghost" @click="rotateOpen = false">{{ t('common.cancel') }}</UButton>
            </div>
          </div>
        </div>

        <div v-if="revokeOpen" class="no-print surface mt-6 p-6">
          <p class="eyebrow">{{ t('bike.revokeQr') }}</p>
          <div class="mt-4 grid gap-3">
            <UInput v-model="reason" class="w-full" :placeholder="t('bike.reasonPlaceholder')" />
            <div class="flex gap-2">
              <UButton class="button-primary" variant="solid" color="error" :loading="pending" @click="revokeQr">{{ t('bike.confirmRevoke') }}</UButton>
              <UButton class="button-secondary" variant="ghost" @click="revokeOpen = false">{{ t('common.cancel') }}</UButton>
            </div>
          </div>
        </div>

        <section class="no-print surface mt-6 p-6">
          <p class="panel-title">{{ t('bike.history') }}</p>
          <div v-if="eventsError" class="mt-4 text-sm text-[var(--danger)]" role="alert">{{ t('common.loadError') }}</div>
          <div v-else-if="eventsData?.events?.length" class="mt-4 space-y-3">
            <div v-for="event in eventsData.events" :key="event.id" class="border-b border-[var(--line)] pb-3 last:border-b-0">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="font-mono text-xs font-bold uppercase tracking-[0.12em]">{{ event.action }}</span>
                <span class="text-xs text-[var(--muted)]">{{ formatDateTime(event.createdAt) }}</span>
              </div>
              <p v-if="event.reason" class="mt-1 text-sm">{{ event.reason }}</p>
              <p v-if="event.actorName || event.actorEmail" class="mt-1 text-xs text-[var(--muted)]">{{ event.actorName || event.actorEmail }}</p>
            </div>
          </div>
          <p v-else class="mt-4 text-sm text-[var(--muted)]">{{ t('bike.noHistory') }}</p>
        </section>

        <section class="no-print surface mt-6 p-6">
          <p class="panel-title">{{ t('bike.rentalInfo') }}</p>
          <div v-if="contextError" class="mt-4 text-sm text-[var(--danger)]" role="alert">{{ t('common.loadError') }}</div>
          <div v-else-if="context?.activeRental" class="mt-4 grid gap-3 sm:grid-cols-2">
            <div><p class="data-label">{{ t('people.client') }}</p><p class="mt-1 font-semibold">{{ context.activeRental.client?.displayName || '—' }}</p></div>
            <div><p class="data-label">{{ t('bike.status') }}</p><p class="mt-1 font-semibold">{{ tStatus(context.activeRental.status) }}</p></div>
            <div><p class="data-label">{{ t('people.items') }}</p><p class="mt-1 font-semibold">{{ formatDateTime(context.activeRental.startDate) }} → {{ formatDateTime(context.activeRental.endDate) }}</p></div>
            <div><p class="data-label">{{ t('people.dailyRate') }}</p><p class="mt-1 font-semibold">{{ context.activeRental.dailyRateMinor }} {{ context.activeRental.currency }}</p></div>
          </div>
          <p v-else class="mt-4 text-sm text-[var(--muted)]">{{ t('bike.noActiveRental') }}</p>

          <div v-if="context?.deposits?.length" class="mt-6">
            <p class="panel-title">{{ t('finance.deposits') }}</p>
            <div v-for="deposit in context.deposits" :key="deposit.id" class="mt-2 flex items-center justify-between border-b border-[var(--line)] py-2 last:border-b-0">
              <span>{{ tDepositType(deposit.type) }}</span>
              <span>{{ deposit.amountMinor ?? '—' }} {{ deposit.currency }} · {{ tStatus(deposit.status) }}</span>
            </div>
          </div>

          <div v-if="context?.obligations?.length" class="mt-6">
            <p class="panel-title">{{ t('finance.obligations') }}</p>
            <div v-for="obligation in context.obligations" :key="obligation.id" class="mt-2 flex items-center justify-between border-b border-[var(--line)] py-2 last:border-b-0">
              <span>{{ tObligationType(obligation.type) }}</span>
              <span>{{ obligation.amountMinor }} {{ obligation.currency }} · {{ tStatus(obligation.status) }}</span>
            </div>
          </div>
        </section>

        <section class="print-only print-label">
          <div class="print-header">
            <p class="eyebrow">{{ t('bike.printLabel') }}</p>
            <h1>{{ bike.assetCode }} · {{ bike.model }}</h1>
            <p>{{ bike.plate || t('bike.noPlate') }} · {{ bike.location || '—' }}</p>
          </div>
          <img class="print-qr" :src="`/api/bikes/${encodeURIComponent(token)}/qr.svg`" :alt="t('bike.qrAlt')" />
          <div class="print-meta">
            <p><strong>{{ t('bike.manualCode') }}:</strong> {{ token }}</p>
            <p>{{ t('bike.printInstruction') }}</p>
            <p class="print-version">{{ t('bike.printedAt') }}: {{ formatDateTime(new Date()) }}</p>
          </div>
        </section>

        <p class="no-print mt-6 font-mono text-xs text-[var(--muted)]">{{ t('bike.deepLinkConfirmed') }}</p>
      </section>

      <section v-else class="surface mt-8 p-8 sm:p-10 no-print">
        <p class="eyebrow text-[var(--signal)]">{{ t('bike.lookupFailed') }}</p>
        <h1 class="mt-4 text-4xl font-extrabold tracking-[-0.055em]">{{ t('bike.notFound') }}</h1>
        <p class="mt-4 max-w-xl leading-7 text-[var(--muted)]">{{ t('bike.notFoundBody') }}</p>
        <UButton class="button-secondary mt-8" to="/">{{ t('bike.backPanel') }}</UButton>
      </section>
    </main>
  </div>
</template>

<style scoped>
.print-only { display: none; }
@media print {
  .no-print { display: none !important; }
  .print-only { display: block; }
  .print-label { padding: 24px; text-align: center; }
  .print-qr { width: 220px; height: 220px; margin: 16px auto; }
  .print-header h1 { font-size: 24px; margin: 8px 0; }
  .print-meta { margin-top: 16px; font-size: 12px; }
  .print-version { margin-top: 8px; color: #555; }
}
</style>
