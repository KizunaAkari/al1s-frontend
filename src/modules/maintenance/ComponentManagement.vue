<script setup lang="ts">
import PlatformHealth from '../../shared/ui/PlatformHealth.vue'
import { ref } from 'vue'
import { ElButton } from 'element-plus'
import ComponentInventory from './ComponentInventory.vue'
import ComponentVersionLibrary from './ComponentVersionLibrary.vue'
import ComponentOperationHistory from './ComponentOperationHistory.vue'
import ComponentUpgradeDialog from './ComponentUpgradeDialog.vue'
import LinuxReleases from '../terminals/LinuxReleases.vue'
import type { InventoryEntry } from '../../shared/api/components'
const tab = ref('inventory'), selected = ref<InventoryEntry | null>(null), inventoryKey = ref(0)
</script>

<template>
  <section class="component-management">
    <h1>组件管理</h1>
    <PlatformHealth />
    <nav class="component-tabs" aria-label="组件管理分组"><ElButton v-for="[key,label] in [['inventory','运行版本'],['versions','版本库'],['history','升级记录与恢复'],['legacy','旧Linux版本入口']]" :key="key" :type="tab === key ? 'primary' : 'default'" @click="tab = key!">{{ label }}</ElButton></nav>
    <ComponentInventory v-if="tab === 'inventory'" :key="inventoryKey" @upgrade="row => selected = row" />
    <ComponentVersionLibrary v-else-if="tab === 'versions'" />
    <ComponentOperationHistory v-else-if="tab === 'history'" />
    <LinuxReleases v-else />
    <ComponentUpgradeDialog :row="selected" @close="selected = null" @changed="inventoryKey++" />
  </section>
</template>

<style scoped>
.component-management { min-width: 0; }
h1 { margin: 0 0 20px; font-size: 28px; }
.component-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:24px 0}.component-management{display:grid;gap:18px}.component-tabs .el-button{margin:0}
</style>
