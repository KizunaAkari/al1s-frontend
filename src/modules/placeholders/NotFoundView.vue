<script setup lang="ts">
import { ElButton, ElResult } from 'element-plus'
</script>

<template>
  <ElResult icon="warning" title="页面不存在" sub-title="这个地址没有对应的平台模块。">
    <template #extra><RouterLink to="/"><ElButton type="primary">返回系统概览</ElButton></RouterLink></template>
  </ElResult>
</template>
