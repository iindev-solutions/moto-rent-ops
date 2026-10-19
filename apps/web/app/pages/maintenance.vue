<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { t, tStatus, tMaintenanceType } = useLocale()
const { data, error, refresh } = await useFetch<any>('/api/maintenance')

const open = ref(false)
const motorcycleId = ref('')
const type = ref('service')
const status = ref('planned')
const dueDate = ref('')
const costMinor = ref(0)
const currency = ref('VND')
const notes = ref('')
const pending = ref(false)
const pendingId = ref('')
const actionError = ref('')

const orders = computed(() => data.value?.orders || [])

function openForm() {
  actionError.value = ''
  open.value = true
}

async function createOrder() {
  const dueIso = dueDate.value ? localInputToIso(dueDate.value) : null
  if (dueDate.value && !dueIso) {
    actionError.value = t('common.error')
    return
  }
  pending.value = true
  actionError.value = ''
  try {
    await $fetch('/api/maintenance', { method: 'POST', body: { motorcycleId: motorcycleId.value, type: type.value, status: status.value, dueDate: dueIso || undefined, costMinor: costMinor.value, currency: currency.value, notes: notes.value || undefined } })
    open.value = false
    motorcycleId.value = ''
    notes.value = ''
    dueDate.value = ''
    costMinor.value = 0
    await refresh()
  } catch (error) { actionError.value = apiErrorMessage(error, t('common.error')) } finally { pending.value = false }
}

async function setStatus(id: string, next: string) {
  pending.value = true
  pendingId.value = id
  actionError.value = ''
  try {
    await $fetch(`/api/maintenance/${id}/status`, { method: 'POST', body: { status: next } })
    await refresh()
  } catch (error) { actionError.value = apiErrorMessage(error, t('common.error')) } finally { pending.value = false; pendingId.value = '' }
}
</script>

<template>
  <div>
    <header class="page-header">
      <div>
        <p class="eyebrow">{{ t('nav.operations') }} / 06</p>
        <h1 class="page-title mt-2">{{ t('maintenance.title') }}</h1>
        <p class="page-subtitle">{{ t('maintenance.subtitle') }}</p>
      </div>
      <UButton class="button-primary" @click="openForm">{{ t('maintenance.new') }}</UButton>
    </header>

    <p v-if="actionError" class="mb-4 text-sm text-[var(--danger)]" role="alert">{{ actionError }}</p>

    <section v-if="error" class="panel mb-4 border-[var(--danger)]/30 p-4 text-sm text-[var(--danger)]"><div class="flex flex-wrap items-center justify-between gap-3"><span>{{ t('common.loadError') }}</span><UButton class="button-secondary" variant="outline" @click="refresh()">{{ t('common.retry') }}</UButton></div></section>

    <section v-if="open" class="panel mb-6 p-6">
      <div class="grid gap-3 sm:grid-cols-2">
        <UInput v-model="motorcycleId" class="w-full" :placeholder="t('maintenance.motorcycleId')" />
        <UInput v-model="type" class="w-full" :placeholder="t('maintenance.type')" />
        <select v-model="status" class="brutal-input">
          <option value="planned">{{ tStatus('planned') }}</option>
          <option value="due">{{ tStatus('due') }}</option>
          <option value="in_progress">{{ tStatus('in_progress') }}</option>
          <option value="completed">{{ tStatus('completed') }}</option>
          <option value="cancelled">{{ tStatus('cancelled') }}</option>
        </select>
        <UInput v-model="dueDate" class="w-full" type="datetime-local" />
        <UInput v-model.number="costMinor" class="w-full" type="number" :placeholder="t('maintenance.cost')" />
        <UInput v-model="currency" class="w-full" :placeholder="t('common.currency')" />
        <UInput v-model="notes" class="w-full" :placeholder="t('common.notes')" />
      </div>
      <div class="mt-4 flex gap-2">
        <UButton class="button-primary" :loading="pending" @click="createOrder">{{ t('common.create') }}</UButton>
        <UButton class="button-secondary" variant="ghost" @click="open = false">{{ t('common.cancel') }}</UButton>
      </div>
    </section>

    <section class="panel p-6">
      <div v-if="orders.length" class="overflow-x-auto">
        <table class="data-table">
          <thead><tr><th>{{ t('maintenance.type') }}</th><th>{{ t('finance.status') }}</th><th>{{ t('maintenance.due') }}</th><th>{{ t('maintenance.motorcycle') }}</th><th>{{ t('maintenance.cost') }}</th><th></th></tr></thead>
          <tbody>
            <tr v-for="row in orders" :key="row.id">
              <td>{{ tMaintenanceType(row.type) }}</td>
              <td><span class="status-pill">{{ tStatus(row.status) }}</span></td>
              <td>{{ row.dueDate ? formatDateTime(row.dueDate) : '—' }}</td>
              <td>{{ row.assetCode || '—' }}</td>
              <td>{{ row.costMinor }} {{ row.currency }}</td>
              <td class="text-right">
                <div class="flex justify-end gap-2">
                  <UButton size="xs" variant="ghost" :loading="pendingId === row.id && pending" @click="setStatus(row.id, 'in_progress')">{{ t('maintenance.start') }}</UButton>
                  <UButton size="xs" variant="ghost" :loading="pendingId === row.id && pending" @click="setStatus(row.id, 'completed')">{{ t('maintenance.complete') }}</UButton>
                  <UButton size="xs" variant="ghost" :loading="pendingId === row.id && pending" @click="setStatus(row.id, 'cancelled')">{{ t('maintenance.cancelOrder') }}</UButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="text-sm text-[var(--muted)]">{{ t('maintenance.empty') }}</p>
    </section>
  </div>
</template>