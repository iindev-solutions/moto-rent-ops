<script setup lang="ts">
import type { ClientSummary } from '@book-moto/contracts'

definePageMeta({ middleware: 'auth' })

const { t, tChannel } = useLocale()
const router = useRouter()
const { data, error, status, refresh } = await useFetch<{ clients: ClientSummary[] }>('/api/people')

const createOpen = ref(false)
const displayName = ref('')
const preferredChannel = ref('phone')
const contactValue = ref('')
const pending = ref(false)
const actionError = ref('')

const clients = computed(() => data.value?.clients || [])

async function createClient() {
  pending.value = true
  actionError.value = ''
  try {
    const body: Record<string, unknown> = {
      displayName: displayName.value,
      preferredChannel: preferredChannel.value,
      contacts: contactValue.value ? [{ channel: preferredChannel.value, value: contactValue.value, isPrimary: true }] : [],
    }
    const response = await $fetch<{ client: { id: string } }>('/api/people', { method: 'POST', body })
    createOpen.value = false
    displayName.value = ''
    contactValue.value = ''
    await router.push(`/people/${response.client.id}`)
  } catch (error) {
    actionError.value = apiErrorMessage(error, t('common.error'))
  } finally {
    pending.value = false
  }
}

function openCreate() {
  actionError.value = ''
  createOpen.value = true
}
</script>

<template>
  <div>
    <header class="page-header">
      <div>
        <p class="eyebrow">{{ t('nav.people') }} / 03</p>
        <h1 class="page-title mt-2">{{ t('people.title') }}</h1>
        <p class="page-subtitle">{{ t('people.subtitle') }}</p>
      </div>
      <UButton class="button-primary" icon="i-lucide-user-plus" @click="openCreate">{{ t('people.newClient') }}</UButton>
    </header>

    <div v-if="status === 'pending'" class="space-y-3"><USkeleton class="h-12 w-full" v-for="n in 4" :key="n" /></div>
    <div v-else-if="error" class="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/5 p-4 text-sm text-[var(--danger)]"><p>{{ t('common.error') }}</p><UButton class="mt-3" variant="outline" @click="refresh()">{{ t('common.retry') }}</UButton></div>
    <div v-else-if="clients.length" class="panel overflow-hidden">
      <table class="data-table">
        <thead><tr><th>{{ t('people.client') }}</th><th>{{ t('people.contacts') }}</th><th>{{ t('people.documents') }}</th><th>{{ t('people.agreements') }}</th><th></th></tr></thead>
        <tbody>
          <tr v-for="client in clients" :key="client.id">
            <td class="font-semibold">{{ client.displayName }}</td>
            <td>{{ client.contactCount }}</td>
            <td>{{ client.openDocumentCount }}</td>
            <td>{{ client.activeAgreementCount }}</td>
            <td class="text-right"><UButton :to="`/people/${client.id}`" variant="ghost" size="sm" trailing-icon="i-lucide-arrow-up-right">{{ t('common.open') }}</UButton></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else class="empty-state"><UIcon name="i-lucide-users" class="mx-auto size-8 text-[var(--text-muted)]" /><p class="mt-3">{{ t('people.empty') }}</p></div>

    <div v-if="createOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/60 p-4">
      <section class="surface w-full max-w-lg p-6">
        <p class="eyebrow">{{ t('people.newClient') }}</p>
        <div class="mt-4 space-y-3">
          <UInput v-model="displayName" class="w-full" :placeholder="t('people.displayName')" />
          <select v-model="preferredChannel" class="brutal-input">
            <option v-for="channel in ['phone','telegram','whatsapp','email']" :key="channel" :value="channel">{{ tChannel(channel) }}</option>
          </select>
          <UInput v-model="contactValue" class="w-full" :placeholder="t('people.firstContact')" />
          <p v-if="actionError" class="text-sm text-[var(--danger)]">{{ actionError }}</p>
          <div class="flex gap-2">
            <UButton class="button-primary" :loading="pending" @click="createClient">{{ t('people.create') }}</UButton>
            <UButton class="button-secondary" variant="ghost" @click="createOpen = false">{{ t('common.cancel') }}</UButton>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
