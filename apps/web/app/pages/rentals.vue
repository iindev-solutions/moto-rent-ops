<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { t, tStatus } = useLocale()
const { data, error, refresh } = await useFetch<any>('/api/rentals')
const agreements = computed(() => data.value?.agreements || [])
</script>

<template>
  <div>
    <header class="page-header">
      <div>
        <p class="eyebrow">{{ t('nav.workspace') }} / 07</p>
        <h1 class="page-title mt-2">{{ t('rentals.title') }}</h1>
        <p class="page-subtitle">{{ t('rentals.subtitle') }}</p>
      </div>
    </header>

    <section v-if="error" class="panel mb-4 border-[var(--danger)]/30 p-4 text-sm text-[var(--danger)]"><div class="flex flex-wrap items-center justify-between gap-3"><span>{{ t('common.loadError') }}</span><UButton class="button-secondary" variant="outline" @click="refresh()">{{ t('common.retry') }}</UButton></div></section>

    <section v-else class="panel p-6">
      <div v-if="agreements.length" class="overflow-x-auto">
        <table class="data-table">
          <thead><tr><th>{{ t('people.client') }}</th><th>{{ t('rentals.period') }}</th><th>{{ t('rentals.itemCount') }}</th><th>{{ t('finance.status') }}</th></tr></thead>
          <tbody>
            <tr v-for="row in agreements" :key="row.id" class="cursor-pointer" @click="navigateTo(`/agreements/${row.id}`)">
              <td class="font-semibold">{{ row.clientName || row.clientId.slice(0, 8) }}</td>
              <td>{{ formatDateTime(row.startDate) }} → {{ formatDateTime(row.endDate) }}</td>
              <td>{{ row.itemCount }}</td>
              <td><span class="status-pill">{{ tStatus(row.status) }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="text-sm text-[var(--muted)]">{{ t('rentals.empty') }}</p>
    </section>
  </div>
</template>
