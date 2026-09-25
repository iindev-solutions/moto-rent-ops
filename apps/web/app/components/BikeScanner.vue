<script setup lang="ts">
import type { ReaderOptions } from 'zxing-wasm/reader'

const emit = defineEmits<{
  close: []
  found: [value: string]
}>()

type BrowserBarcodeDetector = {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>>
}

type BrowserBarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BrowserBarcodeDetector
type WasmDecoder = (image: ImageData, options: ReaderOptions) => Promise<Array<{ text: string }>>
const video = ref<HTMLVideoElement | null>(null)
let canvas: HTMLCanvasElement | undefined
let nativeDetector: BrowserBarcodeDetector | null = null
let wasmDecoder: WasmDecoder | undefined
let lastScanAt = 0
const { t } = useLocale()
const active = ref(false)
const busy = ref(false)
const message = ref(t('scanner.idle'))
let stream: MediaStream | undefined
let animationFrame = 0

async function startCamera() {
  if (!import.meta.client || active.value) {
    return
  }

  busy.value = true
  message.value = t('scanner.requesting')

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' } },
    })

    if (!video.value) {
      throw new Error('Video element is unavailable')
    }

    video.value.srcObject = stream
    await video.value.play()

    const Detector = (window as Window & { BarcodeDetector?: BrowserBarcodeDetectorConstructor }).BarcodeDetector
    nativeDetector = Detector ? new Detector({ formats: ['qr_code'] }) : null
    if (!nativeDetector && !wasmDecoder) {
      const decoderModule = await import('zxing-wasm/reader')
      wasmDecoder = decoderModule.readBarcodes
    }

    active.value = true
    lastScanAt = 0
    message.value = t('scanner.aim')
    animationFrame = requestAnimationFrame(scanFrame)
  } catch {
    message.value = t('scanner.unavailable')
    stopCamera()
  } finally {
    busy.value = false
  }
}

async function scanFrame(timestamp = performance.now()) {
  if (!active.value || !video.value) {
    return
  }

  if (timestamp - lastScanAt < 200) {
    animationFrame = requestAnimationFrame(scanFrame)
    return
  }
  lastScanAt = timestamp

  try {
    const value = nativeDetector
      ? (await nativeDetector.detect(video.value))[0]?.rawValue
      : await readVideoWithWasm(video.value)

    if (value) {
      emit('found', value)
      stopCamera()
      return
    }
  } catch {
    message.value = t('scanner.readError')
  }

  animationFrame = requestAnimationFrame(scanFrame)
}

async function readVideoWithWasm(source: HTMLVideoElement) {
  if (!wasmDecoder) {
    return undefined
  }

  const frameCanvas = canvas ?? document.createElement('canvas')
  canvas = frameCanvas
  const scale = Math.min(1, 640 / Math.max(source.videoWidth, 1))
  frameCanvas.width = Math.max(1, Math.round(source.videoWidth * scale))
  frameCanvas.height = Math.max(1, Math.round(source.videoHeight * scale))
  const context = frameCanvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    return undefined
  }

  context.drawImage(source, 0, 0, frameCanvas.width, frameCanvas.height)
  const results = await wasmDecoder(context.getImageData(0, 0, frameCanvas.width, frameCanvas.height), {
    formats: ['QRCode'],
    maxNumberOfSymbols: 1,
    tryHarder: true,
  })

  return results[0]?.text
}

function stopCamera() {
  cancelAnimationFrame(animationFrame)
  stream?.getTracks().forEach(track => track.stop())
  stream = undefined
  nativeDetector = null
  active.value = false
  if (video.value) {
    video.value.srcObject = null
  }
}

function close() {
  stopCamera()
  emit('close')
}

onBeforeUnmount(stopCamera)
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-end justify-center bg-[var(--ink)]/70 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" :aria-label="t('scanner.title')">
    <section class="surface w-full max-w-2xl bg-[var(--surface)] p-5 sm:p-8">
      <div class="flex items-start justify-between gap-4 border-b border-[var(--line)] pb-5">
        <div>
          <p class="eyebrow">{{ t('scanner.eyebrow') }}</p>
          <h2 class="mt-2 text-3xl font-extrabold tracking-[-0.05em]">{{ t('scanner.title') }}</h2>
        </div>
        <div class="flex items-center gap-2">
          <LocaleSwitcher />
          <UButton class="shrink-0" icon="i-lucide-x" variant="ghost" :aria-label="t('scanner.close')" @click="close" />
        </div>
      </div>

      <div class="relative mt-6 aspect-[4/3] overflow-hidden border border-[var(--line-strong)] bg-[var(--ink)]">
        <video ref="video" class="size-full object-cover" autoplay muted playsinline />
        <div v-if="!active" class="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center text-[var(--surface)]">
          <UIcon name="i-lucide-scan-line" class="size-12 text-[var(--acid)]" />
          <p class="max-w-sm text-sm leading-6 text-white/65">{{ t('scanner.privacy') }}</p>
          <UButton class="button-primary" :loading="busy" @click="startCamera">{{ t('scanner.allow') }}</UButton>
        </div>
        <div v-else class="pointer-events-none absolute inset-[16%] border-2 border-[var(--acid)] shadow-[0_0_0_999px_rgba(17,17,15,0.28)]" />
      </div>

      <p class="mt-4 min-h-6 font-mono text-xs text-[var(--muted)]" aria-live="polite">{{ message }}</p>
      <div class="mt-6 flex flex-wrap gap-3">
        <UButton class="button-primary" icon="i-lucide-scan-line" :loading="busy" @click="startCamera">{{ active ? t('scanner.restart') : t('scanner.start') }}</UButton>
        <UButton class="button-secondary" @click="close">{{ t('scanner.manual') }}</UButton>
      </div>
    </section>
  </div>
</template>
