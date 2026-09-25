<script setup lang="ts">
const route = useRoute()
const { fetch: refreshSession } = useUserSession()
const { t } = useLocale()
const email = ref('')
const password = ref('')
const pending = ref(false)
const errorMessage = ref('')

const returnTo = computed(() => {
  const value = route.query.returnTo
  return typeof value === 'string' && /^\/b\/[A-Za-z0-9-]+$/.test(value) ? value : '/'
})

async function submit() {
  pending.value = true
  errorMessage.value = ''

  try {
    const response = await $fetch<{ returnTo: string }>('/api/auth/login', {
      method: 'POST',
      body: { email: email.value, password: password.value, returnTo: returnTo.value },
    })
    await refreshSession()
    await navigateTo(response.returnTo)
  } catch {
    errorMessage.value = t('login.error')
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="page-shell flex items-center justify-center px-4 py-10">
    <section class="surface-dark w-full max-w-md p-6 sm:p-10">
      <div class="flex items-center justify-between gap-4">
        <NuxtLink to="/" class="brand-mark text-[var(--surface)]">MOTO<em>//</em>OPS</NuxtLink>
        <LocaleSwitcher />
      </div>
      <p class="eyebrow mt-14 text-white/50">{{ t('login.eyebrow') }}</p>
      <h1 class="mt-3 text-4xl font-extrabold tracking-[-0.06em] text-[var(--surface)]">{{ t('login.title') }}</h1>
      <p class="mt-4 text-sm leading-6 text-white/65">{{ t('login.subtitle') }}</p>

      <form class="mt-8 space-y-4" @submit.prevent="submit">
        <div>
          <label for="email" class="mb-2 block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-white/60">{{ t('login.email') }}</label>
          <UInput id="email" v-model="email" class="brutal-input" type="email" autocomplete="username" required />
        </div>
        <div>
          <label for="password" class="mb-2 block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-white/60">{{ t('login.password') }}</label>
          <UInput id="password" v-model="password" class="brutal-input" type="password" autocomplete="current-password" required />
        </div>
        <p v-if="errorMessage" class="font-mono text-xs text-[var(--signal)]" role="alert">{{ errorMessage }}</p>
        <UButton class="button-primary w-full justify-center" type="submit" :loading="pending">{{ t('login.submit') }}</UButton>
      </form>
    </section>
  </div>
</template>
