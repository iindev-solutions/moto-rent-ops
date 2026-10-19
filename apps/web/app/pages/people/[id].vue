<script setup lang="ts">
import type { ClientDetail } from '@book-moto/contracts'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const router = useRouter()
const { t, tStatus, tChannel } = useLocale()
const id = computed(() => String(route.params.id))
const { data, error, refresh } = await useFetch<ClientDetail>(() => `/api/people/${id.value}`)

const contactOpen = ref(false)
const documentOpen = ref(false)
const agreementOpen = ref(false)
const contactChannel = ref('phone')
const contactValue = ref('')
const documentType = ref('passport')
const maskedNumber = ref('')
const documentPhotoFile = ref<File | null>(null)
const agreementStart = ref(toLocalInputValue(new Date()))
const agreementEnd = ref(toLocalInputValue(new Date(Date.now() + 7 * 86400000)))
const pending = ref(false)
const actionError = ref('')

const client = computed(() => data.value?.client)
const contacts = computed(() => data.value?.contacts || [])
const documents = computed(() => data.value?.documents || [])
const agreements = computed(() => data.value?.agreements || [])

async function addContact() {
  pending.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/people/${id.value}/contacts`, { method: 'POST', body: { channel: contactChannel.value, value: contactValue.value, isPrimary: contacts.value.length === 0 } })
    contactOpen.value = false
    contactValue.value = ''
    await refresh()
  } catch (error) { actionError.value = apiErrorMessage(error, t('common.error')) } finally { pending.value = false }
}

function onDocumentPhoto(event: Event) {
  const input = event.target as HTMLInputElement
  documentPhotoFile.value = input.files?.[0] ?? null
}

async function uploadAttachment(entityType: string, entityId: string, file: File) {
  await $fetch(`/api/attachments?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`, {
    method: 'POST',
    body: file,
    headers: { 'content-type': file.type || 'image/jpeg' },
  })
}

async function addDocument() {
  pending.value = true
  actionError.value = ''
  const photo = documentPhotoFile.value
  try {
    const result = await $fetch<{ document: { id: string } }>(`/api/people/${id.value}/documents`, { method: 'POST', body: { documentType: documentType.value, maskedNumber: maskedNumber.value || undefined } })
    if (photo && result.document?.id) {
      try {
        await uploadAttachment('document_custody', result.document.id, photo)
      } catch {
        actionError.value = t('photo.uploadFailed')
      }
    }
    documentOpen.value = false
    maskedNumber.value = ''
    documentPhotoFile.value = null
    await refresh()
  } catch (error) { actionError.value = apiErrorMessage(error, t('common.error')) } finally { pending.value = false }
}

async function returnDocument(documentId: string) {
  pending.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/documents/${documentId}/return`, { method: 'POST', body: {} })
    await refresh()
  } catch (error) { actionError.value = apiErrorMessage(error, t('common.error')) } finally { pending.value = false }
}

async function createAgreement() {
  const startIso = localInputToIso(agreementStart.value)
  const endIso = localInputToIso(agreementEnd.value)
  if (!startIso || !endIso || new Date(endIso) <= new Date(startIso)) {
    actionError.value = t('common.error')
    return
  }
  pending.value = true
  actionError.value = ''
  try {
    const response = await $fetch<{ agreement: { id: string } }>(`/api/people/${id.value}/agreements`, {
      method: 'POST',
      body: { startDate: startIso, endDate: endIso },
    })
    agreementOpen.value = false
    await router.push(`/agreements/${response.agreement.id}`)
  } catch (error) { actionError.value = apiErrorMessage(error, t('common.error')) } finally { pending.value = false }
}
</script>

<template>
  <div>
    <header class="page-header">
      <div>
        <p class="eyebrow">{{ t('nav.people') }} / Detail</p>
        <h1 class="page-title mt-2">{{ client?.displayName || t('common.loading') }}</h1>
        <p class="page-subtitle">{{ client ? tChannel(client.preferredChannel) : '' }}</p>
      </div>
      <UButton class="button-secondary" to="/people" variant="ghost">{{ t('common.back') }}</UButton>
    </header>

    <p v-if="actionError" class="mb-4 text-sm text-[var(--danger)]" role="alert">{{ actionError }}</p>

    <section v-if="error" class="panel mb-4 border-[var(--danger)]/30 p-4 text-sm text-[var(--danger)]"><div class="flex flex-wrap items-center justify-between gap-3"><span>{{ t('common.loadError') }}</span><UButton class="button-secondary" variant="outline" @click="refresh()">{{ t('common.retry') }}</UButton></div></section>

    <template v-else>

    <section class="content-grid">
      <div class="panel p-6">
        <div class="flex items-center justify-between">
          <p class="panel-title">{{ t('people.contacts') }}</p>
          <UButton size="sm" icon="i-lucide-plus" @click="contactOpen = true; actionError = ''">{{ t('people.add') }}</UButton>
        </div>
        <div v-if="contacts.length" class="mt-4 space-y-2">
          <div v-for="contact in contacts" :key="contact.id" class="flex items-center justify-between border-b border-[var(--line)] py-2 last:border-b-0">
            <span class="font-mono text-xs uppercase">{{ tChannel(contact.channel) }}</span>
            <span>{{ contact.value }}</span>
          </div>
        </div>
        <p v-else class="mt-4 text-sm text-[var(--muted)]">{{ t('people.noContacts') }}</p>
        <div v-if="contactOpen" class="mt-4 grid gap-2">
          <select v-model="contactChannel" class="brutal-input"><option v-for="channel in ['phone','telegram','whatsapp','email']" :key="channel" :value="channel">{{ tChannel(channel) }}</option></select>
          <UInput v-model="contactValue" class="w-full" :placeholder="t('people.contactValue')" />
          <div class="flex gap-2"><UButton class="button-primary" size="sm" :loading="pending" @click="addContact">{{ t('people.save') }}</UButton><UButton size="sm" variant="ghost" @click="contactOpen = false">{{ t('common.cancel') }}</UButton></div>
        </div>
      </div>

      <div class="panel p-6">
        <div class="flex items-center justify-between">
          <p class="panel-title">{{ t('people.documents') }}</p>
          <UButton size="sm" icon="i-lucide-plus" @click="documentOpen = true; actionError = ''">{{ t('people.receiveDocument') }}</UButton>
        </div>
        <div v-if="documents.length" class="mt-4 space-y-3">
          <div v-for="document in documents" :key="document.id" class="border-b border-[var(--line)] pb-3 last:border-b-0">
            <div class="flex items-center justify-between gap-2">
              <span class="font-semibold">{{ document.documentType }}</span>
              <span class="status-pill">{{ tStatus(document.status) }}</span>
            </div>
            <p v-if="document.maskedNumber" class="mt-1 font-mono text-xs text-[var(--muted)]">{{ document.maskedNumber }}</p>
            <div v-if="document.attachments?.length" class="mt-2 flex gap-2">
              <a v-for="attachment in document.attachments" :key="attachment.id" :href="`/api/attachments/${attachment.id}`" target="_blank" rel="noopener">
                <img :src="`/api/attachments/${attachment.id}`" :alt="t('photo.add')" class="size-12 rounded border border-[var(--line)] object-cover" />
              </a>
            </div>
            <p class="mt-1 text-xs text-[var(--muted)]">{{ t('people.received') }}: {{ formatDateTime(document.receivedAt) }}</p>
            <UButton v-if="document.status === 'held'" size="sm" class="mt-2" variant="outline" :loading="pending" @click="returnDocument(document.id)">{{ t('people.returnDocument') }}</UButton>
          </div>
        </div>
        <p v-else class="mt-4 text-sm text-[var(--muted)]">{{ t('people.noDocuments') }}</p>
        <div v-if="documentOpen" class="mt-4 grid gap-2">
          <UInput v-model="documentType" class="w-full" :placeholder="t('people.documentType')" />
          <UInput v-model="maskedNumber" class="w-full" :placeholder="t('people.maskedNumber')" />
          <label class="block text-xs text-[var(--muted)]">
            <span>{{ t('photo.optional') }}</span>
            <input class="mt-1 block w-full text-xs" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" @change="onDocumentPhoto" />
          </label>
          <div class="flex gap-2"><UButton class="button-primary" size="sm" :loading="pending" @click="addDocument">{{ t('people.save') }}</UButton><UButton size="sm" variant="ghost" @click="documentOpen = false">{{ t('common.cancel') }}</UButton></div>
        </div>
      </div>
    </section>

    <section class="panel mt-6 p-6">
      <div class="flex items-center justify-between">
        <p class="panel-title">{{ t('people.agreements') }}</p>
        <UButton size="sm" icon="i-lucide-plus" @click="agreementOpen = true; actionError = ''">{{ t('people.newAgreement') }}</UButton>
      </div>
      <div v-if="agreements.length" class="mt-4 space-y-3">
        <NuxtLink v-for="agreement in agreements" :key="agreement.id" :to="`/agreements/${agreement.id}`" class="flex items-center justify-between border-b border-[var(--line)] py-3 last:border-b-0 hover:text-[var(--accent)]">
          <div>
            <p class="font-semibold">{{ agreement.id.slice(0, 8) }}</p>
            <p class="text-xs text-[var(--muted)]">{{ formatDateTime(agreement.startDate) }} → {{ formatDateTime(agreement.endDate) }} · {{ agreement.itemCount }} {{ t('people.items') }}</p>
          </div>
          <span class="status-pill">{{ tStatus(agreement.status) }}</span>
        </NuxtLink>
      </div>
      <p v-else class="mt-4 text-sm text-[var(--muted)]">{{ t('people.noAgreements') }}</p>
      <div v-if="agreementOpen" class="mt-4 grid gap-2 sm:grid-cols-2">
        <UInput v-model="agreementStart" class="w-full" type="datetime-local" />
        <UInput v-model="agreementEnd" class="w-full" type="datetime-local" />
        <div class="sm:col-span-2 flex gap-2"><UButton class="button-primary" size="sm" :loading="pending" @click="createAgreement">{{ t('people.create') }}</UButton><UButton size="sm" variant="ghost" @click="agreementOpen = false">{{ t('common.cancel') }}</UButton></div>
      </div>
    </section>
    </template>
  </div>
</template>
