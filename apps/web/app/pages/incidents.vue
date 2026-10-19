<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { t, tStatus, tPriority } = useLocale()
const { data, error, refresh } = await useFetch<any>('/api/incidents')

const open = ref(false)
const title = ref('')
const description = ref('')
const motorcycleId = ref('')
const priority = ref('medium')
const pending = ref(false)
const pendingId = ref('')
const actionError = ref('')

const incidents = computed(() => data.value?.incidents || [])

function openForm() {
  actionError.value = ''
  open.value = true
}

async function createIncident() {
  pending.value = true
  actionError.value = ''
  try {
    await $fetch('/api/incidents', { method: 'POST', body: { title: title.value, description: description.value || undefined, motorcycleId: motorcycleId.value || undefined, priority: priority.value } })
    open.value = false
    title.value = ''
    description.value = ''
    motorcycleId.value = ''
    await refresh()
  } catch (error) { actionError.value = apiErrorMessage(error, t('common.error')) } finally { pending.value = false }
}

async function setStatus(id: string, status: string) {
  pending.value = true
  pendingId.value = id
  actionError.value = ''
  try {
    await $fetch(`/api/incidents/${id}/status`, { method: 'POST', body: { status } })
    await refresh()
  } catch (error) { actionError.value = apiErrorMessage(error, t('common.error')) } finally { pending.value = false; pendingId.value = '' }
}
</script>

<template>
  <div>
    <header class="page-header">
      <div>
        <p class="eyebrow">{{ t('nav.operations') }} / 05</p>
        <h1 class="page-title mt-2">{{ t('incidents.title') }}</h1>
        <p class="page-subtitle">{{ t('incidents.subtitle') }}</p>
      </div>
      <UButton class="button-primary" @click="openForm">{{ t('incidents.new') }}</UButton>
    </header>

    <p v-if="actionError" class="mb-4 text-sm text-[var(--danger)]" role="alert">{{ actionError }}</p>

    <section v-if="error" class="panel mb-4 border-[var(--danger)]/30 p-4 text-sm text-[var(--danger)]"><div class="flex flex-wrap items-center justify-between gap-3"><span>{{ t('common.loadError') }}</span><UButton class="button-secondary" variant="outline" @click="refresh()">{{ t('common.retry') }}</UButton></div></section>

    <section v-if="open" class="panel mb-6 p-6">
      <div class="grid gap-3 sm:grid-cols-2">
        <UInput v-model="title" class="w-full" :placeholder="t('incidents.titleField')" />
        <UInput v-model="motorcycleId" class="w-full" :placeholder="t('incidents.motorcycleId')" />
        <select v-model="priority" class="brutal-input">
          <option value="low">{{ tPriority('low') }}</option>
          <option value="medium">{{ tPriority('medium') }}</option>
          <option value="high">{{ tPriority('high') }}</option>
        </select>
        <UInput v-model="description" class="w-full" :placeholder="t('incidents.description')" />
      </div>
      <div class="mt-4 flex gap-2">
        <UButton class="button-primary" :loading="pending" @click="createIncident">{{ t('common.create') }}</UButton>
        <UButton class="button-secondary" variant="ghost" @click="open = false">{{ t('common.cancel') }}</UButton>
      </div>
    </section>

    <section class="panel p-6">
      <div v-if="incidents.length" class="overflow-x-auto">
        <table class="data-table">
          <thead><tr><th>{{ t('incidents.titleField') }}</th><th>{{ t('finance.status') }}</th><th>{{ t('incidents.priority') }}</th><th>{{ t('incidents.motorcycle') }}</th><th>{{ t('incidents.created') }}</th><th></th></tr></thead>
          <tbody>
            <tr v-for="row in incidents" :key="row.id">
              <td>{{ row.title }}</td>
              <td><span class="status-pill">{{ tStatus(row.status) }}</span></td>
              <td>{{ tPriority(row.priority) }}</td>
              <td>{{ row.assetCode || '—' }}</td>
              <td>{{ formatDateTime(row.createdAt) }}</td>
              <td class="text-right">
                <div class="flex justify-end gap-2">
                  <UButton size="xs" variant="ghost" :loading="pendingId === row.id && pending" @click="setStatus(row.id, 'investigating')">{{ t('incidents.investigating') }}</UButton>
                  <UButton size="xs" variant="ghost" :loading="pendingId === row.id && pending" @click="setStatus(row.id, 'resolved')">{{ t('incidents.resolve') }}</UButton>
                  <UButton size="xs" variant="ghost" :loading="pendingId === row.id && pending" @click="setStatus(row.id, 'closed')">{{ t('incidents.closeIncident') }}</UButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="text-sm text-[var(--muted)]">{{ t('incidents.empty') }}</p>
    </section>
  </div>
</template>