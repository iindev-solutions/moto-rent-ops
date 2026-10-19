<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { t, tStatus, tDepositType, tObligationType } = useLocale()
const { data, error, refresh } = await useFetch<any>('/api/finance')

const obligationOpen = ref(false)
const receiptOpen = ref(false)
const depositOpen = ref(false)
const obligationType = ref('rent')
const obligationAmount = ref(0)
const obligationClient = ref('')
const receiptAmount = ref(0)
const receiptMethod = ref('cash')
const receiptClient = ref('')
const depositType = ref('cash')
const depositAmount = ref(0)
const depositClient = ref('')
const applyOpen = ref(false)
const applyDepositId = ref('')
const applyObligationId = ref('')
const pending = ref(false)
const actionError = ref('')

const obligations = computed(() => data.value?.obligations || [])
const receipts = computed(() => data.value?.receipts || [])
const deposits = computed(() => data.value?.deposits || [])

async function createObligation() {
  pending.value = true
  actionError.value = ''
  try {
    await $fetch('/api/obligations', { method: 'POST', body: { type: obligationType.value, amountMinor: obligationAmount.value, clientId: obligationClient.value || undefined } })
    obligationOpen.value = false
    obligationAmount.value = 0
    obligationClient.value = ''
    await refresh()
  } catch (error) { actionError.value = apiErrorMessage(error, t('common.error')) } finally { pending.value = false }
}

async function createReceipt() {
  pending.value = true
  actionError.value = ''
  try {
    await $fetch('/api/receipts', { method: 'POST', body: { amountMinor: receiptAmount.value, method: receiptMethod.value, clientId: receiptClient.value || undefined } })
    receiptOpen.value = false
    receiptAmount.value = 0
    receiptClient.value = ''
    await refresh()
  } catch (error) { actionError.value = apiErrorMessage(error, t('common.error')) } finally { pending.value = false }
}

async function createDeposit() {
  pending.value = true
  actionError.value = ''
  try {
    await $fetch('/api/deposits', { method: 'POST', body: { clientId: depositClient.value, type: depositType.value, amountMinor: depositType.value === 'cash' ? depositAmount.value : undefined } })
    depositOpen.value = false
    depositAmount.value = 0
    depositClient.value = ''
    await refresh()
  } catch (error) { actionError.value = apiErrorMessage(error, t('common.error')) } finally { pending.value = false }
}

function openObligationModal() {
  actionError.value = ''
  obligationOpen.value = true
}

function openReceiptModal() {
  actionError.value = ''
  receiptOpen.value = true
}

function openDepositModal() {
  actionError.value = ''
  depositOpen.value = true
}

function startApply(depositId: string) {
  actionError.value = ''
  applyDepositId.value = depositId
  applyObligationId.value = ''
  applyOpen.value = true
}

async function applyDeposit() {
  if (!applyObligationId.value.trim()) {
    actionError.value = t('common.error')
    return
  }
  pending.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/deposits/${applyDepositId.value}/apply`, { method: 'POST', body: { obligationId: applyObligationId.value.trim() } })
    applyOpen.value = false
    await refresh()
  } catch (error) { actionError.value = apiErrorMessage(error, t('common.error')) } finally { pending.value = false }
}

async function returnDeposit(depositId: string) {
  pending.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/deposits/${depositId}/return`, { method: 'POST', body: {} })
    await refresh()
  } catch (error) { actionError.value = apiErrorMessage(error, t('common.error')) } finally { pending.value = false }
}
</script>

<template>
  <div>
    <header class="page-header">
      <div>
        <p class="eyebrow">{{ t('nav.finance') }} / 04</p>
        <h1 class="page-title mt-2">{{ t('finance.title') }}</h1>
        <p class="page-subtitle">{{ t('finance.subtitle') }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton class="button-secondary" @click="openObligationModal">{{ t('finance.newObligation') }}</UButton>
        <UButton class="button-secondary" @click="openReceiptModal">{{ t('finance.newReceipt') }}</UButton>
        <UButton class="button-primary" @click="openDepositModal">{{ t('finance.newDeposit') }}</UButton>
      </div>
    </header>

    <section v-if="error" class="panel mb-4 border-[var(--danger)]/30 p-4 text-sm text-[var(--danger)]"><div class="flex flex-wrap items-center justify-between gap-3"><span>{{ t('common.loadError') }}</span><UButton class="button-secondary" variant="outline" @click="refresh()">{{ t('common.retry') }}</UButton></div></section>

    <p v-if="actionError && !obligationOpen && !receiptOpen && !depositOpen && !applyOpen" class="mb-4 text-sm text-[var(--danger)]" role="alert">{{ actionError }}</p>

    <section class="panel p-6">
      <p class="panel-title">{{ t('finance.obligations') }}</p>
      <div v-if="obligations.length" class="mt-4 overflow-x-auto">
        <table class="data-table">
          <thead><tr><th>{{ t('finance.type') }}</th><th>{{ t('finance.amount') }}</th><th>{{ t('finance.allocated') }}</th><th>{{ t('finance.balance') }}</th><th>{{ t('finance.status') }}</th></tr></thead>
          <tbody>
            <tr v-for="row in obligations" :key="row.id">
              <td>{{ tObligationType(row.type) }}</td>
              <td>{{ row.amountMinor }}</td>
              <td>{{ row.allocatedMinor }}</td>
              <td>{{ row.balanceMinor }}</td>
              <td><span class="status-pill">{{ tStatus(row.status) }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="mt-4 text-sm text-[var(--muted)]">{{ t('finance.noObligations') }}</p>
    </section>

    <section class="panel mt-6 p-6">
      <p class="panel-title">{{ t('finance.receipts') }}</p>
      <div v-if="receipts.length" class="mt-4 overflow-x-auto">
        <table class="data-table">
          <thead><tr><th>{{ t('finance.method') }}</th><th>{{ t('finance.amount') }}</th><th>{{ t('finance.receivedAt') }}</th></tr></thead>
          <tbody>
            <tr v-for="row in receipts" :key="row.id">
              <td>{{ row.method }}</td>
              <td>{{ row.amountMinor }}</td>
              <td>{{ formatDateTime(row.receivedAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="mt-4 text-sm text-[var(--muted)]">{{ t('finance.noReceipts') }}</p>
    </section>

    <section class="panel mt-6 p-6">
      <p class="panel-title">{{ t('finance.deposits') }}</p>
      <div v-if="deposits.length" class="mt-4 overflow-x-auto">
        <table class="data-table">
          <thead><tr><th>{{ t('finance.type') }}</th><th>{{ t('finance.amount') }}</th><th>{{ t('finance.remaining') }}</th><th>{{ t('finance.status') }}</th><th>{{ t('finance.receivedAt') }}</th><th></th></tr></thead>
          <tbody>
            <tr v-for="row in deposits" :key="row.id">
              <td>{{ tDepositType(row.type) }}</td>
              <td>{{ row.amountMinor ?? '—' }}</td>
              <td>{{ row.remainingMinor ?? '—' }}</td>
              <td><span class="status-pill">{{ tStatus(row.status) }}</span></td>
              <td>{{ formatDateTime(row.receivedAt) }}</td>
              <td class="text-right">
                <div v-if="row.status === 'held'" class="flex justify-end gap-2">
                  <UButton size="xs" variant="ghost" @click="startApply(row.id)">{{ t('finance.applyDeposit') }}</UButton>
                  <UButton size="xs" variant="ghost" :loading="pending" @click="returnDeposit(row.id)">{{ t('finance.returnDeposit') }}</UButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="mt-4 text-sm text-[var(--muted)]">{{ t('finance.noDeposits') }}</p>
    </section>

    <div v-if="obligationOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/60 p-4">
      <section class="surface w-full max-w-lg p-6">
        <p class="eyebrow">{{ t('finance.newObligation') }}</p>
        <div class="mt-4 space-y-3">
          <UInput v-model="obligationType" class="w-full" :placeholder="t('finance.type')" />
          <UInput v-model.number="obligationAmount" class="w-full" type="number" :placeholder="t('finance.amount')" />
          <UInput v-model="obligationClient" class="w-full" :placeholder="t('finance.clientId')" />
          <p v-if="actionError" class="text-sm text-[var(--danger)]" role="alert">{{ actionError }}</p>
          <div class="flex gap-2"><UButton class="button-primary" :loading="pending" @click="createObligation">{{ t('people.save') }}</UButton><UButton class="button-secondary" variant="ghost" @click="obligationOpen = false">{{ t('common.cancel') }}</UButton></div>
        </div>
      </section>
    </div>

    <div v-if="receiptOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/60 p-4">
      <section class="surface w-full max-w-lg p-6">
        <p class="eyebrow">{{ t('finance.newReceipt') }}</p>
        <div class="mt-4 space-y-3">
          <UInput v-model.number="receiptAmount" class="w-full" type="number" :placeholder="t('finance.amount')" />
          <UInput v-model="receiptMethod" class="w-full" :placeholder="t('finance.method')" />
          <UInput v-model="receiptClient" class="w-full" :placeholder="t('finance.clientId')" />
          <p v-if="actionError" class="text-sm text-[var(--danger)]" role="alert">{{ actionError }}</p>
          <div class="flex gap-2"><UButton class="button-primary" :loading="pending" @click="createReceipt">{{ t('people.save') }}</UButton><UButton class="button-secondary" variant="ghost" @click="receiptOpen = false">{{ t('common.cancel') }}</UButton></div>
        </div>
      </section>
    </div>

    <div v-if="applyOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/60 p-4">
      <section class="surface w-full max-w-lg p-6">
        <p class="eyebrow">{{ t('finance.applyDeposit') }}</p>
        <div class="mt-4 space-y-3">
          <UInput v-model="applyObligationId" class="w-full" :placeholder="t('finance.obligationId')" />
          <p v-if="actionError" class="text-sm text-[var(--danger)]" role="alert">{{ actionError }}</p>
          <div class="flex gap-2"><UButton class="button-primary" :loading="pending" @click="applyDeposit">{{ t('people.save') }}</UButton><UButton class="button-secondary" variant="ghost" @click="applyOpen = false">{{ t('common.cancel') }}</UButton></div>
        </div>
      </section>
    </div>

    <div v-if="depositOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/60 p-4">
      <section class="surface w-full max-w-lg p-6">
        <p class="eyebrow">{{ t('finance.newDeposit') }}</p>
        <div class="mt-4 space-y-3">
          <select v-model="depositType" class="brutal-input"><option value="cash">{{ t('deposit.cash') }}</option><option value="document_custody">{{ t('deposit.documentCustody') }}</option></select>
          <UInput v-model.number="depositAmount" class="w-full" type="number" :placeholder="t('finance.amount')" />
          <UInput v-model="depositClient" class="w-full" :placeholder="t('finance.clientId')" />
          <p v-if="actionError" class="text-sm text-[var(--danger)]" role="alert">{{ actionError }}</p>
          <div class="flex gap-2"><UButton class="button-primary" :loading="pending" @click="createDeposit">{{ t('people.save') }}</UButton><UButton class="button-secondary" variant="ghost" @click="depositOpen = false">{{ t('common.cancel') }}</UButton></div>
        </div>
      </section>
    </div>
  </div>
</template>
