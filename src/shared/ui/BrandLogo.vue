<script setup lang="ts">
defineProps<{ light?: boolean }>()
</script>
<template>
  <svg class="brand-logo" :class="{ 'brand-logo--light': light }" viewBox="0 0 600 190" role="img" aria-label="AL-1S">
    <title>AL-1S</title>
    <g class="brand-ink">
      <path d="M18 174 59 124 102 101 53 174ZM109 97 132 64 163 174H128Z" />
      <path d="m174 174 30-103 39-33h10l-31 117ZM187 174l46-25h94l-27 25Z" />
      <path d="M505 44h-83c-39 0-59 20-62 49-2 19 10 30 31 30h48c11 0 15 5 11 14-3 8-9 11-19 11h-62l-28 26h93c34 0 54-12 65-39 11-29-1-44-29-44h-46c-9 0-13-4-10-11 2-7 8-10 18-10h46Z" transform="translate(45 0)" />
    </g>
    <g fill="#31b4f4">
      <path d="m58 122 77-110 12 43-49 64-42 21Z" />
      <path d="m278 106 12-25h49l-12 25ZM350 174l29-105h-25l3-9 37-31h36l-41 145Z" />
      <path d="m520 44-27 26h19l27-26ZM386 148l-28 26h20l28-26Z" />
      <path d="M59 36C24 51 40 65 87 54c-35 5-44-1-16-14C94 28 137 14 157 15c25 0 1 17-26 31 39-15 66-37 39-40C145 3 89 22 59 36Z" />
    </g>
  </svg>
</template>
<style scoped>
.brand-logo { width: 170px; max-width: 100%; height: auto; display: block; }
.brand-ink { fill: #174474; }
.brand-logo--light .brand-ink { fill: #f6fbff; }
</style>
