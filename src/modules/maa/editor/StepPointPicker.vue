<script setup lang="ts">
import { computed, inject, onBeforeUnmount, useId } from 'vue'
import { ElButton } from 'element-plus'
import { regionPickerKey } from './region-picker-context'
const picker = inject(regionPickerKey, undefined)
const target = `#point-${useId().replace(/[^a-z0-9-]/gi, '-')}`
const request = { use: 'point' as const, title: '点击位置', target }
const active = computed(() => picker?.active.value?.target === target)
onBeforeUnmount(() => { if (active.value && picker) picker.active.value = undefined })
</script>
<template>
  <div v-if="picker" class="point-picker">
    <ElButton size="small" :disabled="picker.disabled.value" @click="picker.select(request, true)">截图取点</ElButton>
    <small v-if="active" role="status">在左侧截图上点击目标位置，坐标会自动回填。</small>
  </div>
</template>
<style scoped>
.point-picker { display:flex; align-items:center; flex-wrap:wrap; gap:8px; grid-column:1/-1; }
.point-picker small { color:var(--accent); font-size:12px; }
</style>
