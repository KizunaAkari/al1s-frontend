<script setup lang="ts">
import { ElAlert, ElButton, ElEmpty, ElSkeleton } from 'element-plus'

import type { ApiError } from '../api/client'

defineProps<{
  loading: boolean
  loaded: boolean
  empty: boolean
  error: ApiError | null
  emptyTitle?: string
}>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <ElSkeleton v-if="loading && !loaded" :rows="4" animated />
  <ElAlert v-else-if="error && (!loaded || empty)" type="error" :closable="false" show-icon>
    <template #title>{{ error.message }}</template>
    <p class="error-meta">错误码：{{ error.code }}<template v-if="error.requestId"> · 请求：{{ error.requestId }}</template></p>
    <ElButton size="small" @click="$emit('retry')">重试</ElButton>
  </ElAlert>
  <ElEmpty v-else-if="empty" :description="emptyTitle ?? '暂无数据'" :image-size="72" />
  <slot v-else />
</template>
