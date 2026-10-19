<script setup lang="ts">
const route = useRoute()
const { t } = useLocale()
const { user, clear } = useUserSession()
const sidebarOpen = ref(false)
const userMenuOpen = ref(false)

const navGroups = [
  {
    labelKey: 'nav.workspace',
    items: [
      { labelKey: 'nav.overview', icon: 'i-lucide-layout-dashboard', to: '/dashboard', enabled: true },
      { labelKey: 'nav.rentOut', icon: 'i-lucide-key-round', to: '/rent', enabled: true },
      { labelKey: 'nav.returnBike', icon: 'i-lucide-undo-2', to: '/return', enabled: true },
      { labelKey: 'nav.fleet', icon: 'i-lucide-bike', to: '/bikes', enabled: true },
      { labelKey: 'nav.people', icon: 'i-lucide-users', to: '/people', enabled: true },
      { labelKey: 'nav.rentals', icon: 'i-lucide-file-signature', to: '/rentals', enabled: true },
    ],
  },
  {
    labelKey: 'nav.operations',
    items: [
      { labelKey: 'nav.finance', icon: 'i-lucide-landmark', to: '/finance', enabled: true },
      { labelKey: 'nav.documents', icon: 'i-lucide-folder-lock', to: '/documents', enabled: true },
      { labelKey: 'nav.maintenance', icon: 'i-lucide-wrench', to: '/maintenance', enabled: true },
      { labelKey: 'nav.incidents', icon: 'i-lucide-alert-triangle', to: '/incidents', enabled: true },
    ],
  },
] as const

const pageTitle = computed(() => {
  if (route.path.startsWith('/b/')) return t('bike.motorcycle')
  if (route.path.startsWith('/agreements')) return t('people.agreements')
  if (route.path.startsWith('/dashboard')) return t('nav.overview')
  if (route.path.startsWith('/bikes')) return t('fleet.title')
  if (route.path.startsWith('/people')) return t('people.title')
  if (route.path.startsWith('/finance')) return t('finance.title')
  if (route.path.startsWith('/rentals')) return t('rentals.title')
  if (route.path.startsWith('/rent')) return t('nav.rentOut')
  if (route.path.startsWith('/return')) return t('nav.returnBike')
  if (route.path.startsWith('/documents')) return t('documents.title')
  if (route.path.startsWith('/maintenance')) return t('maintenance.title')
  if (route.path.startsWith('/incidents')) return t('incidents.title')
  return t('nav.today')
})

async function signOut() {
  userMenuOpen.value = false
  await clear()
  await navigateTo('/login')
}
</script>

<template>
  <div class="app-frame">
    <aside class="app-sidebar" :class="{ 'is-open': sidebarOpen }">
      <div class="sidebar-brand-row">
        <NuxtLink to="/" class="brand-mark" @click="sidebarOpen = false">MOTO<em>//</em>OPS</NuxtLink>
        <UButton class="sidebar-close" icon="i-lucide-x" variant="ghost" :aria-label="t('nav.closeNav')" @click="sidebarOpen = false" />
      </div>

      <div class="workspace-switcher">
        <span class="workspace-avatar">M</span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-semibold">MOTO//OPS</span>
          <span class="block truncate text-[11px] text-[var(--text-muted)]">{{ t('app.workspace') }}</span>
        </span>
        <UIcon name="i-lucide-chevrons-up-down" class="size-3.5 text-[var(--text-muted)]" />
      </div>

      <nav class="app-nav" :aria-label="t('nav.mainNav')">
        <div v-for="group in navGroups" :key="group.labelKey" class="nav-group">
          <p class="nav-group-label">{{ t(group.labelKey) }}</p>
          <template v-for="item in group.items" :key="item.labelKey">
            <NuxtLink
              v-if="item.enabled"
              :to="item.to"
              class="nav-link"
              :class="{ 'is-active': route.path === item.to || route.path.startsWith(`${item.to}/`) }"
              @click="sidebarOpen = false"
            >
              <UIcon :name="item.icon" class="size-4" />
              <span>{{ t(item.labelKey) }}</span>
            </NuxtLink>
            <span v-else class="nav-link is-disabled" :aria-disabled="true">
              <UIcon :name="item.icon" class="size-4" />
              <span>{{ t(item.labelKey) }}</span>
              <span class="nav-link-badge">{{ t('nav.soon') }}</span>
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
          <LocaleSwitcher />
          <UColorModeButton class="topbar-icon-button" aria-label="Toggle color mode" />
          <div class="topbar-user">
            <button
              class="topbar-avatar"
              type="button"
              :aria-expanded="userMenuOpen"
              aria-haspopup="menu"
              :aria-label="t('common.account')"
              @click="userMenuOpen = !userMenuOpen"
            >
              {{ user?.name?.charAt(0) || 'U' }}
            </button>
            <template v-if="userMenuOpen">
              <div class="topbar-user-scrim" @click="userMenuOpen = false" />
              <div class="topbar-user-menu" role="menu">
                <div class="topbar-user-head">
                  <span class="user-avatar">{{ user?.name?.charAt(0) || 'U' }}</span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-semibold">{{ user?.name || 'User' }}</span>
                    <span class="block truncate text-[11px] text-[var(--text-muted)]">{{ user?.email || '' }}</span>
                    <span class="block truncate text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">{{ user?.role || 'operator' }}</span>
                  </span>
                </div>
                <button class="topbar-user-item" type="button" role="menuitem" @click="signOut">
                  <UIcon name="i-lucide-log-out" class="size-4" />
                  <span>{{ t('common.signOut') }}</span>
                </button>
              </div>
            </template>
          </div>
        </div>
      </header>
      <main class="app-main"><slot /></main>
    </div>
  </div>
</template>
