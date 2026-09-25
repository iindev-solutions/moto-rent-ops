<script setup lang="ts">
const route = useRoute()
const { t } = useLocale()
const { loggedIn, user, clear } = useUserSession()
const sidebarOpen = ref(false)

const navGroups = [
  {
    label: 'Workspace',
    items: [
      { label: 'Overview', icon: 'i-lucide-layout-dashboard', to: '/', enabled: true },
      { label: 'Fleet', icon: 'i-lucide-bike', to: '/bikes', enabled: false },
      { label: 'Rentals', icon: 'i-lucide-file-signature', to: '/rentals', enabled: false },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Finance', icon: 'i-lucide-landmark', to: '/finance', enabled: false },
      { label: 'Documents', icon: 'i-lucide-folder-lock', to: '/documents', enabled: false },
      { label: 'Maintenance', icon: 'i-lucide-wrench', to: '/maintenance', enabled: false },
    ],
  },
]

const pageTitle = computed(() => {
  if (route.path.startsWith('/b/')) return t('bike.motorcycle')
  return t('nav.today')
})

async function signOut() {
  await clear()
  await navigateTo('/login')
}
</script>

<template>
  <div class="app-frame">
    <aside class="app-sidebar" :class="{ 'is-open': sidebarOpen }">
      <div class="sidebar-brand-row">
        <NuxtLink to="/" class="brand-mark" @click="sidebarOpen = false">MOTO<em>//</em>OPS</NuxtLink>
        <UButton class="sidebar-close" icon="i-lucide-x" variant="ghost" aria-label="Close navigation" @click="sidebarOpen = false" />
      </div>

      <div class="workspace-switcher">
        <span class="workspace-avatar">M</span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-semibold">MOTO//OPS</span>
          <span class="block truncate text-[11px] text-[var(--text-muted)]">Hanoi workspace</span>
        </span>
        <UIcon name="i-lucide-chevrons-up-down" class="size-3.5 text-[var(--text-muted)]" />
      </div>

      <nav class="app-nav" aria-label="Main navigation">
        <div v-for="group in navGroups" :key="group.label" class="nav-group">
          <p class="nav-group-label">{{ group.label }}</p>
          <template v-for="item in group.items" :key="item.label">
            <NuxtLink
              v-if="item.enabled"
              :to="item.to"
              class="nav-link"
              :class="{ 'is-active': route.path === item.to }"
              @click="sidebarOpen = false"
            >
              <UIcon :name="item.icon" class="size-4" />
              <span>{{ item.label }}</span>
            </NuxtLink>
            <span v-else class="nav-link is-disabled" :aria-disabled="true">
              <UIcon :name="item.icon" class="size-4" />
              <span>{{ item.label }}</span>
              <span class="nav-link-badge">Soon</span>
            </span>
          </template>
        </div>
      </nav>

      <div class="sidebar-bottom">
        <div class="sidebar-status"><span class="status-dot" /> <span>{{ t('common.apiOnline') }}</span></div>
        <button class="user-chip" type="button" @click="signOut">
          <span class="user-avatar">{{ user?.name?.charAt(0) || 'U' }}</span>
          <span class="min-w-0 flex-1 text-left"><span class="block truncate text-xs font-semibold">{{ user?.name || 'User' }}</span><span class="block truncate text-[10px] text-[var(--text-muted)]">{{ user?.role || 'operator' }}</span></span>
          <UIcon name="i-lucide-log-out" class="size-3.5 text-[var(--text-muted)]" />
        </button>
      </div>
    </aside>

    <div v-if="sidebarOpen" class="sidebar-scrim" @click="sidebarOpen = false" />

    <div class="app-content">
      <header class="app-topbar">
        <div class="flex min-w-0 items-center gap-3">
          <UButton class="mobile-menu-button" icon="i-lucide-menu" variant="ghost" aria-label="Open navigation" @click="sidebarOpen = true" />
          <div class="breadcrumb"><span class="text-[var(--text-muted)]">MOTO//OPS</span><UIcon name="i-lucide-chevron-right" class="size-3.5" /><span class="truncate font-semibold">{{ pageTitle }}</span></div>
        </div>
        <div class="flex items-center gap-2">
          <UButton class="topbar-icon-button" icon="i-lucide-search" variant="ghost" aria-label="Search" />
          <LocaleSwitcher />
          <UColorModeButton class="topbar-icon-button" aria-label="Toggle color mode" />
          <span class="topbar-avatar">{{ user?.name?.charAt(0) || 'U' }}</span>
        </div>
      </header>
      <main class="app-main"><slot /></main>
    </div>
  </div>
</template>
