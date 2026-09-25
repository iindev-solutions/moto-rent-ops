<script setup lang="ts">
import type { BikeSummary } from '@book-moto/contracts'
import { normalizeLocatorToken } from '@book-moto/domain/qr'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const token = computed(() => normalizeLocatorToken(String(route.params.token || '')) || '')
const { data: bike, error, status } = await useFetch<BikeSummary>(() => `/api/bikes/${encodeURIComponent(token.value)}`, {
  retry: 0,
})

const statusLabels: Record<string, string> = {
  available: 'Свободен',
  reserved: 'Зарезервирован',
  rented: 'В аренде',
  inspection: 'Приёмка',
  maintenance: 'Ремонт',
  blocked: 'Заблокирован',
  retired: 'Списан',
}

const statusLabel = computed(() => statusLabels[bike.value?.status || ''] || bike.value?.status || 'Неизвестно')
</script>

<template>
  <div class="min-h-screen text-[var(--ink)]">
    <header class="border-b border-[var(--line)] bg-[var(--paper)]/95">
      <div class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <NuxtLink to="/" class="font-mono text-sm font-black tracking-[0.18em]">MOTO<span class="text-[var(--signal)]">//</span>OPS</NuxtLink>
        <span class="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">Bike / {{ token || '—' }}</span>
      </div>
    </header>

    <main class="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <NuxtLink to="/" class="font-mono text-xs font-bold uppercase tracking-[0.14em] underline decoration-2 underline-offset-4">← Ко всем байкам</NuxtLink>

      <div v-if="status === 'pending'" class="mt-8 brutal-panel p-8">
        <USkeleton class="h-6 w-32" />
        <USkeleton class="mt-6 h-16 w-3/4" />
        <USkeleton class="mt-4 h-5 w-1/2" />
      </div>

      <section v-else-if="bike" class="mt-8">
        <div class="brutal-panel overflow-hidden">
          <div class="flex flex-wrap items-start justify-between gap-6 border-b border-[var(--line)] bg-[var(--ink)] p-6 text-[var(--paper)] sm:p-10">
            <div>
              <p class="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--paper)]/60">Motorcycle / {{ bike.assetCode }}</p>
              <h1 class="mt-4 text-4xl font-black tracking-[-0.06em] sm:text-6xl">{{ bike.model }}</h1>
              <p class="mt-3 font-mono text-sm text-[var(--paper)]/70">{{ bike.plate || 'Госномер не указан' }}</p>
            </div>
            <UBadge class="rounded-none border border-[var(--acid)] bg-[var(--acid)] px-3 py-2 font-mono text-xs font-black uppercase text-[var(--ink)]">{{ statusLabel }}</UBadge>
          </div>
          <div class="grid gap-px bg-[var(--line)] sm:grid-cols-3">
            <div class="bg-[var(--paper-raised)] p-6">
              <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">Location</p>
              <p class="mt-3 text-xl font-black">{{ bike.location || '—' }}</p>
            </div>
            <div class="bg-[var(--paper-raised)] p-6">
              <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">Status</p>
              <p class="mt-3 text-xl font-black">{{ statusLabel }}</p>
            </div>
            <div class="bg-[var(--paper-raised)] p-6">
              <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">Next action</p>
              <p class="mt-3 text-xl font-black">{{ bike.nextAction || 'Нет активного действия' }}</p>
            </div>
          </div>
        </div>
        <p class="mt-6 font-mono text-xs text-[var(--muted)]">Deep link подтверждён. Следующий шаг — подключить аренду, финансы и историю к этой карточке.</p>
      </section>

      <section v-else class="mt-8 brutal-panel p-8 sm:p-10">
        <p class="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--signal)]">Lookup failed</p>
        <h1 class="mt-4 text-4xl font-black tracking-[-0.05em]">Байк не найден</h1>
        <p class="mt-4 max-w-xl leading-7 text-[var(--muted)]">Проверьте QR-код, вход в систему и доступ к площадке. Неизвестный или отозванный токер не раскрывает данные.</p>
        <UButton class="mt-8" to="/" variant="outline">Вернуться к панели</UButton>
      </section>
    </main>
  </div>
</template>
