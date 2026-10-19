<script setup lang="ts">
import type { BikeSummary, PeopleSearchItem, QuickRentalResult } from '@book-moto/contracts'
import { normalizeLocatorToken } from '@book-moto/domain/qr'
definePageMeta({ middleware: 'auth' })
const { t } = useLocale()
const { data: bikesData, refresh: refreshBikes } = await useFetch<{ bikes: BikeSummary[] }>('/api/bikes')

const bikeSearch = ref('')
const scannerOpen = ref(false)
const actionError = ref('')
const pending = ref(false)
const created = ref<QuickRentalResult | null>(null)
const photoFiles = ref<File[]>([])
const uploadedPhotoCount = ref(0)

const clientQuery = ref('')
const searchResults = ref<PeopleSearchItem[]>([])
const selectedClient = ref<PeopleSearchItem | null>(null)
const clientMode = ref<'search' | 'new'>('search')
const newClientName = ref('')
const newClientPhone = ref('')

const availableBikes = computed(() => (bikesData.value?.bikes || [])
  .filter(bike => bike.status === 'available')
  .sort((a, b) => a.assetCode.localeCompare(b.assetCode)))
const visibleBikes = computed(() => {
  const query = bikeSearch.value.trim().toLowerCase()
  if (!query) return availableBikes.value
  return availableBikes.value.filter(bike => [bike.assetCode, bike.model, bike.plate].some(value => value?.toLowerCase().includes(query)))
})
const selectedBike = ref<BikeSummary | null>(null)

const days = ref(3)
const dayPresets = [1, 2, 3, 7]
const rate = ref(150000)
const endDate = computed(() => new Date(Date.now() + days.value * 86400000))

const depositType = ref<'cash' | 'document_custody'>('cash')
const depositAmount = ref(2000000)
const passportMasked = ref('')

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(clientQuery, (value) => {
  if (searchTimer) clearTimeout(searchTimer)
  const term = value.trim()
  if (term.length < 2) {
    searchResults.value = []
    return
  }
  searchTimer = setTimeout(async () => {
    try {
      const result = await $fetch<{ people: PeopleSearchItem[] }>(`/api/people/search?q=${encodeURIComponent(term)}`)
      searchResults.value = result.people
    } catch {
      searchResults.value = []
    }
  }, 250)
})

function pickClient(person: PeopleSearchItem) {
  selectedClient.value = person
  clientMode.value = 'search'
  clientQuery.value = ''
  searchResults.value = []
}

function useNewClient() {
  clientMode.value = 'new'
  selectedClient.value = null
  searchResults.value = []
}

function resetClient() {
  selectedClient.value = null
  clientMode.value = 'search'
}

function pickBike(bike: BikeSummary) {
  selectedBike.value = bike
  actionError.value = ''
}

function onScan(value: string) {
  scannerOpen.value = false
  const token = normalizeLocatorToken(value)
  const found = token ? availableBikes.value.find(bike => bike.qrToken === token) : undefined
  if (found) {
    pickBike(found)
  } else {
    actionError.value = t('rent.scanNotFound')
  }
}

function onPhotos(event: Event) {
  const input = event.target as HTMLInputElement
  photoFiles.value = Array.from(input.files || [])
}

async function uploadAttachment(entityType: string, entityId: string, file: File) {
  await $fetch(`/api/attachments?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`, {
    method: 'POST',
    body: file,
    headers: { 'content-type': file.type || 'image/jpeg' },
  })
}

async function submit() {
  actionError.value = ''
  if (!selectedClient.value && !(clientMode.value === 'new' && newClientName.value.trim().length >= 2)) {
    actionError.value = t('rent.needClient')
    return
  }
  if (!selectedBike.value) {
    actionError.value = t('rent.needBike')
    return
  }
  if (!days.value || days.value < 1) {
    actionError.value = t('rent.needDays')
    return
  }
  if (depositType.value === 'cash' && (!depositAmount.value || depositAmount.value <= 0)) {
    actionError.value = t('rent.needDeposit')
    return
  }

  pending.value = true
  try {
    const result = await $fetch<{ rental: QuickRentalResult }>('/api/rentals/quick', {
      method: 'POST',
      body: {
        clientId: selectedClient.value?.id,
        newClient: selectedClient.value ? undefined : { displayName: newClientName.value.trim(), phone: newClientPhone.value.trim() || undefined },
        motorcycleId: selectedBike.value.id,
        days: days.value,
        dailyRateMinor: rate.value,
        depositType: depositType.value,
        depositAmountMinor: depositType.value === 'cash' ? depositAmount.value : undefined,
        passportMaskedNumber: depositType.value === 'document_custody' ? passportMasked.value.trim() || undefined : undefined,
      },
    })

    uploadedPhotoCount.value = 0
    if (photoFiles.value.length && result.rental.handoverId) {
      for (const file of photoFiles.value) {
        try {
          await uploadAttachment('handover', result.rental.handoverId, file)
          uploadedPhotoCount.value += 1
        } catch {
          actionError.value = t('photo.uploadFailed')
        }
      }
    }

    if (import.meta.client) {
      localStorage.setItem('moto.lastRate', String(rate.value))
    }
    created.value = result.rental
    await refreshBikes()
  } catch (error) {
    actionError.value = apiErrorMessage(error, t('common.error'))
  } finally {
    pending.value = false
  }
}

function resetAll() {
  created.value = null
  actionError.value = ''
  selectedClient.value = null
  clientMode.value = 'search'
  newClientName.value = ''
  newClientPhone.value = ''
  selectedBike.value = null
  days.value = 3
  depositType.value = 'cash'
  depositAmount.value = 2000000
  passportMasked.value = ''
  photoFiles.value = []
  uploadedPhotoCount.value = 0
}

onMounted(() => {
  if (import.meta.client) {
    const stored = Number(localStorage.getItem('moto.lastRate'))
    if (stored > 0) rate.value = stored
  }
})
</script>

<template>
  <div>
    <header class="page-header">
      <div>
        <p class="eyebrow">{{ t('nav.operations') }} / 09</p>
        <h1 class="page-title mt-2">{{ t('nav.rentOut') }}</h1>
        <p class="page-subtitle">{{ t('rent.subtitle') }}</p>
      </div>
    </header>

    <section v-if="created" class="panel mx-auto mt-6 max-w-2xl p-6 text-center">
      <UIcon name="i-lucide-circle-check" class="mx-auto size-12 text-[var(--success)]" />
      <h2 class="mt-3 text-2xl font-extrabold">{{ t('rent.created') }}</h2>
      <p class="mt-2 text-sm text-[var(--muted)]">{{ selectedBike?.assetCode }} · {{ selectedBike?.model }}</p>
      <p v-if="uploadedPhotoCount" class="mt-1 text-xs text-[var(--muted)]">{{ t('photo.add') }}: {{ uploadedPhotoCount }}</p>
      <div class="mt-5 flex flex-wrap justify-center gap-2">
        <UButton class="button-primary" :to="`/agreements/${created.agreementId}`">{{ t('rent.openAgreement') }}</UButton>
        <UButton class="button-secondary" :to="`/people/${created.clientId}`">{{ t('rent.openClient') }}</UButton>
        <UButton variant="ghost" icon="i-lucide-plus" @click="resetAll">{{ t('rent.again') }}</UButton>
      </div>
      <p v-if="actionError" class="mt-4 text-xs text-[var(--danger)]">{{ actionError }}</p>
    </section>

    <div v-else class="mt-6 grid gap-4 lg:grid-cols-2">
      <section class="panel p-6">
        <p class="panel-title">{{ t('rent.client') }}</p>
        <div v-if="selectedClient" class="mt-4 flex items-center justify-between gap-3 border border-[var(--line)] p-3">
          <div>
            <p class="font-semibold">{{ selectedClient.displayName }}</p>
            <p class="text-xs text-[var(--muted)]">{{ selectedClient.phone || '—' }}</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="status-pill">{{ t('rent.selected') }}</span>
            <UButton size="sm" variant="ghost" @click="resetClient">{{ t('rent.change') }}</UButton>
          </div>
        </div>
        <div v-else class="mt-4 space-y-3">
          <UInput v-model="clientQuery" class="w-full" :placeholder="t('rent.searchClient')" :aria-label="t('rent.searchClient')" />
          <div v-if="searchResults.length" class="space-y-1">
            <button
              v-for="person in searchResults"
              :key="person.id"
              type="button"
              class="flex w-full items-center justify-between border-b border-[var(--line)] py-2 text-left last:border-b-0 hover:text-[var(--accent)]"
              @click="pickClient(person)"
            >
              <span class="font-semibold">{{ person.displayName }}</span>
              <span class="font-mono text-xs text-[var(--muted)]">{{ person.phone || '—' }}</span>
            </button>
          </div>
          <p v-else-if="clientQuery.trim().length >= 2" class="text-xs text-[var(--muted)]">{{ t('rent.noMatch') }}</p>
          <UButton size="sm" variant="outline" icon="i-lucide-user-plus" @click="useNewClient">{{ t('rent.newClient') }}</UButton>
          <div v-if="clientMode === 'new'" class="grid gap-2">
            <UInput v-model="newClientName" class="w-full" :placeholder="t('rent.clientName')" :aria-label="t('rent.clientName')" />
            <UInput v-model="newClientPhone" class="w-full" :placeholder="t('rent.clientPhone')" :aria-label="t('rent.clientPhone')" />
          </div>
        </div>
      </section>

      <section class="panel p-6">
        <div class="flex items-center justify-between gap-2">
          <p class="panel-title">{{ t('rent.bike') }}</p>
          <UButton size="sm" variant="outline" icon="i-lucide-scan-line" @click="scannerOpen = true">{{ t('rent.scanQr') }}</UButton>
        </div>
        <UInput v-model="bikeSearch" class="mt-3 w-full" :placeholder="t('dashboard.search')" :aria-label="t('dashboard.search')" />
        <div v-if="visibleBikes.length" class="mt-3 grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
          <button
            v-for="bike in visibleBikes"
            :key="bike.id"
            type="button"
            class="border p-3 text-left"
            :class="selectedBike?.id === bike.id ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--line)] hover:border-[var(--line-strong)]'"
            @click="pickBike(bike)"
          >
            <p class="font-semibold">{{ bike.assetCode }}</p>
            <p class="text-xs text-[var(--muted)]">{{ bike.model }}</p>
            <p class="mt-1 font-mono text-[10px] text-[var(--muted)]">{{ bike.plate || '—' }}</p>
          </button>
        </div>
        <p v-else class="mt-3 text-sm text-[var(--muted)]">{{ t('rent.noBikes') }}</p>
      </section>

      <section class="panel p-6">
        <p class="panel-title">{{ t('rent.term') }}</p>
        <div class="mt-4 flex flex-wrap gap-2">
          <UButton
            v-for="preset in dayPresets"
            :key="preset"
            size="sm"
            :variant="days === preset ? 'solid' : 'outline'"
            @click="days = preset"
          >
            {{ preset }} {{ t('rent.days') }}
          </UButton>
          <UInput v-model.number="days" type="number" min="1" max="90" class="w-24" :aria-label="t('rent.days')" />
        </div>
        <p class="mt-3 text-xs text-[var(--muted)]">{{ formatDateTime(endDate.toISOString()) }}</p>
        <div class="mt-4 grid gap-1">
          <label class="text-xs text-[var(--muted)]" for="rent-rate">{{ t('rent.rate') }}</label>
          <UInput id="rent-rate" v-model.number="rate" type="number" min="0" step="10000" class="w-full" />
        </div>
      </section>

      <section class="panel p-6">
        <p class="panel-title">{{ t('rent.deposit') }}</p>
        <div class="mt-4 flex gap-2">
          <UButton
            size="sm"
            :variant="depositType === 'cash' ? 'solid' : 'outline'"
            icon="i-lucide-banknote"
            @click="depositType = 'cash'"
          >
            {{ t('deposit.cash') }}
          </UButton>
          <UButton
            size="sm"
            :variant="depositType === 'document_custody' ? 'solid' : 'outline'"
            icon="i-lucide-book-user"
            @click="depositType = 'document_custody'"
          >
            {{ t('rent.passport') }}
          </UButton>
        </div>
        <div v-if="depositType === 'cash'" class="mt-3 grid gap-1">
          <label class="text-xs text-[var(--muted)]" for="rent-deposit">{{ t('rent.depositAmount') }}</label>
          <UInput id="rent-deposit" v-model.number="depositAmount" type="number" min="0" step="100000" class="w-full" />
        </div>
        <div v-else class="mt-3 grid gap-1">
          <label class="text-xs text-[var(--muted)]" for="rent-passport">{{ t('rent.passportNumber') }}</label>
          <UInput id="rent-passport" v-model="passportMasked" class="w-full" />
        </div>
      </section>

      <section class="panel p-6 lg:col-span-2">
        <p class="panel-title">{{ t('rent.photos') }}</p>
        <p class="mt-1 text-xs text-[var(--muted)]">{{ t('rent.photosHint') }}</p>
        <input class="mt-3 block w-full text-xs" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple @change="onPhotos" />
        <p v-if="photoFiles.length" class="mt-2 text-xs text-[var(--muted)]">{{ t('photo.add') }}: {{ photoFiles.length }}</p>
      </section>
    </div>

    <div v-if="!created" class="mt-6">
      <p v-if="actionError" class="mb-3 text-sm text-[var(--danger)]" role="alert">{{ actionError }}</p>
      <UButton block size="lg" class="button-primary" :loading="pending" icon="i-lucide-key-round" @click="submit">
        {{ t('rent.submit') }}
      </UButton>
    </div>

    <BikeScanner v-if="scannerOpen" @close="scannerOpen = false" @found="onScan" />
  </div>
</template>
