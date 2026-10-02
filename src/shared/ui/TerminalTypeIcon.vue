<script setup lang="ts">
import linux from '../../assets/terminal/linux.svg'
import android from '../../assets/terminal/android.svg'
import { Monitor } from '@element-plus/icons-vue'
import { computed } from 'vue'
const props = defineProps<{ type: string }>()
const mask = computed(() => 'url("' + (props.type === 'linux' ? linux : android) + '")')
</script>
<template>
  <span class="terminal-type-icon" aria-hidden="true">
    <span v-if="type === 'linux' || type === 'android'" class="terminal-type-shape"
      :style="{ maskImage: mask }" />
    <Monitor v-else />
  </span>
</template>
<style scoped>
.terminal-type-icon { display:inline-flex; align-items:center; justify-content:center; width:42px; height:46px; flex:none; border-radius:10px; background:var(--el-color-primary-light-9); color:var(--el-color-primary); }
.terminal-type-shape,.terminal-type-icon svg { width:28px; height:28px; }
.terminal-type-shape { background:currentColor; mask-repeat:no-repeat; mask-size:contain; mask-position:center; }
</style>
