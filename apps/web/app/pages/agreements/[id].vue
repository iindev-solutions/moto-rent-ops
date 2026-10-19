<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const { t, tStatus } = useLocale()
const id = computed(() => String(route.params.id))
const { data, error, refresh } = await useFetch<any>(() => `/api/agreements/${id.value}`)
const { data: bikesData } = await useFetch<{ bikes: any[] }>('/api/bikes')

const itemOpen = ref(false)
const selectedBike = ref('')
const itemStart = ref(toLocalInputValue(new Date()))
const itemEnd = ref(toLocalInputValue(new Date(Date.now() + 7 * 86400000)))
const dailyRate = ref(0)
const pending = ref(false)
const actionError = ref('')
const cancelOpen = ref(false)
const cancelReason = ref('')
const returnOpen = ref(false)
const returnItemId = ref('')
const returnOdometer = ref(0)
const returnDamageNotes = ref('')
const returnDamageAmount = ref(0)
const returnPhotoFile = ref<File | null>(null)

const agreement = computed(() => data.value?.agreement)
const items = computed(() => data.value?.items || [])
const blockers = computed(() => data.value?.blockers || [])

async function addItem() {
  const startIso = localInputToIso(itemStart.value)
  const endIso = localInputToIso(itemEnd.value)
  if (!selectedBike.value || !startIso || !endIso || new Date(endIso) <= new Date(startIso)) {
    actionError.value = t('common.error')
    return
  }
  pending.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/agreements/${id.value}/items`, {
      method: 'POST',
      body: {
        motorcycleId: selectedBike.value,
        startDate: startIso,
        endDate: endIso,
        dailyRateMinor: dailyRate.value,
      },
    })
    itemOpen.value = false
    selectedBike.value = ''
    dailyRate.value = 0
    await refresh()
  } catch (error) { actionError.value = apiErrorMessage(error, t('common.error')) } finally { pending.value = false }
}

function openItemForm() {
  actionError.value = ''
  itemOpen.value = true
}

async function startReturn(itemId: string) {
  actionError.value = ''
  returnItemId.value = itemId
  returnOdometer.value = 0
  returnDamageNotes.value = ''
  returnDamageAmount.value = 0
  returnPhotoFile.value = null
  returnOpen.value = true
}

function onReturnPhoto(event: Event) {
  const input = event.target as HTMLInputElement
  returnPhotoFile.value = input.files?.[0] ?? null
}

async function uploadAttachment(entityType: string, entityId: string, file: File) {
  await $fetch(`/api/attachments?entityType=${encoder(entityType)}&entityId=${encoder(entityId)}`, {
    method: 'POST',
    body: file,
    headers: { 'content-type': file.type || 'image/jpeg' },
  })
}

function encoder(value: string) {
  return encodeURIComponent(value)
}

async function submitReturn() {
  pending.value = true
  actionError.value = ''
  const photo = returnPhotoFile.value
  try {
    const result = await $fetch<{ returned: boolean, inspectionId: string | null }>(`/api/rentals/items/${returnItemId.value}/return`, { method: 'POST', body: { odometer: returnOdometer.value, damageNotes: returnDamageNotes.value || undefined, damageAmountMinor: returnDamageAmount.value } })
    if (photo && result.inspectionId) {
      try {
        await uploadAttachment('return_inspection', result.inspectionId, photo)
      } catch {
        actionError.value = t('photo.uploadFailed')
      }
    }
    returnOpen.value = false
    await refresh()
  } catch (error) { actionError.value = apiErrorMessage(error, t('common.error')) } finally { pending.value = false }
}

async function closeAgreement() {
  pending.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/agreements/${id.value}/close`, { method: 'POST', body: { reason: 'Agreement closed after return' } })
    await refresh()
  } catch (error) { actionError.value = apiErrorMessage(error, t('common.error')) } finally { pending.value = false }
}

function openCancel() {
  actionError.value = ''
  cancelReason.value = ''
  cancelOpen.value = true
}

async function cancelAgreement() {
  if (cancelReason.value.trim().length < 3) { actionError.value = t('common.error'); return }
  pending.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/agreements/${id.value}/cancel`, { method: 'POST', body: { reason: cancelReason.value } })
    cancelOpen.value = false
    await refresh()
  } catch (error) { actionError.value = apiErrorMessage(error, t('common.error')) } finally { pending.value = false }
}

async function markReady() {
  pending.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/agreements/${id.value}/ready`, { method: 'POST' })
    await refresh()
  } catch (error) { actionError.value = apiErrorMessage(error, t('common.error')) } finally { pending.value = false }
}

async function handover(itemId: string) {
  pending.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/rentals/items/${itemId}/handover`, { method: 'POST', body: {} })
    await refresh()
  } catch (error) { actionError.value = apiErrorMessage(error, t('common.error')) } finally { pending.value = false }
}
</script>

<template>
  <div>
    <header class="page-header">
      <div>
        <p class="eyebrow">{{ t('agreement.eyebrow') }}</p>
        <h1 class="page-title mt-2">{{ data?.client?.displayName || agreement?.id?.slice(0, 8) || t('common.loading') }}</h1>
        <p class="page-subtitle">{{ tStatus(agreement?.status) }} · #{{ agreement?.id?.slice(0, 8) }}</p>
      </div>
      <UButton class="button-secondary" to="/people" variant="ghost">{{ t('common.back') }}</UButton>
    </header>

    <p v-if="actionError" class="mb-4 text-sm text-[var(--danger)]" role="alert">{{ actionError }}</p>

    <section v-if="error" class="panel p-6">
      <p class="text-sm text-[var(--danger)]">{{ t('common.loadError') }}</p>
      <UButton class="button-secondary mt-3" size="sm" @click="refresh()">{{ t('common.retry') }}</UButton>
    </section>

    <template v-else>
    <section class="panel p-6">
      <div class="flex items-center justify-between">
        <p class="panel-title">{{ t('people.items') }}</p>
        <UButton v-if="agreement?.status === 'draft'" size="sm" icon="i-lucide-plus" @click="openItemForm">{{ t('people.addItem') }}</UButton>
      </div>
      <div v-if="items.length" class="mt-4 space-y-3">
        <div v-for="item in items" :key="item.id" class="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] py-3 last:border-b-0">
          <div>
            <p class="font-semibold">{{ item.assetCode }} · {{ item.model }}</p>
            <p class="text-xs text-[var(--muted)]">{{ formatDateTime(item.startDate) }} → {{ formatDateTime(item.endDate) }} · {{ item.dailyRateMinor }} {{ item.currency }}</p>
            <div v-if="item.attachments?.length" class="mt-2 flex gap-2">
              <a v-for="attachment in item.attachments" :key="attachment.id" :href="`/api/attachments/${attachment.id}`" target="_blank" rel="noopener">
                <img :src="`/api/attachments/${attachment.id}`" :alt="t('photo.add')" class="size-12 rounded border border-[var(--line)] object-cover" />
              </a>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="status-pill">{{ tStatus(item.status) }}</span>
            <UButton v-if="['ready','active'].includes(agreement?.status) && item.status === 'planned'" size="sm" @click="handover(item.id)" :loading="pending">{{ t('people.handover') }}</UButton>
            <UButton v-if="agreement?.status === 'active' && item.status === 'active'" size="sm" @click="startReturn(item.id)" :loading="pending">{{ t('people.return') }}</UButton>
          </div>
        </div>
      </div>
      <p v-else class="mt-4 text-sm text-[var(--muted)]">{{ t('people.noItems') }}</p>
      <div v-if="itemOpen" class="mt-4 grid gap-2 sm:grid-cols-2">
        <select v-model="selectedBike" class="brutal-input sm:col-span-2">
          <option value="">{{ t('people.selectBike') }}</option>
          <option v-for="bike in (bikesData?.bikes || []).filter(b => b.status === 'available')" :key="bike.id" :value="bike.id">{{ bike.assetCode }} · {{ bike.model }}</option>
        </select>
        <UInput v-model="itemStart" class="w-full" type="datetime-local" />
        <UInput v-model="itemEnd" class="w-full" type="datetime-local" />
        <UInput v-model.number="dailyRate" class="w-full" type="number" :placeholder="t('people.dailyRate')" />
        <div class="sm:col-span-2 flex gap-2"><UButton class="button-primary" size="sm" :loading="pending" @click="addItem">{{ t('people.save') }}</UButton><UButton size="sm" variant="ghost" @click="itemOpen = false">{{ t('common.cancel') }}</UButton></div>
      </div>
    </section>

    <section class="panel mt-6 p-6">
      <p class="panel-title">{{ t('people.blockers') }}</p>
      <ul v-if="blockers.length" class="mt-3 space-y-1 text-sm text-[var(--danger)]">
        <li v-for="(blocker, index) in blockers" :key="index">• {{ blocker }}</li>
      </ul>
      <p v-else class="mt-3 text-sm text-[var(--success)]">{{ t('people.readyToHandover') }}</p>
      <UButton v-if="agreement?.status === 'draft'" class="button-primary mt-4" :loading="pending" @click="markReady">{{ t('people.markReady') }}</UButton>
      <UButton v-if="agreement?.status === 'returned'" class="button-primary mt-4 ml-2" :loading="pending" @click="closeAgreement">{{ t('people.closeAgreement') }}</UButton>
      <UButton v-if="['draft','ready'].includes(agreement?.status)" class="button-secondary mt-4 ml-2" variant="outline" @click="openCancel">{{ t('people.cancelAgreement') }}</UButton>
      <div v-if="cancelOpen" class="mt-4 grid gap-2">
        <UInput v-model="cancelReason" class="w-full" :placeholder="t('people.cancelReason')" />
        <div class="flex gap-2"><UButton class="button-primary" size="sm" :loading="pending" @click="cancelAgreement">{{ t('people.confirmCancel') }}</UButton><UButton size="sm" variant="ghost" @click="cancelOpen = false">{{ t('common.cancel') }}</UButton></div>
      </div>
    </section>

    <div v-if="returnOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/60 p-4">
      <section class="surface w-full max-w-lg p-6">
        <p class="eyebrow">{{ t('people.return') }}</p>
        <div class="mt-4 space-y-3">
          <UInput v-model.number="returnOdometer" class="w-full" type="number" :placeholder="t('people.odometer')" />
          <UInput v-model="returnDamageNotes" class="w-full" :placeholder="t('people.damageNotes')" />
          <UInput v-model.number="returnDamageAmount" class="w-full" type="number" :placeholder="t('people.damageAmount')" />
          <label class="block text-xs text-[var(--muted)]">
            <span>{{ t('photo.optional') }}</span>
            <input class="mt-1 block w-full text-xs" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" @change="onReturnPhoto" />
          </label>
          <p v-if="actionError" class="text-sm text-[var(--danger)]" role="alert">{{ actionError }}</p>
          <div class="flex gap-2"><UButton class="button-primary" size="sm" :loading="pending" @click="submitReturn">{{ t('people.confirmReturn') }}</UButton><UButton size="sm" variant="ghost" @click="returnOpen = false">{{ t('common.cancel') }}</UButton></div>
        </div>
      </section>
    </div>
    </template>
  </div>
</template>
