<script setup lang="ts">
const { locale, setLocale } = useLocale()
</script>

<template>
  <div class="locale-switch" role="group" aria-label="Language">
    <button
      type="button"
      :class="{ 'is-active': locale === 'en' }"
      :aria-pressed="locale === 'en'"
      @click="setLocale('en')"
    >
      EN
    </button>
    <button
      type="button"
      :class="{ 'is-active': locale === 'vi' }"
      :aria-pressed="locale === 'vi'"
      @click="setLocale('vi')"
    >
      VI
    </button>
  </div>
</template>
