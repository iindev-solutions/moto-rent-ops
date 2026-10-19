<script setup lang="ts">
import type { DashboardData, BikeSummary, TodayQueueEntry } from '@book-moto/contracts'
import { normalizeLocatorToken } from '@book-moto/domain/qr'
definePageMeta({ middleware: 'auth' })
const router = useRouter()
const { t, tPriority, tDepositType, tObligationType, tMaintenanceType } = useLocale()
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
const queues = computed(() => dashboard.value?.queues || { handovers: [], returns: [], activeRentals: [], overdueObligations: [], maintenanceDue: [], openIncidents: [], depositsPending: [] })

function dueLabel(date: string | null) {
  if (!date) return ''
  const daysLeft = calendarDaysUntil(date)
  if (daysLeft === null) return ''
  if (daysLeft > 0) return `${daysLeft} ${t('today.days')}`
  if (daysLeft === 0) return t('today.dueToday')
  return `${-daysLeft} ${t('today.daysOverdue')}`
}

function bikeLabel(item: TodayQueueEntry) {
  return [item.assetCode, item.model].filter(Boolean).join(' · ')
}

function obligationTitle(item: TodayQueueEntry) {
  return `${tObligationType(item.type || 'rent')} · ${item.amountMinor ?? '—'} ${item.currency || ''}`.trim()
}

function maintenanceTitle(item: TodayQueueEntry) {
  return `${tMaintenanceType(item.type || 'service')} · ${item.assetCode} · ${item.model}`
}

function depositTitle(item: TodayQueueEntry) {
  const amount = item.amountMinor != null ? ` · ${item.amountMinor} ${item.currency || ''}`.trimEnd() : ''
  return `${tDepositType(item.type || 'cash')}${amount}`
}

function incidentSubtitle(item: TodayQueueEntry) {
  return [item.assetCode ? `${item.assetCode} · ${item.model}` : null, item.priority ? tPriority(item.priority) : null].filter(Boolean).join(' · ')
}

function clientSubtitle(item: TodayQueueEntry) {
  if (item.clientName && item.date) return `${item.clientName} · ${formatDateTime(item.date)}`
  return item.clientName || formatDateTime(item.date)
}

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
    scannerOpen.value = false
    scannerError.value = t('home.invalidQr')
    return
  }

  scannerOpen.value = false
  router.push(`/b/${token}`)
}

const exporting = ref(false)

async function exportCsv() {
  exporting.value = true
  scannerError.value = ''
  try {
    const { bikes } = await $fetch<{ bikes: BikeSummary[] }>('/api/bikes')
    const header = ['assetCode', 'model', 'plate', 'status', 'location', 'nextAction']
    const rows = bikes.map(bike => [bike.assetCode, bike.model, bike.plate || '', bike.status, bike.location || '', bike.nextAction || ''])
    const csv = [header, ...rows]
      .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `moto-ops-fleet-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    scannerError.value = apiErrorMessage(error, t('common.error'))
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div>
    <header class="page-header">
      <div>
        <p class="eyebrow">{{ t('nav.operations') }} / 01</p>
        <h1 class="page-title mt-2">{{ t('nav.overview') }}</h1>
        <p class="page-subtitle">{{ t('dashboard.subtitle') }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton class="button-primary" icon="i-lucide-key-round" @click="router.push('/rent')">{{ t('nav.rentOut') }}</UButton>
        <UButton class="button-secondary" icon="i-lucide-undo-2" @click="router.push('/return')">{{ t('nav.returnBike') }}</UButton>
        <UButton class="button-secondary" icon="i-lucide-download" variant="ghost" :loading="exporting" @click="exportCsv">{{ t('dashboard.export') }}</UButton>
        <UButton class="button-primary" icon="i-lucide-scan-line" variant="outline" @click="scannerOpen = true">{{ t('home.scan') }}</UButton>
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
        <p class="mt-1 text-xs text-[var(--text-muted)]">{{ t('dashboard.availableHint') }}</p>
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
    <section class="content-grid mt-6">
      <div class="panel overflow-hidden">
        <div class="panel-header"><p class="panel-title">{{ t('today.activeRentals') }}</p></div>
        <div v-if="queues.activeRentals.length" class="panel-body space-y-2">
          <NuxtLink v-for="item in queues.activeRentals" :key="item.id" :to="item.href || '/return'" class="block border-b border-[var(--line)] py-2 last:border-b-0">
            <p class="font-semibold">{{ bikeLabel(item) }}</p>
            <p class="text-xs text-[var(--muted)]">{{ clientSubtitle(item) }} · {{ dueLabel(item.date) }}</p>
          </NuxtLink>
        </div>
        <p v-else class="panel-body text-sm text-[var(--muted)]">{{ t('today.empty') }}</p>
      </div>
      <div class="panel overflow-hidden">
        <div class="panel-header"><p class="panel-title">{{ t('today.handovers') }}</p></div>
        <div v-if="queues.handovers.length" class="panel-body space-y-2">
          <NuxtLink v-for="item in queues.handovers" :key="item.id" :to="item.href || '/people'" class="block border-b border-[var(--line)] py-2 last:border-b-0">
            <p class="font-semibold">{{ bikeLabel(item) }}</p>
            <p v-if="item.date" class="text-xs text-[var(--muted)]">{{ formatDateTime(item.date) }}</p>
          </NuxtLink>
        </div>
        <p v-else class="panel-body text-sm text-[var(--muted)]">{{ t('today.empty') }}</p>
      </div>
      <div class="panel overflow-hidden">
        <div class="panel-header"><p class="panel-title">{{ t('today.returns') }}</p></div>
        <div v-if="queues.returns.length" class="panel-body space-y-2">
          <NuxtLink v-for="item in queues.returns" :key="item.id" :to="item.href || '/return'" class="block border-b border-[var(--line)] py-2 last:border-b-0">
            <p class="font-semibold">{{ bikeLabel(item) }}</p>
            <p class="text-xs text-[var(--muted)]">{{ clientSubtitle(item) }} · {{ dueLabel(item.date) }}</p>
          </NuxtLink>
        </div>
        <p v-else class="panel-body text-sm text-[var(--muted)]">{{ t('today.empty') }}</p>
      </div>
      <div class="panel overflow-hidden">
        <div class="panel-header"><p class="panel-title">{{ t('today.overdue') }}</p></div>
        <div v-if="queues.overdueObligations.length" class="panel-body space-y-2">
          <NuxtLink v-for="item in queues.overdueObligations" :key="item.id" :to="item.href || '/finance'" class="block border-b border-[var(--line)] py-2 last:border-b-0">
            <p class="font-semibold">{{ obligationTitle(item) }}</p>
            <p class="text-xs text-[var(--muted)]">{{ clientSubtitle(item) }}</p>
          </NuxtLink>
        </div>
        <p v-else class="panel-body text-sm text-[var(--muted)]">{{ t('today.empty') }}</p>
      </div>
      <div class="panel overflow-hidden">
        <div class="panel-header"><p class="panel-title">{{ t('today.maintenance') }}</p></div>
        <div v-if="queues.maintenanceDue.length" class="panel-body space-y-2">
          <NuxtLink v-for="item in queues.maintenanceDue" :key="item.id" :to="item.href || '/maintenance'" class="block border-b border-[var(--line)] py-2 last:border-b-0">
            <p class="font-semibold">{{ maintenanceTitle(item) }}</p>
            <p v-if="item.date" class="text-xs text-[var(--muted)]">{{ formatDateTime(item.date) }}</p>
          </NuxtLink>
        </div>
        <p v-else class="panel-body text-sm text-[var(--muted)]">{{ t('today.empty') }}</p>
      </div>
      <div class="panel overflow-hidden">
        <div class="panel-header"><p class="panel-title">{{ t('today.incidents') }}</p></div>
        <div v-if="queues.openIncidents.length" class="panel-body space-y-2">
          <NuxtLink v-for="item in queues.openIncidents" :key="item.id" :to="item.href || '/incidents'" class="block border-b border-[var(--line)] py-2 last:border-b-0">
            <p class="font-semibold">{{ item.title }}</p>
            <p v-if="incidentSubtitle(item)" class="text-xs text-[var(--muted)]">{{ incidentSubtitle(item) }}</p>
          </NuxtLink>
        </div>
        <p v-else class="panel-body text-sm text-[var(--muted)]">{{ t('today.empty') }}</p>
      </div>
      <div class="panel overflow-hidden">
        <div class="panel-header"><p class="panel-title">{{ t('today.deposits') }}</p></div>
        <div v-if="queues.depositsPending.length" class="panel-body space-y-2">
          <NuxtLink v-for="item in queues.depositsPending" :key="item.id" :to="item.href || '/finance'" class="block border-b border-[var(--line)] py-2 last:border-b-0">
            <p class="font-semibold">{{ depositTitle(item) }}</p>
            <p v-if="item.clientName" class="text-xs text-[var(--muted)]">{{ item.clientName }}</p>
          </NuxtLink>
        </div>
        <p v-else class="panel-body text-sm text-[var(--muted)]">{{ t('today.empty') }}</p>
      </div>
    </section>
    <section class="content-grid">
      <div class="panel overflow-hidden">
        <div class="panel-header">
          <div><p class="panel-title">{{ t('dashboard.recent') }}</p><p class="mt-1 text-xs text-[var(--text-muted)]">{{ t('dashboard.subtitle') }}</p></div>
          <UInput v-model="search" class="w-full max-w-56" :placeholder="t('dashboard.search')" :aria-label="t('dashboard.search')" />
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
          <NuxtLink to="/rent" class="quick-action w-full"><UIcon name="i-lucide-key-round" class="size-4" /><span>{{ t('nav.rentOut') }}</span><UIcon name="i-lucide-arrow-up-right" class="ml-auto size-3.5" /></NuxtLink>
          <NuxtLink to="/return" class="quick-action w-full"><UIcon name="i-lucide-undo-2" class="size-4" /><span>{{ t('nav.returnBike') }}</span><UIcon name="i-lucide-arrow-up-right" class="ml-auto size-3.5" /></NuxtLink>
          <button class="quick-action w-full" type="button" @click="scannerOpen = true"><UIcon name="i-lucide-scan-line" class="size-4" /><span>{{ t('home.scan') }}</span></button>
          <NuxtLink to="/bikes" class="quick-action w-full"><UIcon name="i-lucide-bike" class="size-4" /><span>{{ t('fleet.title') }}</span><UIcon name="i-lucide-arrow-up-right" class="ml-auto size-3.5" /></NuxtLink>
          <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <UInput v-model="manualCode" class="w-full" :placeholder="t('home.placeholder')" :aria-label="t('home.lookup')" @keyup.enter="openManualLookup" />
            <UButton class="button-secondary" @click="openManualLookup">{{ t('home.open') }}</UButton>
          </div>
          <p v-if="scannerError" class="text-xs text-[var(--danger)]" role="alert">{{ scannerError }}</p>
        </div>
        <div class="panel-header border-t border-b-0"><p class="panel-title">{{ t('dashboard.regions') }}</p><span class="status-pill">{{ t('dashboard.vietnam') }}</span></div>
        <div class="panel-body pt-0 text-sm text-[var(--text-muted)]">{{ t('home.residency') }}: <span class="font-semibold text-[var(--text)]">{{ t('dashboard.vietnam') }}</span></div>
      </aside>
    </section>

    <BikeScanner v-if="scannerOpen" @close="scannerOpen = false" @found="onScan" />
  </div>
</template>
