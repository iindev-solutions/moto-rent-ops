<script setup lang="ts">
/**
 * Motorcycle photo with a deterministic placeholder.
 *
 * Real photos are optional (`photoUrl`); until they exist the placeholder shows
 * the asset code, which is what distinguishes two bikes of the same model.
 */
const props = withDefaults(defineProps<{
  photoUrl?: string | null
  assetCode: string
  model: string
  size?: 'thumb' | 'hero'
}>(), { photoUrl: null, size: 'thumb' })

const failed = ref(false)
watch(() => props.photoUrl, () => { failed.value = false })
</script>

<template>
  <div
    class="overflow-hidden bg-[var(--ink)]"
    :class="size === 'hero' ? 'h-40 w-full sm:h-56' : 'size-14 shrink-0 rounded-md'"
  >
    <img
      v-if="photoUrl && !failed"
      :src="photoUrl"
      :alt="`${model} · ${assetCode}`"
      class="size-full object-cover"
      loading="lazy"
      @error="failed = true"
    >
    <div v-else class="flex size-full flex-col items-center justify-center gap-1 text-[var(--surface)]">
      <UIcon name="i-lucide-bike" :class="size === 'hero' ? 'size-10 text-white/35' : 'size-5 text-white/50'" />
      <span v-if="size === 'hero'" class="font-mono text-xs font-bold uppercase tracking-[0.14em] text-white/60">{{ assetCode }}</span>
    </div>
  </div>
</template>
