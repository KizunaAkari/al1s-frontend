<script setup lang="ts">
import HelpHint from './HelpHint.vue'
defineProps<{ eyebrow?: string; title: string; description?: string }>()
</script>

<template>
  <header class="page-heading">
    <div>
      <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
      <h2>{{ title }} <HelpHint v-if="description" :subject="title" :content="description" /></h2>
    </div>
    <div class="page-heading__actions"><slot /></div>
  </header>
</template>
