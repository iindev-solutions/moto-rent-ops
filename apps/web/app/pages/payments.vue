<script setup lang="ts">
import type { PaymentsData } from '@book-moto/contracts'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const router = useRouter()
const { t, locale, tStatus, tObligationType, tMethod } = useLocale()

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

function currentMonthKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const currentMonth = currentMonthKey()
const month = computed(() => {
  const value = String(route.query.month || '')
  return MONTH_RE.test(value) ? value : currentMonth
})
const isCurrentMonth = computed(() => month.value === currentMonth)
const monthLabel = computed(() => formatMonthLabel(month.value, locale.value))

const { data, error, refresh } = await useFetch<PaymentsData>(() => `/api/payments?month=${month.value}`, {
  watch: [month],
})

const receipts = computed(() => data.value?.receipts || [])
const due = computed(() => data.value?.due || [])
const totals = computed(() => data.value?.totals || { receivedMinor: 0, dueMinor: 0, overdueMinor: 0 })
const counts = computed(() => data.value?.counts || { receipts: 0, due: 0, overdue: 0 })

function shiftMonth(delta: number) {
  const year = Number(month.value.slice(0, 4))
  const monthNumber = Number(month.value.slice(5, 7))
  const date = new Date(year, monthNumber - 1 + delta, 1)
  const next = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  router.push({ path: '/payments', query: { month: next } })
}

function goCurrent() {
  router.push({ path: '/payments', query: { month: currentMonth } })
}

function recordLabel(count: number) {
  return count === 1 ? t('payments.record') : t('payments.records')
}
</script>

<template>
  <div>
    <header class="page-header">
      <div>
        <p class="eyebrow">{{ t('nav.finance') }} / 05</p>
        <h1 class="page-title mt-2">{{ t('payments.title') }}</h1>
        <p class="page-subtitle">{{ t('payments.subtitle') }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UButton class="button-secondary" icon="i-lucide-chevron-left" :aria-label="t('payments.previousMonth')" @click="shiftMonth(-1)" />
        <p class="min-w-36 text-center font-mono text-sm font-bold">{{ monthLabel }}</p>
        <UButton class="button-secondary" icon="i-lucide-chevron-right" :aria-label="t('payments.nextMonth')" @click="shiftMonth(1)" />
        <UButton v-if="!isCurrentMonth" class="button-secondary" @click="goCurrent">{{ t('payments.thisMonth') }}</UButton>
      </div>
    </header>

    <section v-if="error" class="panel mb-4 border-[var(--danger)]/30 p-4 text-sm text-[var(--danger)]">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <span>{{ t('common.loadError') }}</span>
        <UButton class="button-secondary" variant="outline" @click="refresh()">{{ t('common.retry') }}</UButton>
      </div>
    </section>

    <section class="pay-summary" aria-label="Payment totals">
      <div class="pay-metric">
        <p class="data-label">{{ t('payments.receivedThisMonth') }}</p>
        <p class="pay-value text-[var(--success)]">{{ formatMoney(totals.receivedMinor) }}</p>
        <p class="mt-1 text-xs text-[var(--text-muted)]">{{ counts.receipts }} {{ recordLabel(counts.receipts) }}</p>
      </div>
      <div class="pay-metric">
        <p class="data-label">{{ t('payments.dueThisMonth') }}</p>
        <p class="pay-value" :class="totals.dueMinor ? 'text-[var(--warning)]' : ''">{{ formatMoney(totals.dueMinor) }}</p>
        <p class="mt-1 text-xs text-[var(--text-muted)]">{{ counts.due }} {{ recordLabel(counts.due) }}</p>
      </div>
      <div class="pay-metric">
        <p class="data-label">{{ t('payments.overdueThisMonth') }}</p>
        <p class="pay-value" :class="totals.overdueMinor ? 'text-[var(--danger)]' : ''">{{ formatMoney(totals.overdueMinor) }}</p>
        <p class="mt-1 text-xs text-[var(--text-muted)]">{{ counts.overdue }} {{ recordLabel(counts.overdue) }}</p>
      </div>
    </section>

    <section class="panel mt-6 overflow-hidden">
      <div class="panel-header">
        <p class="panel-title">{{ t('payments.received') }}</p>
        <span class="queue-count">{{ counts.receipts }}</span>
      </div>
      <div v-if="receipts.length" class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>{{ t('payments.date') }}</th>
              <th>{{ t('payments.client') }}</th>
              <th class="text-right">{{ t('payments.amount') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in receipts" :key="row.id">
              <td class="whitespace-nowrap">{{ formatDateTime(row.receivedAt) }}<span class="block text-xs font-normal text-[var(--text-muted)]">{{ tMethod(row.method) }}</span></td>
              <td class="font-semibold">{{ row.clientName || t('common.unknown') }}</td>
              <td class="whitespace-nowrap text-right font-mono">{{ formatMoney(row.amountMinor, row.currency) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2" class="text-right">{{ t('payments.total') }}</td>
              <td class="whitespace-nowrap text-right font-mono">{{ formatMoney(totals.receivedMinor) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div v-else class="empty-state">{{ t('payments.noReceipts') }}</div>
    </section>

    <section class="panel mt-6 overflow-hidden">
      <div class="panel-header">
        <p class="panel-title">{{ t('payments.due') }}</p>
        <span class="queue-count">{{ counts.due }}</span>
      </div>
      <div v-if="due.length" class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>{{ t('payments.dueDate') }}</th>
              <th>{{ t('payments.client') }}</th>
              <th class="text-right">{{ t('payments.remaining') }}</th>
              <th>{{ t('payments.status') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in due" :key="row.id">
              <td class="whitespace-nowrap" :class="{ 'font-semibold text-[var(--danger)]': row.status === 'overdue' }">{{ formatDate(row.dueDate) }}</td>
              <td class="font-semibold">{{ row.clientName || t('common.unknown') }}<span class="block text-xs font-normal text-[var(--text-muted)]">{{ tObligationType(row.type) }}</span></td>
              <td class="whitespace-nowrap text-right font-mono">{{ formatMoney(row.balanceMinor, row.currency) }}</td>
              <td><span class="status-pill" :class="statusTone(row.status)">{{ tStatus(row.status) }}</span></td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2" class="text-right">{{ t('payments.total') }}</td>
              <td class="whitespace-nowrap text-right font-mono">{{ formatMoney(totals.dueMinor) }}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div v-else class="empty-state">{{ t('payments.noDue') }}</div>
    </section>
  </div>
</template>
