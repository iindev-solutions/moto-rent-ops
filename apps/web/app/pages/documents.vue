<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { t, tStatus } = useLocale()
const { data, error, refresh } = await useFetch<any>('/api/documents')
const documents = computed(() => data.value?.documents || [])
const pending = ref(false)
const pendingId = ref('')
const actionError = ref('')

async function returnDocument(id: string) {
  pending.value = true
  pendingId.value = id
  actionError.value = ''
  try {
    await $fetch(`/api/documents/${id}/return`, { method: 'POST', body: {} })
    await refresh()
  } catch (error) { actionError.value = apiErrorMessage(error, t('common.error')) } finally { pending.value = false; pendingId.value = '' }
}
</script>

<template>
  <div>
    <header class="page-header">
      <div>
        <p class="eyebrow">{{ t('nav.operations') }} / 08</p>
        <h1 class="page-title mt-2">{{ t('documents.title') }}</h1>
        <p class="page-subtitle">{{ t('documents.subtitle') }}</p>
      </div>
    </header>

    <p v-if="actionError" class="mb-4 text-sm text-[var(--danger)]" role="alert">{{ actionError }}</p>

    <section v-if="error" class="panel mb-4 border-[var(--danger)]/30 p-4 text-sm text-[var(--danger)]"><div class="flex flex-wrap items-center justify-between gap-3"><span>{{ t('common.loadError') }}</span><UButton class="button-secondary" variant="outline" @click="refresh()">{{ t('common.retry') }}</UButton></div></section>

    <section v-else class="panel p-6">
      <div v-if="documents.length" class="overflow-x-auto">
        <table class="data-table">
          <thead><tr><th>{{ t('people.client') }}</th><th>{{ t('documents.type') }}</th><th>{{ t('documents.number') }}</th><th>{{ t('finance.status') }}</th><th>{{ t('people.received') }}</th><th><span class="sr-only">{{ t('common.actions') }}</span></th></tr></thead>
          <tbody>
            <tr v-for="row in documents" :key="row.id">
              <td><NuxtLink :to="`/people/${row.clientId}`" class="font-semibold hover:text-[var(--accent)]">{{ row.clientName || row.clientId.slice(0, 8) }}</NuxtLink></td>
              <td>{{ row.documentType }}</td>
              <td class="font-mono text-xs">{{ row.maskedNumber || '—' }}</td>
              <td><span class="status-pill">{{ tStatus(row.status) }}</span></td>
              <td>{{ formatDateTime(row.receivedAt) }}</td>
              <td class="text-right">
                <UButton v-if="row.status === 'held'" size="xs" variant="ghost" :loading="pendingId === row.id && pending" @click="returnDocument(row.id)">{{ t('people.returnDocument') }}</UButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="text-sm text-[var(--muted)]">{{ t('documents.empty') }}</p>
    </section>
  </div>
</template>
