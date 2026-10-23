<script setup lang="ts">
definePageMeta({ layout: false })

const { t } = useLocale()

function retry() {
  if (import.meta.client) {
    window.location.reload()
  }
}
</script>

<template>
  <div class="page-shell">
    <main class="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
      <p class="eyebrow text-[var(--accent)]">MOTO<em>//</em>OPS</p>
      <h1 class="mt-4 text-4xl font-extrabold tracking-[-0.055em]">{{ t('offline.title') }}</h1>
      <p class="mt-4 text-sm leading-6 text-[var(--muted)]">{{ t('offline.body') }}</p>
      <button type="button" class="button-primary mt-8 self-start" @click="retry">{{ t('offline.retry') }}</button>
    </main>
  </div>
</template>
