<script setup lang="ts">
const route = useRoute()
const { fetch: refreshSession } = useUserSession()
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
    errorMessage.value = 'Неверный email или пароль.'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center px-4 py-10">
    <section class="brutal-dark w-full max-w-md p-6 sm:p-10">
      <NuxtLink to="/" class="font-mono text-sm font-black tracking-[0.18em]">MOTO<span class="text-[var(--signal)]">//</span>OPS</NuxtLink>
      <p class="mt-12 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--paper)]/60">Secure operations access</p>
      <h1 class="mt-3 text-4xl font-black tracking-[-0.06em] text-[var(--paper)]">Войти в систему</h1>
      <p class="mt-4 text-sm leading-6 text-[var(--paper)]/70">Доступ к карточкам байков, арендам и финансам защищён сессией и проверкой прав.</p>

      <form class="mt-8 space-y-4" @submit.prevent="submit">
        <div>
          <label for="email" class="mb-2 block font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--paper)]/70">Email</label>
          <UInput id="email" v-model="email" class="brutal-input" type="email" autocomplete="username" required />
        </div>
        <div>
          <label for="password" class="mb-2 block font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--paper)]/70">Пароль</label>
          <UInput id="password" v-model="password" class="brutal-input" type="password" autocomplete="current-password" required />
        </div>
        <p v-if="errorMessage" class="font-mono text-xs text-[var(--signal)]" role="alert">{{ errorMessage }}</p>
        <UButton class="brutal-button w-full justify-center" type="submit" :loading="pending">Войти</UButton>
      </form>
    </section>
  </div>
</template>
