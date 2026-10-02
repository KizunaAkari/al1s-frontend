<script setup lang="ts">
import { inject, onBeforeUnmount, ref, watch } from 'vue'
import { regionPreviewsKey } from './use-region-previews'

const props = defineProps<{ scriptId: string; versionId?: string; blobId?: string; emptyText?: string; description?: string }>()
const previews = inject(regionPreviewsKey, undefined)
const host = ref<HTMLElement>()
const url = ref('')
const failed = ref(false)
let observer: IntersectionObserver | undefined
let generation = 0

function reset() {
  generation++
  url.value = ''
  failed.value = false
  observer?.disconnect()
  if (!props.blobId || !host.value) return
  if (typeof IntersectionObserver === 'undefined') { void load(); return }
  observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      observer?.disconnect()
      void load()
    }
  })
  observer.observe(host.value)
}

async function load() {
  if (!props.blobId) return
  const token = ++generation
  const preview = await previews?.load({ $blob: props.blobId })
  if (token !== generation) return
  url.value = preview ?? ''
  failed.value = !preview
}

watch([() => props.scriptId, () => props.versionId, () => props.blobId, host], reset, { flush: 'post' })
onBeforeUnmount(() => { observer?.disconnect(); generation++ })
</script>

<template>
  <div ref="host" class="node-image" :aria-label="description || '识别图片预览'">
    <img v-if="url" :src="url" :alt="description || '本步骤识别图片'" />
    <span v-else>{{ failed ? versionId ? '图片读取失败' : '图片尚未保存' : blobId ? '读取识别图片…' : emptyText || '未绑定识别图片' }}</span>
  </div>
</template>

<style scoped>
.node-image { display:flex; align-items:center; justify-content:center; width:100%; height:64px; overflow:hidden; border:1px solid var(--border); border-radius:6px; background:var(--surface-soft); }
.node-image img { display:block; max-width:100%; max-height:100%; object-fit:contain; }
.node-image span { color:var(--muted); font-size:11px; }
</style>
