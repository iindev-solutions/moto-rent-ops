<script setup lang="ts">
import type { ActiveRentalSummary, RentalItemSettlement } from '@book-moto/contracts'
definePageMeta({ middleware: 'auth' })
const route = useRoute()
const router = useRouter()
const { t, tObligationType, tStatus } = useLocale()
const { data: rentalsData, refresh: refreshRentals } = await useFetch<{ rentals: ActiveRentalSummary[] }>('/api/rentals/active')

const rentals = computed(() => rentalsData.value?.rentals || [])
const card = ref<ActiveRentalSummary | null>(null)
const settlement = ref<RentalItemSettlement | null>(null)
const pending = ref(false)
const actionError = ref('')
const odometer = ref<number | undefined>(undefined)
const damageAmount = ref(0)
const damageNotes = ref('')
const photoFiles = ref<File[]>([])
const uploadedPhotoCount = ref(0)

function dueLabel(date: string | null) {
  if (!date) return ''
  const daysLeft = calendarDaysUntil(date)
  if (daysLeft === null) return ''
  if (daysLeft > 0) return `${daysLeft} ${t('today.days')}`
  if (daysLeft === 0) return t('today.dueToday')
  return `${-daysLeft} ${t('today.daysOverdue')}`
}

async function loadSettlement(itemId: string) {
  try {
    const result = await $fetch<{ settlement: RentalItemSettlement }>(`/api/rentals/items/${itemId}/settlement`)
    settlement.value = result.settlement
  } catch (error) {
    actionError.value = apiErrorMessage(error, t('common.error'))
  }
}

async function pick(rental: ActiveRentalSummary) {
  card.value = rental
  actionError.value = ''
  uploadedPhotoCount.value = 0
  router.replace({ query: { item: rental.itemId } })
  await loadSettlement(rental.itemId)
}

async function refreshAll() {
  await refreshRentals()
  if (card.value) await loadSettlement(card.value.itemId)
}

async function extend(days: number) {
  if (!card.value) return
  pending.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/rentals/items/${card.value.itemId}/extend`, { method: 'POST', body: { days } })
    await refreshRentals()
    const fresh = rentals.value.find(rental => rental.itemId === card.value?.itemId)
    if (fresh) card.value = fresh
  } catch (error) {
    actionError.value = apiErrorMessage(error, t('common.error'))
  } finally {
    pending.value = false
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

async function submitReturn() {
  if (!card.value) return
  pending.value = true
  actionError.value = ''
  try {
    const result = await $fetch<{ returned: boolean, inspectionId: string | null }>(`/api/rentals/items/${card.value.itemId}/return`, {
      method: 'POST',
      body: {
        odometer: odometer.value,
        damageAmountMinor: damageAmount.value,
        damageNotes: damageNotes.value.trim() || undefined,
      },
    })
    uploadedPhotoCount.value = 0
    if (photoFiles.value.length && result.inspectionId) {
      for (const file of photoFiles.value) {
        try {
          await uploadAttachment('return_inspection', result.inspectionId, file)
          uploadedPhotoCount.value += 1
        } catch {
          actionError.value = t('photo.uploadFailed')
        }
      }
    }
    photoFiles.value = []
    await refreshAll()
  } catch (error) {
    actionError.value = apiErrorMessage(error, t('common.error'))
  } finally {
    pending.value = false
  }
}

async function payCash() {
  if (!card.value || !settlement.value) return
  const open = settlement.value.obligations.filter(obligation => obligation.dueMinor > 0)
  if (!open.length) return
  const total = open.reduce((sum, obligation) => sum + obligation.dueMinor, 0)
  pending.value = true
  actionError.value = ''
  try {
    await $fetch('/api/receipts', {
      method: 'POST',
      body: {
        clientId: settlement.value.clientId,
        amountMinor: total,
        currency: settlement.value.currency,
        method: 'cash',
        allocations: open.map(obligation => ({ obligationId: obligation.id, amountMinor: obligation.dueMinor })),
      },
    })
    await refreshAll()
  } catch (error) {
    actionError.value = apiErrorMessage(error, t('common.error'))
  } finally {
    pending.value = false
  }
}

async function applyDeposit() {
  if (!card.value || !settlement.value?.deposit) return
  const open = settlement.value.obligations.filter(obligation => obligation.dueMinor > 0)
  pending.value = true
  actionError.value = ''
  try {
    for (const obligation of open) {
      await $fetch(`/api/deposits/${settlement.value.deposit.id}/apply`, { method: 'POST', body: { obligationId: obligation.id } })
    }
    await refreshAll()
  } catch (error) {
    actionError.value = apiErrorMessage(error, t('common.error'))
  } finally {
    pending.value = false
  }
}

async function returnDeposit() {
  if (!settlement.value?.deposit) return
  pending.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/deposits/${settlement.value.deposit.id}/return`, { method: 'POST' })
    await refreshAll()
  } catch (error) {
    actionError.value = apiErrorMessage(error, t('common.error'))
  } finally {
    pending.value = false
  }
}

async function returnDocument() {
  if (!settlement.value?.document) return
  pending.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/documents/${settlement.value.document.id}/return`, { method: 'POST' })
    await refreshAll()
  } catch (error) {
    actionError.value = apiErrorMessage(error, t('common.error'))
  } finally {
    pending.value = false
  }
}

async function closeAgreement() {
  if (!settlement.value) return
  pending.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/agreements/${settlement.value.agreementId}/close`, { method: 'POST', body: { reason: 'Returned and settled' } })
    await refreshAll()
  } catch (error) {
    actionError.value = apiErrorMessage(error, t('common.error'))
  } finally {
    pending.value = false
  }
}

function backToList() {
  card.value = null
  settlement.value = null
  actionError.value = ''
  router.replace({ query: {} })
  refreshRentals()
}

onMounted(() => {
  const queryItem = route.query.item
  if (typeof queryItem === 'string') {
    const found = rentals.value.find(rental => rental.itemId === queryItem)
    if (found) pick(found)
  }
})
</script>

<template>
  <div>
    <header class="page-header">
      <div>
        <p class="eyebrow">{{ t('nav.operations') }} / 10</p>
        <h1 class="page-title mt-2">{{ t('nav.returnBike') }}</h1>
        <p class="page-subtitle">{{ t('ret.subtitle') }}</p>
      </div>
      <UButton v-if="card" class="button-secondary" variant="ghost" icon="i-lucide-arrow-left" @click="backToList">{{ t('ret.back') }}</UButton>
    </header>

    <section v-if="!card" class="panel mt-6 p-6">
      <p class="panel-title">{{ t('ret.pick') }}</p>
      <div v-if="rentals.length" class="mt-4 space-y-2">
        <button
          v-for="rental in rentals"
          :key="rental.itemId"
          type="button"
          class="flex w-full flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] py-3 text-left last:border-b-0 hover:text-[var(--accent)]"
          @click="pick(rental)"
        >
          <span>
            <span class="font-semibold">{{ rental.assetCode }} · {{ rental.model }}</span>
            <span class="block text-xs text-[var(--muted)]">{{ rental.clientName }}</span>
          </span>
          <span class="text-right">
            <span class="status-pill">{{ formatDateTime(rental.endDate) }}</span>
            <span class="block text-xs text-[var(--muted)]">{{ dueLabel(rental.endDate) }}</span>
          </span>
        </button>
      </div>
      <p v-else class="mt-4 text-sm text-[var(--muted)]">{{ t('ret.noActive') }}</p>
    </section>

    <div v-else class="mt-6 grid gap-4 lg:grid-cols-2">
      <section class="panel p-6">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="panel-title">{{ card.assetCode }} · {{ card.model }}</p>
            <p class="mt-1 text-sm text-[var(--muted)]">{{ card.clientName }} · {{ card.plate || '—' }}</p>
            <p class="mt-1 text-xs text-[var(--muted)]">{{ formatDateTime(card.startDate) }} → {{ formatDateTime(card.endDate) }} · {{ dueLabel(card.endDate) }}</p>
            <p class="mt-1 text-xs text-[var(--muted)]">{{ formatMoney(card.dailyRateMinor, card.currency) }} / {{ t('rent.days') }}</p>
          </div>
          <span class="status-pill">{{ settlement ? tStatus(settlement.itemStatus) : '—' }}</span>
        </div>

        <div v-if="settlement?.itemStatus === 'active'" class="mt-4 flex flex-wrap gap-2">
          <UButton size="sm" variant="outline" :loading="pending" icon="i-lucide-calendar-plus" @click="extend(1)">{{ t('ret.plus1') }}</UButton>
          <UButton size="sm" variant="outline" :loading="pending" icon="i-lucide-calendar-plus" @click="extend(3)">{{ t('ret.plus3') }}</UButton>
        </div>

        <div v-if="settlement?.itemStatus === 'active'" class="mt-5 border-t border-[var(--line)] pt-5">
          <p class="panel-title">{{ t('ret.returnSection') }}</p>
          <div class="mt-3 grid gap-3">
            <div class="grid gap-1">
              <label class="text-xs text-[var(--muted)]" for="ret-odometer">{{ t('ret.odometer') }}</label>
              <UInput id="ret-odometer" v-model.number="odometer" type="number" min="0" class="w-full" />
            </div>
            <div class="grid gap-1">
              <label class="text-xs text-[var(--muted)]" for="ret-damage">{{ t('ret.damage') }}</label>
              <UInput id="ret-damage" v-model.number="damageAmount" type="number" min="0" step="50000" class="w-full" />
            </div>
            <div class="grid gap-1">
              <label class="text-xs text-[var(--muted)]" for="ret-damage-notes">{{ t('ret.damageNotes') }}</label>
              <UInput id="ret-damage-notes" v-model="damageNotes" class="w-full" />
            </div>
            <div class="grid gap-1">
              <label class="text-xs text-[var(--muted)]" for="ret-photos">{{ t('ret.photos') }}</label>
              <input id="ret-photos" class="block w-full text-xs" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple @change="onPhotos" />
            </div>
            <UButton class="button-primary" :loading="pending" icon="i-lucide-undo-2" @click="submitReturn">{{ t('ret.returnSubmit') }}</UButton>
          </div>
        </div>
      </section>

      <section class="panel p-6">
        <div class="flex items-center justify-between gap-2">
          <p class="panel-title">{{ t('ret.money') }}</p>
          <span v-if="settlement?.agreementStatus === 'closed'" class="status-pill">{{ t('ret.closed') }}</span>
          <span v-else-if="settlement?.itemStatus === 'returned'" class="status-pill">{{ t('ret.returnedAt') }}</span>
        </div>

        <div v-if="settlement" class="mt-4 space-y-2">
          <div v-for="obligation in settlement.obligations" :key="obligation.id" class="flex items-center justify-between border-b border-[var(--line)] py-2 text-sm last:border-b-0">
            <span>{{ tObligationType(obligation.type) }}</span>
            <span class="text-right">
              <span class="font-semibold">{{ formatMoney(obligation.dueMinor, settlement.currency) }}</span>
              <span v-if="obligation.dueMinor !== obligation.amountMinor" class="block text-[10px] text-[var(--muted)]">{{ formatMoney(obligation.amountMinor, settlement.currency) }}</span>
            </span>
          </div>
          <div class="flex items-center justify-between pt-2">
            <span class="font-semibold">{{ t('ret.totalDue') }}</span>
            <span class="font-extrabold">{{ formatMoney(settlement.totalDueMinor, settlement.currency) }}</span>
          </div>

          <div v-if="settlement.deposit" class="mt-3 flex items-center justify-between border border-[var(--line)] p-3 text-sm">
            <span>{{ settlement.deposit.type === 'cash' ? t('ret.depositCash') : t('rent.passport') }}</span>
            <span class="font-semibold">{{ formatMoney(settlement.deposit.remainingMinor, settlement.currency) }} · {{ tStatus(settlement.deposit.status) }}</span>
          </div>
          <div v-if="settlement.document" class="mt-2 flex items-center justify-between border border-[var(--line)] p-3 text-sm">
            <span>{{ settlement.document.documentType }} · {{ t('ret.passportHeld') }}</span>
            <span class="font-semibold">{{ tStatus(settlement.document.status) }}</span>
          </div>

          <div v-if="settlement.itemStatus === 'returned'" class="mt-4 grid gap-2">
            <div v-if="settlement.totalDueMinor > 0" class="flex flex-wrap gap-2">
              <UButton class="button-primary" size="sm" :loading="pending" icon="i-lucide-banknote" @click="payCash">{{ t('ret.paidCash') }}</UButton>
              <UButton
                v-if="settlement.deposit && settlement.deposit.type === 'cash' && settlement.deposit.remainingMinor > 0"
                class="button-secondary"
                size="sm"
                :loading="pending"
                icon="i-lucide-minus-circle"
                @click="applyDeposit"
              >
                {{ t('ret.fromDeposit') }}
              </UButton>
            </div>
            <UButton
              v-if="settlement.deposit && settlement.deposit.type === 'cash' && settlement.deposit.status !== 'returned' && settlement.deposit.remainingMinor > 0"
              class="button-secondary"
              size="sm"
              :loading="pending"
              icon="i-lucide-hand-coins"
              @click="returnDeposit"
            >
              {{ t('ret.returnDeposit') }}
            </UButton>
            <UButton
              v-if="settlement.document && settlement.document.status === 'held'"
              class="button-secondary"
              size="sm"
              :loading="pending"
              icon="i-lucide-book-check"
              @click="returnDocument"
            >
              {{ t('ret.givePassport') }}
            </UButton>
            <UButton
              v-if="settlement.agreementStatus === 'returned'"
              class="button-secondary"
              size="sm"
              :loading="pending"
              icon="i-lucide-check-check"
              @click="closeAgreement"
            >
              {{ t('ret.close') }}
            </UButton>
          </div>

          <div v-if="settlement.agreementStatus === 'closed'" class="mt-4">
            <UButton class="button-primary" size="sm" icon="i-lucide-check" @click="backToList">{{ t('ret.done') }}</UButton>
          </div>
        </div>
        <p v-else class="mt-4 text-sm text-[var(--muted)]">{{ t('common.loading') }}</p>
      </section>

      <p v-if="actionError" class="text-sm text-[var(--danger)] lg:col-span-2" role="alert">{{ actionError }}</p>
    </div>
  </div>
</template>
