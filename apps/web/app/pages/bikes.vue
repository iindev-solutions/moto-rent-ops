<script setup lang="ts">
import type { BikeSummary, BikesResponse } from '@book-moto/contracts'
import { normalizeLocatorToken } from '@book-moto/domain/qr'

definePageMeta({ middleware: 'auth' })

const router = useRouter()
const { t } = useLocale()
const search = ref('')
const manualCode = ref('')
const scannerOpen = ref(false)
const reissuing = ref(false)
const reissueId = ref('')
const lookupError = ref('')
const actionError = ref('')
const { data, error, status, refresh } = await useFetch<BikesResponse>('/api/bikes')

const bikes = computed(() => {
  const query = search.value.trim().toLowerCase()
  const rows = data.value?.bikes || []
  if (!query) return rows
  return rows.filter(bike => [bike.assetCode, bike.model, bike.plate, bike.location].some(value => value?.toLowerCase().includes(query)))
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

function statusLabel(statusValue: string) {
  const key = statusKeys[statusValue as keyof typeof statusKeys]
  return key ? t(key) : t('common.unknown')
}

function openManualLookup() {
  const token = normalizeLocatorToken(manualCode.value)
  if (token) {
    lookupError.value = ''
    router.push(`/b/${token}`)
  } else {
    lookupError.value = t('home.invalidCode')
  }
}

async function reissueQr(bikeId: string) {
  reissuing.value = true
  reissueId.value = bikeId
  actionError.value = ''
  try {
    const response = await $fetch<{ qrToken: string }>(`/api/motorcycles/${bikeId}/qr/reissue`, { method: 'POST', body: { reason: 'QR label reissued from fleet' } })
    await router.push(`/b/${response.qrToken}`)
  } catch (error) {
    actionError.value = apiErrorMessage(error, t('common.error'))
  } finally {
    reissuing.value = false
    reissueId.value = ''
  }
}

function onScan(value: string) {
  const token = normalizeLocatorToken(value)
  if (token) {
    scannerOpen.value = false
    router.push(`/b/${token}`)
  } else {
    scannerOpen.value = false
    lookupError.value = t('home.invalidQr')
  }
}
</script>

<template>
  <div>
    <header class="page-header">
      <div>
        <p class="eyebrow">{{ t('nav.workspace') }} / 02</p>
        <h1 class="page-title mt-2">{{ t('fleet.title') }}</h1>
        <p class="page-subtitle">{{ t('fleet.subtitle') }}</p>
      </div>
      <UButton class="button-primary" icon="i-lucide-scan-line" @click="scannerOpen = true">{{ t('home.scan') }}</UButton>
    </header>

    <p v-if="actionError" class="mb-4 text-sm text-[var(--danger)]" role="alert">{{ actionError }}</p>

    <section class="panel overflow-hidden">
      <div class="panel-header">
        <div><p class="panel-title">{{ t('fleet.title') }}</p><p class="mt-1 text-xs text-[var(--text-muted)]">{{ bikes.length }} {{ t('home.fleet').toLowerCase() }}</p></div>
        <UInput v-model="search" class="w-full max-w-64" :placeholder="t('fleet.search')" :aria-label="t('fleet.search')" />
      </div>
      <div v-if="status === 'pending'" class="space-y-3 p-6"><USkeleton class="h-10 w-full" /><USkeleton class="h-10 w-full" /><USkeleton class="h-10 w-full" /></div>
      <div v-else-if="error" class="p-6">
        <div class="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/5 p-4 text-sm text-[var(--danger)]"><p>{{ t('common.error') }}</p><UButton class="mt-3" variant="outline" @click="refresh()">{{ t('common.retry') }}</UButton></div>
      </div>
      <div v-else-if="bikes.length" class="overflow-x-auto">
        <table class="data-table">
          <thead><tr><th>{{ t('fleet.asset') }}</th><th>{{ t('bike.status') }}</th><th>{{ t('bike.location') }}</th><th>{{ t('bike.nextAction') }}</th><th><span class="sr-only">{{ t('common.actions') }}</span></th></tr></thead>
          <tbody>
            <tr v-for="bike in bikes" :key="bike.id">
              <td><div class="font-semibold"><NuxtLink v-if="bike.qrToken" :to="`/b/${bike.qrToken}`" class="hover:text-[var(--accent)]">{{ bike.assetCode }} · {{ bike.model }}</NuxtLink><span v-else>{{ bike.assetCode }} · {{ bike.model }}</span></div><div class="mt-1 font-mono text-[10px] text-[var(--text-muted)]">{{ bike.plate || '—' }}</div></td>
              <td><span class="status-pill">{{ statusLabel(bike.status) }}</span></td>
              <td>{{ bike.location || '—' }}</td>
              <td>{{ bike.nextAction || '—' }}</td>
              <td class="text-right"><div class="flex justify-end gap-2"><UButton v-if="bike.qrToken" :to="`/b/${bike.qrToken}`" variant="ghost" size="sm" trailing-icon="i-lucide-arrow-up-right">{{ t('fleet.open') }}</UButton><UButton v-else variant="outline" size="sm" :loading="reissuing && reissueId === bike.id" @click="reissueQr(bike.id)">{{ t('fleet.reissue') }}</UButton></div></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="empty-state p-8"><div><UIcon name="i-lucide-bike" class="mx-auto size-8 text-[var(--text-muted)]" /><p class="mt-3">{{ t('fleet.empty') }}</p><p class="mt-1 text-xs">{{ t('fleet.scan') }}</p></div></div>
    </section>

    <section class="panel mt-4">
      <div class="panel-header"><p class="panel-title">{{ t('home.lookup') }}</p><UIcon name="i-lucide-key-round" class="size-4 text-[var(--text-muted)]" /></div>
      <div class="panel-body grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><UInput v-model="manualCode" class="w-full" :placeholder="t('home.placeholder')" :aria-label="t('home.lookup')" @keyup.enter="openManualLookup" /><UButton class="button-secondary" @click="openManualLookup">{{ t('home.open') }}</UButton></div>
      <p v-if="lookupError" class="px-6 pb-4 text-sm text-[var(--danger)]" role="alert">{{ lookupError }}</p>
    </section>

    <BikeScanner v-if="scannerOpen" @close="scannerOpen = false" @found="onScan" />
  </div>
</template>
