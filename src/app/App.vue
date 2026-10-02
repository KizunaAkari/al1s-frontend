<script setup lang="ts">
import { Bell, ChatDotRound, Connection, Monitor, Operation, User, Menu } from '@element-plus/icons-vue'
import { ElDropdown, ElDropdownMenu, ElDropdownItem, ElIcon, ElMessage } from 'element-plus'
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiClient } from '../shared/api/client'
import ThemeMenu from '../shared/ui/ThemeMenu.vue'
import BrandLogo from '../shared/ui/BrandLogo.vue'
import './redesign.css'
import { useThemeStore } from './theme'
import { clearEditorResume, readEditorResume } from '../modules/maa/editor/editor-resume'
const theme = useThemeStore()
const route = useRoute()
const editorRoute = computed(() => route.path === '/editor')
const compactNav = ref(editorRoute.value)
watch(editorRoute, value => { compactNav.value = value })
const router = useRouter()
const menuOpen = ref(false)
const leaving = ref(false)
async function logout() {
  if (leaving.value) return
  leaving.value = true
  try { await apiClient.post('/auth/logout'); clearEditorResume(); await router.replace('/login') }
  catch { ElMessage.error('退出失败，请重试') }
  finally { leaving.value = false }
}
function accountCommand(command: string) {
  if (command === 'appearance') void router.push('/appearance')
  else if (command === 'components') { menuOpen.value = false; void router.push('/maintenance/components') }
  else if (command === 'storage') void router.push('/maintenance/storage')
  else if (command === 'logout') void logout()
}
const navigation = [
  { to: '/', label: '系统概览', icon: Monitor },
  { to: '/terminals', label: '终端管理', icon: Connection },
  { to: '/tasks', label: '任务中心', icon: Operation },
  { to: '/lineup', label: '阵容识别', icon: Menu },
  { to: '/editor', label: 'Maa 编辑工作台', icon: Monitor },
  { to: '/notifications', label: '通知设置', icon: Bell },
  { to: '/bots', label: 'Bot 管理', icon: ChatDotRound },
]
const editorDestination = computed(() => {
  void route.fullPath
  const resume = readEditorResume()
  return resume ? { path: '/editor', query: { script_id: resume.scriptId, step: String(resume.step) } } : '/editor'
})
</script>
<template>
  <RouterView v-if="route.path === '/login'" />
  <div v-else class="app-shell" :class="{ 'compact-nav': compactNav, 'editor-page': editorRoute }">
    <button v-if="menuOpen" class="nav-scrim" aria-label="关闭导航" @click="menuOpen = false" />
    <aside class="app-sidebar" :class="{ 'is-open': menuOpen }">
      <RouterLink class="brand" to="/" aria-label="AL-1S 系统概览" @click="menuOpen = false"><img v-if="compactNav" src="/favicon.svg" alt="AL-1S" class="compact-brand" /><BrandLogo v-else :light="theme.isDark" /></RouterLink>
      <button v-if="editorRoute" class="icon-button sidebar-expand" :aria-label="compactNav ? '展开导航' : '折叠导航'" @click="compactNav = !compactNav">{{ compactNav ? '›' : '‹' }}</button>
      <nav class="app-nav" aria-label="主导航">
        <RouterLink v-for="item in navigation" :key="item.to" :to="item.to === '/editor' ? editorDestination : item.to" :title="item.label" :aria-label="item.label" @click="menuOpen = false">
          <ElIcon><component :is="item.icon" /></ElIcon><span>{{ item.label }}</span>
        </RouterLink>
      </nav>
      <div class="sidebar-foot"><ElDropdown trigger="click" @command="accountCommand">
        <button class="account-button" :disabled="leaving"><ElIcon><User /></ElIcon>管理员 <span>›</span></button>
        <template #dropdown><ElDropdownMenu><ElDropdownItem command="appearance">外观设置</ElDropdownItem><ElDropdownItem command="components">组件管理</ElDropdownItem><ElDropdownItem command="storage">平台存储维护</ElDropdownItem><ElDropdownItem command="logout" :disabled="leaving">退出登录</ElDropdownItem></ElDropdownMenu></template>
      </ElDropdown></div>
    </aside>
    <main class="app-main">
      <header class="app-header">
        <button class="icon-button nav-toggle" aria-label="打开导航" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen"><ElIcon><Menu /></ElIcon></button>
        <div v-if="editorRoute" id="editor-shell-header" class="editor-shell-header" />
        <div class="header-tools"><ThemeMenu /></div>
      </header>
      <section class="app-content"><RouterView /></section>
    </main>
  </div>
</template>
