<script setup lang="ts">
import type { MessageKey } from '~/composables/useLocale'

definePageMeta({ middleware: 'auth' })

type OutboxEvent = {
  id: string
  eventType: string
  aggregateType: string
  aggregateId: string | null
  status: string
  attempts: number
  replayEpoch: number
  nextAttemptAt: string
  lastError: string | null
  sentAt: string | null
  createdAt: string
  payload: Record<string, unknown>
}

const { t, tStatus } = useLocale()
const { user } = useUserSession()
const canView = computed(() => ['owner', 'admin'].includes(user.value?.role || ''))

const status = ref('')
const { data, error, refresh, pending: loading } = await useFetch<{
  events: OutboxEvent[]
  total: number
  hasMore: boolean
}>(() => `/api/outbox?limit=100${status.value ? `&status=${status.value}` : ''}`, { immediate: canView.value })

const events = computed(() => data.value?.events || [])
const busy = ref(false)
const actionError = ref('')
const actionInfo = ref('')

const eventKeys: Record<string, MessageKey> = {
  'receipt.recorded': 'notifications.eventReceipt',
  'rental.handover_completed': 'notifications.eventHandover',
  'rental.return_completed': 'notifications.eventReturn',
  'deposit.returned': 'notifications.eventDeposit',
}

function eventLabel(eventType: string) {
  const key = eventKeys[eventType]
  return key ? t(key) : eventType
}

function shortId(value: string | null) {
  return value ? value.slice(0, 8) : '—'
}

async function processQueue() {
  busy.value = true
  actionError.value = ''
  actionInfo.value = ''
  try {
    const result = await $fetch<{ configured: boolean, sent: number, failed: number, deadLettered: number }>('/api/outbox/process', {
      method: 'POST',
      body: { limit: 100 },
    })
    actionInfo.value = result.configured
      ? t('notifications.processed')
          .replace('{sent}', String(result.sent))
          .replace('{failed}', String(result.failed))
          .replace('{dead}', String(result.deadLettered))
      : t('notifications.notConfigured')
    await refresh()
  } catch (error) {
    actionError.value = apiErrorMessage(error, t('common.error'))
  } finally {
    busy.value = false
  }
}

async function retryEvent(id: string) {
  busy.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/outbox/${id}/retry`, { method: 'POST' })
    await refresh()
  } catch (error) {
    actionError.value = apiErrorMessage(error, t('common.error'))
  } finally {
    busy.value = false
  }
}

async function replayEvent(id: string) {
  if (!window.confirm(t('notifications.confirmReplay'))) return
  busy.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/outbox/${id}/replay`, { method: 'POST' })
    await refresh()
  } catch (error) {
    actionError.value = apiErrorMessage(error, t('common.error'))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <header class="page-header">
      <div>
        <p class="eyebrow">{{ t('nav.operations') }} / 06</p>
        <h1 class="page-title mt-2">{{ t('notifications.title') }}</h1>
        <p class="page-subtitle">{{ t('notifications.subtitle') }}</p>
      </div>
      <div v-if="canView" class="flex flex-wrap gap-2">
        <UButton class="button-primary" :loading="busy" @click="processQueue">{{ t('notifications.process') }}</UButton>
        <UButton class="button-secondary" variant="outline" @click="refresh()">{{ t('notifications.refresh') }}</UButton>
      </div>
    </header>

    <section v-if="!canView" class="panel p-6 text-sm">{{ t('notifications.ownerOnly') }}</section>

    <template v-else>
      <p v-if="actionError" class="mb-4 text-sm text-[var(--danger)]" role="alert">{{ actionError }}</p>
      <p v-if="actionInfo" class="mb-4 text-sm text-[var(--accent)]" role="status">{{ actionInfo }}</p>

      <section class="panel mb-4 flex flex-wrap items-center gap-3 p-4">
        <label class="data-label" for="outbox-status">{{ t('notifications.statusFilter') }}</label>
        <select id="outbox-status" v-model="status" class="brutal-input">
          <option value="">{{ t('notifications.all') }}</option>
          <option value="pending">{{ t('notifications.statusPending') }}</option>
          <option value="processing">{{ t('notifications.statusProcessing') }}</option>
          <option value="sent">{{ t('notifications.statusSent') }}</option>
          <option value="dead_letter">{{ t('notifications.statusDeadLetter') }}</option>
        </select>
        <span class="text-xs text-[var(--text-muted)]">{{ events.length }} / {{ data?.total ?? 0 }}</span>
      </section>

      <section v-if="error" class="panel mb-4 border-[var(--danger)]/30 p-4 text-sm text-[var(--danger)]">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <span>{{ t('common.loadError') }}</span>
          <UButton class="button-secondary" variant="outline" @click="refresh()">{{ t('common.retry') }}</UButton>
        </div>
      </section>

      <section class="panel p-6">
        <div class="mb-4 flex items-center justify-between gap-3">
          <h2 class="text-sm font-semibold">{{ t('notifications.journal') }}</h2>
          <span v-if="loading" class="text-xs text-[var(--text-muted)]">{{ t('common.loading') }}</span>
        </div>

        <div v-if="events.length" class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>{{ t('notifications.event') }}</th>
                <th>{{ t('payments.status') }}</th>
                <th>{{ t('notifications.attempts') }}</th>
                <th>{{ t('notifications.nextAttempt') }}</th>
                <th>{{ t('notifications.lastError') }}</th>
                <th>{{ t('notifications.created') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in events" :key="row.id">
                <td>
                  <p class="font-semibold">{{ eventLabel(row.eventType) }}</p>
                  <p class="font-mono text-[11px] text-[var(--text-muted)]">{{ row.aggregateType }} · {{ shortId(row.aggregateId) }}</p>
                </td>
                <td>
                  <span class="status-pill">{{ tStatus(row.status) }}</span>
                  <p v-if="row.replayEpoch > 0" class="mt-1 font-mono text-[10px] text-[var(--text-muted)]">epoch {{ row.replayEpoch }}</p>
                </td>
                <td class="font-mono text-xs">{{ row.attempts }}</td>
                <td class="font-mono text-xs">{{ row.status === 'sent' ? '—' : formatDateTime(row.nextAttemptAt) }}</td>
                <td class="max-w-[22rem] truncate text-xs text-[var(--danger)]" :title="row.lastError || ''">{{ row.lastError || '—' }}</td>
                <td class="text-xs">{{ formatDateTime(row.createdAt) }}</td>
                <td class="text-right">
                  <div class="flex justify-end gap-2">
                    <UButton v-if="row.status === 'pending'" size="xs" variant="ghost" :loading="busy" @click="retryEvent(row.id)">{{ t('notifications.retry') }}</UButton>
                    <UButton v-if="row.status === 'dead_letter'" size="xs" variant="ghost" :loading="busy" @click="replayEvent(row.id)">{{ t('notifications.replay') }}</UButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else-if="!loading" class="text-sm text-[var(--muted)]">{{ t('notifications.empty') }}</p>
      </section>
    </template>
  </div>
</template>
