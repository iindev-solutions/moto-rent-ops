<script setup lang="ts">
const { t } = useLocale()
const { loggedIn } = useUserSession()
</script>

<template>
  <div class="page-shell flex min-h-[100dvh] flex-col">
    <header class="landing-topbar">
      <NuxtLink to="/" class="landing-brand">
        <span class="landing-brand__mark">A. CHÂU</span>
        <span class="landing-brand__note">{{ t('lp.brandNote') }}</span>
      </NuxtLink>
      <div class="flex items-center gap-3">
        <NuxtLink
          :to="loggedIn ? '/dashboard' : '/login?returnTo=/dashboard'"
          class="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)] underline decoration-1 underline-offset-4 transition-colors hover:text-[var(--ink)]"
        >
          {{ loggedIn ? t('common.openDashboard') : t('lp.staffSignIn') }}
        </NuxtLink>
        <LocaleSwitcher />
        <UColorModeButton class="topbar-icon-button" aria-label="Toggle color mode" />
      </div>
    </header>
    <main class="flex flex-1 flex-col">
      <slot />
    </main>
  </div>
</template>
