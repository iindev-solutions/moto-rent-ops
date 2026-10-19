<script setup lang="ts">
definePageMeta({ layout: 'landing' })

const { t } = useLocale()
</script>

<template>
  <div class="flex flex-1 items-center justify-center px-4 py-12">
    <section class="surface w-full max-w-3xl p-8 sm:p-12">
      <p class="eyebrow">{{ t('home.eyebrow') }}</p>
      <h1 class="mt-3 text-4xl font-extrabold tracking-[-0.06em] sm:text-5xl">{{ t('home.title') }}</h1>
      <p class="mt-4 max-w-xl text-sm leading-6 text-[var(--text-muted)]">{{ t('home.subtitle') }}</p>
      <div class="mt-8 flex flex-wrap gap-3">
        <NuxtLink to="/login" class="button-primary">{{ t('login.submit') }}</NuxtLink>
        <NuxtLink to="/dashboard" class="button-secondary">{{ t('common.openDashboard') }}</NuxtLink>
      </div>
      <div class="landing-points mt-10">
        <div class="landing-point">
          <UIcon name="i-lucide-bike" class="size-4 text-[var(--accent)]" />
          <span>{{ t('home.fleetTitle') }}</span>
        </div>
        <div class="landing-point">
          <UIcon name="i-lucide-file-signature" class="size-4 text-[var(--accent)]" />
          <span>{{ t('nav.rentals') }}</span>
        </div>
        <div class="landing-point">
          <UIcon name="i-lucide-landmark" class="size-4 text-[var(--accent)]" />
          <span>{{ t('home.financeTitle') }}</span>
        </div>
      </div>
    </section>
  </div>
</template>
