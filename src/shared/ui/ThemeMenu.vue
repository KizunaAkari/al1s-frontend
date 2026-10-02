<script setup lang="ts">
import { Monitor, Moon, Sunny } from '@element-plus/icons-vue'
import { ElDropdown, ElDropdownMenu, ElDropdownItem, ElIcon } from 'element-plus'
import { useThemeStore, type ThemePreference } from '../../app/theme'
const theme = useThemeStore()
const options: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: '跟随系统' }, { value: 'light', label: '浅色' }, { value: 'dark', label: '深色' },
]
</script>
<template>
  <ElDropdown trigger="click" @command="theme.setPreference">
    <button class="icon-button" aria-label="选择主题" type="button">
      <ElIcon :size="22"><Monitor v-if="theme.preference === 'system'" /><Moon v-else-if="theme.isDark" /><Sunny v-else /></ElIcon>
    </button>
    <template #dropdown><ElDropdownMenu>
      <ElDropdownItem v-for="option in options" :key="option.value" :command="option.value">
        {{ option.label }}{{ theme.preference === option.value ? ' ✓' : '' }}
      </ElDropdownItem>
    </ElDropdownMenu></template>
  </ElDropdown>
</template>
