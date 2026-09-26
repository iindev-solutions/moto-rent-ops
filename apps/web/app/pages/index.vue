<script setup lang="ts">
import type { DashboardData } from '@book-moto/contracts'
import { normalizeLocatorToken } from '@book-moto/domain/qr'

const router = useRouter()
const { t } = useLocale()
const search = ref('')
const manualCode = ref('')
const scannerOpen = ref(false)
const scannerError = ref('')
const { data: dashboard, error: dashboardError, refresh: refreshDashboard } = await useFetch<DashboardData>('/api/dashboard')

const stats = computed(() => dashboard.value?.stats || { total: 0, available: 0, rented: 0, attention: 0 })
const visibleBikes = computed(() => {
  const query = search.value.trim().toLowerCase()
  const bikes = dashboard.value?.recentBikes || []
  if (!query) return bikes
  return bikes.filter(bike => [bike.assetCode, bike.model, bike.plate, bike.location].some(value => value?.toLowerCase().includes(query)))
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

function statusLabel(status: string) {
  const key = statusKeys[status as keyof typeof statusKeys]
  return key ? t(key) : t('common.unknown')
}

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
  <div>
    <header class="page-header">
      <div>
        <p class="eyebrow">Operations / 01</p>
        <h1 class="page-title mt-2">{{ t('nav.today') }}</h1>
        <p class="page-subtitle">{{ t('dashboard.subtitle') }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton class="button-secondary" icon="i-lucide-download" variant="ghost">{{ t('dashboard.export') }}</UButton>
        <UButton class="button-primary" icon="i-lucide-scan-line" @click="scannerOpen = true">{{ t('home.scan') }}</UButton>
      </div>
    </header>

    <section class="stat-grid" aria-label="Fleet statistics">
      <div class="stat-card">
        <div class="flex items-center justify-between"><p class="data-label">{{ t('home.fleet') }}</p><UIcon name="i-lucide-bike" class="size-4 text-[var(--text-muted)]" /></div>
        <p class="stat-value">{{ stats.total }}</p>
        <p class="mt-1 text-xs text-[var(--text-muted)]">{{ t('dashboard.fleetHint') }}</p>
      </div>
      <div class="stat-card">
        <div class="flex items-center justify-between"><p class="data-label">{{ t('status.available') }}</p><UIcon name="i-lucide-circle-check" class="size-4 text-[var(--success)]" /></div>
        <p class="stat-value">{{ stats.available }}</p>
        <p class="mt-1 text-xs text-[var(--text-muted)]">{{ t('dashboard.rentedHint') }}</p>
      </div>
      <div class="stat-card">
        <div class="flex items-center justify-between"><p class="data-label">{{ t('status.rented') }}</p><UIcon name="i-lucide-key-round" class="size-4 text-[var(--accent)]" /></div>
        <p class="stat-value">{{ stats.rented }}</p>
        <p class="mt-1 text-xs text-[var(--text-muted)]">{{ t('dashboard.rentedHint') }}</p>
      </div>
      <div class="stat-card">
        <div class="flex items-center justify-between"><p class="data-label">{{ t('home.attention') }}</p><UIcon name="i-lucide-triangle-alert" class="size-4 text-[var(--warning)]" /></div>
        <p class="stat-value">{{ stats.attention }}</p>
        <p class="mt-1 text-xs text-[var(--text-muted)]">{{ t('dashboard.attentionHint') }}</p>
      </div>
    </section>
    <div v-if="dashboardError" class="panel mb-4 border-[var(--danger)]/30 p-4 text-sm text-[var(--danger)]"><div class="flex flex-wrap items-center justify-between gap-3"><span>{{ t('common.error') }}</span><UButton class="button-secondary" variant="outline" @click="refreshDashboard()">{{ t('common.retry') }}</UButton></div></div>

    <section class="content-grid">
      <div class="panel overflow-hidden">
        <div class="panel-header">
          <div><p class="panel-title">{{ t('dashboard.recent') }}</p><p class="mt-1 text-xs text-[var(--text-muted)]">{{ t('dashboard.subtitle') }}</p></div>
          <UInput v-model="search" class="brutal-input max-w-56" :placeholder="t('dashboard.search')" :aria-label="t('dashboard.search')" />
        </div>
        <div v-if="visibleBikes.length" class="overflow-x-auto">
          <table class="data-table">
            <thead><tr><th>{{ t('home.fleet') }}</th><th>{{ t('bike.status') }}</th><th>{{ t('bike.location') }}</th><th>{{ t('bike.nextAction') }}</th></tr></thead>
            <tbody>
              <tr v-for="bike in visibleBikes" :key="bike.id">
                <td><NuxtLink v-if="bike.qrToken" :to="`/b/${bike.qrToken}`" class="font-semibold hover:text-[var(--accent)]">{{ bike.assetCode }} · {{ bike.model }}</NuxtLink><span v-else class="font-semibold">{{ bike.assetCode }} · {{ bike.model }}</span><div class="mt-1 font-mono text-[10px] text-[var(--text-muted)]">{{ bike.plate || '—' }}</div></td>
                <td><span class="status-pill">{{ statusLabel(bike.status) }}</span></td>
                <td>{{ bike.location || '—' }}</td>
                <td>{{ bike.nextAction || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="empty-state">{{ t('dashboard.noRecords') }}</div>
      </div>

      <aside class="panel overflow-hidden">
        <div class="panel-header"><p class="panel-title">{{ t('dashboard.quickActions') }}</p><UIcon name="i-lucide-zap" class="size-4 text-[var(--accent)]" /></div>
        <div class="panel-body space-y-2">
          <button class="quick-action w-full" type="button" @click="scannerOpen = true"><UIcon name="i-lucide-scan-line" class="size-4" /><span>{{ t('home.scan') }}</span></button>
          <NuxtLink to="/bikes" class="quick-action w-full"><UIcon name="i-lucide-bike" class="size-4" /><span>{{ t('fleet.title') }}</span><UIcon name="i-lucide-arrow-up-right" class="ml-auto size-3.5" /></NuxtLink>
          <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <UInput v-model="manualCode" class="brutal-input" :placeholder="t('home.placeholder')" :aria-label="t('home.lookup')" @keyup.enter="openManualLookup" />
            <UButton class="button-secondary" @click="openManualLookup">{{ t('home.open') }}</UButton>
          </div>
          <p v-if="scannerError" class="text-xs text-[var(--danger)]" role="alert">{{ scannerError }}</p>
        </div>
        <div class="panel-header border-t border-b-0"><p class="panel-title">{{ t('dashboard.regions') }}</p><span class="status-pill">{{ t('dashboard.vietnam') }}</span></div>
        <div class="panel-body pt-0 text-sm text-[var(--text-muted)]">{{ t('home.residency') }}: <span class="font-semibold text-[var(--text)]">Vietnam</span></div>
      </aside>
    </section>

    <BikeScanner v-if="scannerOpen" @close="scannerOpen = false" @found="onScan" />
  </div>
</template>
