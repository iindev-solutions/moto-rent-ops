<script setup lang="ts">
import { normalizeLocatorToken } from '@book-moto/domain/qr'

const router = useRouter()
const manualCode = ref('')
const scannerOpen = ref(false)
const scannerError = ref('')
const { data: health } = await useFetch('/api/health')

function openManualLookup() {
  const token = normalizeLocatorToken(manualCode.value)
  if (!token) {
    scannerError.value = 'Введите UUID или ULID из QR-метки.'
    return
  }

  scannerError.value = ''
  router.push(`/b/${token}`)
}

function onScan(value: string) {
  const token = normalizeLocatorToken(value)
  if (!token) {
    scannerError.value = 'QR-код не соответствует формату метки.'
    return
  }

  scannerOpen.value = false
  router.push(`/b/${token}`)
}
</script>

<template>
  <div class="min-h-screen text-[var(--ink)]">
    <header class="border-b border-[var(--line)] bg-[var(--paper)]/95">
      <div class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <NuxtLink to="/" class="font-mono text-sm font-black tracking-[0.18em]">
          MOTO<span class="text-[var(--signal)]">//</span>OPS
        </NuxtLink>
        <div class="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.14em]">
          <span class="status-dot" aria-hidden="true" />
          <span>{{ health?.status === 'ok' ? 'API online' : 'API check' }}</span>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <section class="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)]">
        <div class="brutal-panel p-6 sm:p-10">
          <p class="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
            Motorcycle rental / control room
          </p>
          <h1 class="mt-6 max-w-3xl text-5xl font-black leading-[0.93] tracking-[-0.06em] sm:text-7xl">
            Управляй<br>
            <span class="text-[var(--signal)]">парком.</span>
          </h1>
          <p class="mt-6 max-w-xl text-base leading-7 text-[var(--muted)] sm:text-lg">
            Одна карточка на мотоцикл: аренда, платежи, залог, документы и следующий шаг.
          </p>

          <div class="mt-10 grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
            <UButton
              class="brutal-button justify-center px-5"
              icon="i-lucide-scan-line"
              @click="scannerOpen = true"
            >
              Сканировать QR
            </UButton>
            <UInput
              v-model="manualCode"
              class="brutal-input"
              placeholder="UUID / ULID"
              aria-label="Ручной код мотоцикла"
              @keyup.enter="openManualLookup"
            />
            <UButton
              class="brutal-button justify-center px-5"
              variant="outline"
              @click="openManualLookup"
            >
              Открыть
            </UButton>
          </div>
          <p v-if="scannerError" class="mt-3 font-mono text-xs text-[var(--signal)]" role="alert">
            {{ scannerError }}
          </p>
          <p class="mt-4 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
            Deep link: /b/{token} · QR не раскрывает PII
          </p>
        </div>

        <aside class="brutal-dark flex flex-col justify-between p-6 sm:p-8">
          <div>
            <div class="flex items-center justify-between border-b border-[var(--paper)]/30 pb-4 font-mono text-[11px] uppercase tracking-[0.16em]">
              <span>System / 01</span>
              <span class="text-[var(--acid)]">LIVE</span>
            </div>
            <h2 class="mt-8 text-3xl font-black leading-none tracking-[-0.04em]">
              Один источник<br>операционной правды.
            </h2>
          </div>
          <div class="mt-12 grid grid-cols-2 gap-px border border-[var(--paper)]/30 bg-[var(--paper)]/30">
            <div class="bg-[var(--ink)] p-4">
              <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--paper)]/60">Fleet</p>
              <p class="mt-3 text-3xl font-black">—</p>
            </div>
            <div class="bg-[var(--ink)] p-4">
              <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--paper)]/60">Attention</p>
              <p class="mt-3 text-3xl font-black text-[var(--acid)]">—</p>
            </div>
            <div class="bg-[var(--ink)] p-4">
              <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--paper)]/60">Payments</p>
              <p class="mt-3 text-3xl font-black">—</p>
            </div>
            <div class="bg-[var(--ink)] p-4">
              <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--paper)]/60">Residency</p>
              <p class="mt-3 text-sm font-black uppercase text-[var(--acid)]">Vietnam</p>
            </div>
          </div>
        </aside>
      </section>

      <section class="mt-6 grid gap-6 md:grid-cols-3">
        <article class="brutal-panel p-6">
          <div class="flex items-center justify-between">
            <p class="font-mono text-[11px] font-bold uppercase tracking-[0.16em]">01 / Сегодня</p>
            <UIcon name="i-lucide-arrow-up-right" class="size-4" />
          </div>
          <h2 class="mt-8 text-2xl font-black tracking-[-0.04em]">Очередь операций</h2>
          <p class="mt-3 text-sm leading-6 text-[var(--muted)]">Выезды, возвраты, просрочки и ТО появятся здесь из реальных данных.</p>
          <UButton class="mt-8" variant="ghost" trailing-icon="i-lucide-arrow-right">Открыть очередь</UButton>
        </article>
        <article class="brutal-panel p-6">
          <div class="flex items-center justify-between">
            <p class="font-mono text-[11px] font-bold uppercase tracking-[0.16em]">02 / Fleet</p>
            <UIcon name="i-lucide-bike" class="size-4" />
          </div>
          <h2 class="mt-8 text-2xl font-black tracking-[-0.04em]">Мотоциклы</h2>
          <p class="mt-3 text-sm leading-6 text-[var(--muted)]">Поиск, QR-печать, карточки и история custody.</p>
          <UButton class="mt-8" variant="ghost" trailing-icon="i-lucide-arrow-right">Открыть парк</UButton>
        </article>
        <article class="brutal-panel p-6">
          <div class="flex items-center justify-between">
            <p class="font-mono text-[11px] font-bold uppercase tracking-[0.16em]">03 / Finance</p>
            <UIcon name="i-lucide-landmark" class="size-4" />
          </div>
          <h2 class="mt-8 text-2xl font-black tracking-[-0.04em]">Деньги</h2>
          <p class="mt-3 text-sm leading-6 text-[var(--muted)]">Начисления, поступления, депозиты и возвраты — без magic flags.</p>
          <UButton class="mt-8" variant="ghost" trailing-icon="i-lucide-arrow-right">Открыть финансы</UButton>
        </article>
      </section>
    </main>

    <BikeScanner v-if="scannerOpen" @close="scannerOpen = false" @found="onScan" />
  </div>
</template>
