<script setup lang="ts">
import { computed } from 'vue'

import { statusLabel, statusTone } from '../presentation/status'

const props = defineProps<{ value: string | null | undefined }>()
const tone = computed(() => statusTone(props.value))
</script>

<template>
  <span class="status-badge" :class="`status-badge--${tone}`">{{ statusLabel(value) }}</span>
</template>
