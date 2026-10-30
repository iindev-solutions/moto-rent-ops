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

const credit = computed(() => photoCredit(props.photoUrl))
</script>

<template>
  <div
    class="relative overflow-hidden bg-[var(--ink)]"
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
    <a
      v-if="credit && size === 'hero' && !failed"
      :href="credit.sourceUrl"
      target="_blank"
      rel="noopener noreferrer"
      class="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-[10px] leading-tight text-white/80 underline decoration-white/30 underline-offset-2 hover:text-white"
    >
      Photo: {{ credit.author }} · {{ credit.license }}
    </a>
    <div v-if="!photoUrl || failed" class="flex size-full flex-col items-center justify-center gap-1 text-[var(--surface)]">
      <UIcon name="i-lucide-bike" :class="size === 'hero' ? 'size-10 text-white/35' : 'size-5 text-white/50'" />
      <span v-if="size === 'hero'" class="font-mono text-xs font-bold uppercase tracking-[0.14em] text-white/60">{{ assetCode }}</span>
    </div>
  </div>
</template>
