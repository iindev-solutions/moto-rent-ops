<script setup lang="ts">
import type { MessageKey } from '~/composables/useLocale'

definePageMeta({ middleware: 'auth' })

type RecoveryReason = 'no_drill' | 'verification_incomplete' | 'last_drill_failed' | 'backup_stale'

type RecoveryStatus = {
  ready: boolean
  reason: RecoveryReason | null
  lastDrillId: string | null
  lastDrillAt: string | null
  lastBackupAt: string | null
  backupAgeSeconds: number | null
  openGapCount: number
}

type DrillListItem = {
  id: string
  status: string
  startedAt: string
  finishedAt: string | null
  operatorName: string
  targetEnvironment: string
  artifactRef: string
  failureCode: string | null
}

type DrillScope = {
  scope: string
  expectedCount: number
  actualCount: number
  expectedTotalMinor: number | null
  actualTotalMinor: number | null
  currency: string | null
  status: string
  mismatchCode: string | null
}

type DrillDetail = DrillListItem & {
  manifestChecksum: string | null
  scopes: DrillScope[]
}

const { t, tStatus } = useLocale()
const { user } = useUserSession()
const canView = computed(() => ['owner', 'admin'].includes(user.value?.role || ''))

const status = ref<RecoveryStatus | null>(null)
const statusLoading = ref(false)
const statusError = ref('')

const drills = ref<DrillListItem[]>([])
const nextCursor = ref<string | null>(null)
const listLoading = ref(false)
const listError = ref('')

const selected = ref<DrillDetail | null>(null)
const detailLoadingId = ref<string | null>(null)
const detailError = ref('')

const reasonKeys: Record<RecoveryReason, MessageKey> = {
  no_drill: 'recovery.reasonNoDrill',
  verification_incomplete: 'recovery.reasonIncomplete',
  last_drill_failed: 'recovery.reasonFailed',
  backup_stale: 'recovery.reasonStale',
}

async function loadStatus() {
  statusLoading.value = true
  statusError.value = ''
  try {
    status.value = await $fetch<RecoveryStatus>('/api/recovery/status')
  } catch (error) {
    statusError.value = apiErrorMessage(error, t('recovery.loadError'))
  } finally {
    statusLoading.value = false
  }
}

async function loadDrills(reset = true) {
  if (!canView.value) return
  if (!reset && !nextCursor.value) return
  listLoading.value = true
  listError.value = ''
  try {
    const page = await $fetch<{ drills: DrillListItem[], nextCursor: string | null }>('/api/recovery/drills', {
      query: {
        limit: 20,
        ...(reset || !nextCursor.value ? {} : { cursor: nextCursor.value }),
      },
    })
    drills.value = reset ? page.drills : [...drills.value, ...page.drills]
    nextCursor.value = page.nextCursor
  } catch (error) {
    listError.value = apiErrorMessage(error, t('recovery.loadError'))
  } finally {
    listLoading.value = false
  }
}

async function refreshAll() {
  selected.value = null
  await Promise.all([loadStatus(), loadDrills(true)])
}

async function toggleDrill(id: string) {
  if (selected.value?.id === id) {
    selected.value = null
    return
  }
  detailLoadingId.value = id
  detailError.value = ''
  try {
    selected.value = await $fetch<DrillDetail>(`/api/recovery/drills/${id}`)
  } catch (error) {
    selected.value = null
    detailError.value = apiErrorMessage(error, t('recovery.loadError'))
  } finally {
    detailLoadingId.value = null
  }
}

function formatAge(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return '—'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return t('recovery.ageMinutes').replace('{count}', String(minutes))
  return t('recovery.ageHours').replace('{count}', String(Math.floor(minutes / 60)))
}

function reasonLabel(reason: RecoveryReason | null) {
  return reason ? t(reasonKeys[reason]) : ''
}

function scopeTotal(scope: DrillScope, value: number | null) {
  if (value === null) return '—'
  return formatMoney(value, scope.currency || 'VND')
}

onMounted(() => {
  if (canView.value) refreshAll()
})
</script>

<template>
  <div>
    <header class="page-header">
      <div>
        <p class="eyebrow">{{ t('nav.operations') }} / 07</p>
        <h1 class="page-title mt-2">{{ t('recovery.title') }}</h1>
        <p class="page-subtitle">{{ t('recovery.subtitle') }}</p>
      </div>
      <div v-if="canView" class="flex flex-wrap gap-2">
        <UButton class="button-secondary" variant="outline" :loading="statusLoading || listLoading" @click="refreshAll">
          {{ t('recovery.refresh') }}
        </UButton>
      </div>
    </header>

    <section v-if="!canView" class="panel p-6 text-sm">{{ t('recovery.ownerOnly') }}</section>

    <template v-else>
      <section v-if="statusError" class="panel mb-4 border-[var(--danger)]/30 p-4 text-sm text-[var(--danger)]">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <span>{{ statusError }}</span>
          <UButton class="button-secondary" variant="outline" @click="loadStatus">{{ t('common.retry') }}</UButton>
        </div>
      </section>

      <section
        class="panel mb-4 p-6"
        :class="status?.ready ? 'border-[var(--success)]/30' : 'border-[var(--warning)]/30'"
      >
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p class="eyebrow">{{ t('recovery.readiness') }}</p>
            <h2 class="mt-2 text-xl font-semibold">
              {{ status?.ready ? t('recovery.ready') : t('recovery.notReady') }}
            </h2>
            <p v-if="status?.reason" class="mt-1 text-sm text-[var(--warning)]">{{ reasonLabel(status.reason) }}</p>
            <p v-else-if="status" class="mt-1 text-sm text-[var(--text-muted)]">{{ t('recovery.readyBody') }}</p>
            <p v-else-if="statusLoading" class="mt-1 text-sm text-[var(--text-muted)]">{{ t('common.loading') }}</p>
          </div>
          <span v-if="status" class="status-pill" :class="status.ready ? 'is-success' : 'is-warning'">
            {{ status.ready ? t('recovery.ready') : t('recovery.notReady') }}
          </span>
        </div>

        <dl v-if="status" class="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <dt class="data-label">{{ t('recovery.lastBackup') }}</dt>
            <dd class="mt-1 font-mono text-sm">{{ formatDateTime(status.lastBackupAt) }}</dd>
          </div>
          <div>
            <dt class="data-label">{{ t('recovery.backupAge') }}</dt>
            <dd class="mt-1 font-mono text-sm">{{ formatAge(status.backupAgeSeconds) }}</dd>
          </div>
          <div>
            <dt class="data-label">{{ t('recovery.lastDrill') }}</dt>
            <dd class="mt-1 font-mono text-sm">{{ formatDateTime(status.lastDrillAt) }}</dd>
          </div>
          <div>
            <dt class="data-label">{{ t('recovery.openGaps') }}</dt>
            <dd class="mt-1 font-mono text-sm">{{ status.openGapCount }}</dd>
          </div>
        </dl>
      </section>

      <section class="panel p-6">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold">{{ t('recovery.evidence') }}</h2>
            <p class="mt-1 text-xs text-[var(--text-muted)]">{{ t('recovery.evidenceSubtitle') }}</p>
          </div>
          <span v-if="listLoading" class="text-xs text-[var(--text-muted)]">{{ t('common.loading') }}</span>
        </div>

        <div v-if="listError" class="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--danger)]">
          <span>{{ listError }}</span>
          <UButton class="button-secondary" variant="outline" @click="loadDrills(true)">{{ t('common.retry') }}</UButton>
        </div>
        <div v-if="detailError" class="mb-4 text-sm text-[var(--danger)]" role="alert">{{ detailError }}</div>

        <div v-if="drills.length" class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>{{ t('recovery.status') }}</th>
                <th>{{ t('recovery.started') }}</th>
                <th>{{ t('recovery.finished') }}</th>
                <th>{{ t('recovery.operator') }}</th>
                <th>{{ t('recovery.environment') }}</th>
                <th>{{ t('recovery.artifact') }}</th>
                <th>{{ t('recovery.failure') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in drills" :key="row.id">
                <td>
                  <span class="status-pill" :class="statusTone(row.status)">{{ tStatus(row.status) }}</span>
                </td>
                <td class="whitespace-nowrap text-xs">{{ formatDateTime(row.startedAt) }}</td>
                <td class="whitespace-nowrap text-xs">{{ formatDateTime(row.finishedAt) }}</td>
                <td class="text-xs">{{ row.operatorName }}</td>
                <td class="font-mono text-xs">{{ row.targetEnvironment }}</td>
                <td class="max-w-[18rem] truncate font-mono text-xs" :title="row.artifactRef">{{ row.artifactRef }}</td>
                <td class="font-mono text-xs text-[var(--danger)]">{{ row.failureCode || '—' }}</td>
                <td class="text-right">
                  <UButton
                    size="xs"
                    variant="ghost"
                    :loading="detailLoadingId === row.id"
                    @click="toggleDrill(row.id)"
                  >
                    {{ selected?.id === row.id ? t('recovery.hideDetail') : t('recovery.review') }}
                  </UButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else-if="!listLoading" class="text-sm text-[var(--text-muted)]">{{ t('recovery.empty') }}</p>

        <div v-if="nextCursor" class="mt-4 text-center">
          <UButton class="button-secondary" variant="outline" :loading="listLoading" @click="loadDrills(false)">
            {{ t('common.loadMore') }}
          </UButton>
        </div>
      </section>

      <section v-if="selected" class="panel mt-4 p-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="eyebrow">{{ t('recovery.drillDetail') }}</p>
            <h2 class="mt-2 font-mono text-sm font-semibold">{{ selected.id }}</h2>
            <p class="mt-1 text-xs text-[var(--text-muted)]">
              {{ selected.operatorName }} · {{ formatDateTime(selected.startedAt) }} → {{ formatDateTime(selected.finishedAt) }}
            </p>
          </div>
          <span class="status-pill" :class="statusTone(selected.status)">{{ tStatus(selected.status) }}</span>
        </div>

        <dl class="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <dt class="data-label">{{ t('recovery.environment') }}</dt>
            <dd class="mt-1 font-mono text-xs">{{ selected.targetEnvironment }}</dd>
          </div>
          <div>
            <dt class="data-label">{{ t('recovery.artifact') }}</dt>
            <dd class="mt-1 break-all font-mono text-xs">{{ selected.artifactRef }}</dd>
          </div>
          <div>
            <dt class="data-label">{{ t('recovery.manifest') }}</dt>
            <dd class="mt-1 break-all font-mono text-xs">{{ selected.manifestChecksum || '—' }}</dd>
          </div>
          <div>
            <dt class="data-label">{{ t('recovery.failure') }}</dt>
            <dd class="mt-1 font-mono text-xs text-[var(--danger)]">{{ selected.failureCode || '—' }}</dd>
          </div>
        </dl>

        <h3 class="mb-3 mt-6 text-sm font-semibold">{{ t('recovery.scopes') }}</h3>
        <div v-if="selected.scopes.length" class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>{{ t('recovery.scope') }}</th>
                <th>{{ t('recovery.expectedCount') }}</th>
                <th>{{ t('recovery.actualCount') }}</th>
                <th>{{ t('recovery.expectedTotal') }}</th>
                <th>{{ t('recovery.actualTotal') }}</th>
                <th>{{ t('recovery.status') }}</th>
                <th>{{ t('recovery.mismatch') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="scope in selected.scopes" :key="scope.scope">
                <td class="font-mono text-xs">{{ scope.scope }}</td>
                <td class="font-mono text-xs">{{ scope.expectedCount }}</td>
                <td class="font-mono text-xs">{{ scope.actualCount }}</td>
                <td class="font-mono text-xs">{{ scopeTotal(scope, scope.expectedTotalMinor) }}</td>
                <td class="font-mono text-xs">{{ scopeTotal(scope, scope.actualTotalMinor) }}</td>
                <td>
                  <span class="status-pill" :class="statusTone(scope.status)">{{ tStatus(scope.status) }}</span>
                </td>
                <td class="font-mono text-xs text-[var(--danger)]">{{ scope.mismatchCode || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="text-sm text-[var(--text-muted)]">{{ t('recovery.noScopes') }}</p>
      </section>
    </template>
  </div>
</template>
