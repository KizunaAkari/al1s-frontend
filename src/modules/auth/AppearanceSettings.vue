<script setup lang="ts">
import HelpHint from '../../shared/ui/HelpHint.vue'
import { ref } from 'vue'
import { ElAlert, ElButton } from 'element-plus'
import { apiClient } from '../../shared/api/client'
import defaultBackground from '../../assets/backgrounds/login-coast.png'

const image = ref('/api/v1/appearance/login-background')
const selected = ref<File>()
const busy = ref(false)
const error = ref('')
const notice = ref('')
const allowed = ['image/png', 'image/jpeg', 'image/webp']

function fallback() { image.value = defaultBackground }
function choose(event: Event) {
  const input = event.target as HTMLInputElement
  selected.value = input.files?.[0]
  error.value = ''
  notice.value = ''
}
async function upload() {
  const file = selected.value
  if (!file || busy.value) return
  if (!allowed.includes(file.type) || !file.size || file.size > 8 * 1024 * 1024) {
    error.value = '请选择不超过 8 MiB 的 PNG、JPEG 或 WebP 图片。'
    return
  }
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await apiClient.put('/appearance/login-background', file, {
      headers: { 'Content-Type': file.type }, timeout: 30000,
    })
    image.value = `/api/v1/appearance/login-background?v=${Date.now()}`
    selected.value = undefined
    notice.value = '登录背景已更新；所有浏览器重新打开登录页即可看到新图片。'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '上传失败，请重试。'
  } finally { busy.value = false }
}
</script>

<template>
  <section class="appearance-settings">
    <h1>外观设置</h1>
    <h2>登录背景 <HelpHint subject="登录背景">全平台共用。支持 PNG、JPEG、WebP，最大 8 MiB。</HelpHint></h2>
    
    <img :src="image" alt="当前登录背景" @error="fallback" />
    <label>选择图片 <input type="file" accept="image/png,image/jpeg,image/webp" :disabled="busy" @change="choose" /></label>
    <p v-if="selected">待上传：{{ selected.name }}</p>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <ElAlert v-if="notice" :title="notice" type="success" :closable="false" />
    <ElButton type="primary" :loading="busy" :disabled="!selected" @click="upload">上传背景</ElButton>
  </section>
</template>

<style scoped>
.appearance-settings { display: grid; gap: 14px; max-width: 900px; }
.appearance-settings > :deep(.el-button) { justify-self: start; }
.appearance-settings h1, .appearance-settings h2, .appearance-settings p { margin: 0; }
.appearance-settings label { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; }
.appearance-settings input { max-width: 100%; }
.appearance-settings img { width: 100%; max-height: 460px; object-fit: cover; border-radius: 12px; }
</style>
