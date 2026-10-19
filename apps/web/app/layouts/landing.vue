<script setup lang="ts">
const { loggedIn } = useUserSession()
const { t } = useLocale()
</script>

<template>
  <div class="page-shell flex min-h-[100dvh] flex-col">
    <header class="landing-topbar">
      <NuxtLink to="/" class="brand-mark">MOTO<em>//</em>OPS</NuxtLink>
      <div class="flex items-center gap-2">
        <LocaleSwitcher />
        <UColorModeButton class="topbar-icon-button" aria-label="Toggle color mode" />
        <NuxtLink v-if="loggedIn" to="/dashboard" class="button-primary">{{ t('common.openDashboard') }}</NuxtLink>
        <NuxtLink v-else to="/login" class="button-primary">{{ t('login.submit') }}</NuxtLink>
      </div>
    </header>
    <main class="flex flex-1 flex-col">
      <slot />
    </main>
  </div>
</template>
