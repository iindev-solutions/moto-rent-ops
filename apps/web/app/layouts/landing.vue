<script setup lang="ts">
const { loggedIn } = useUserSession()
const { t } = useLocale()

const phoneHref = 'tel:+84911710610'
const phoneDisplay = '+84 911 710 610'
</script>

<template>
  <div class="page-shell flex min-h-[100dvh] flex-col">
    <header class="landing-topbar">
      <NuxtLink to="/" class="landing-brand">
        <span class="landing-brand__mark">A. CHÂU</span>
        <span class="landing-brand__note">{{ t('lp.brandNote') }}</span>
      </NuxtLink>
      <div class="flex items-center gap-2">
        <LocaleSwitcher />
        <UColorModeButton class="topbar-icon-button" aria-label="Toggle color mode" />
        <NuxtLink v-if="loggedIn" to="/dashboard" class="button-primary">{{ t('common.openDashboard') }}</NuxtLink>
        <a v-else class="button-primary" :href="phoneHref">{{ phoneDisplay }}</a>
      </div>
    </header>
    <main class="flex flex-1 flex-col">
      <slot />
    </main>
  </div>
</template>
