<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <article class="panel">
    <p class="eyebrow">MODULE BOUNDARY</p>
    <h2>{{ title }}</h2>
    <p role="status">此模块暂未接入。</p>
  </article>
</template>
