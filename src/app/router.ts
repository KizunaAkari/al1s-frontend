import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { apiClient } from '../shared/api/client'

const routes: RouteRecordRaw[] = [
  { path: '/lineup', name: 'lineup', component: () => import('../modules/lineup/LineupRecognitionView.vue'), meta: { title: '阵容识别' } },
  { path: '/login', component: () => import('../modules/auth/LoginView.vue'), meta: { title: '管理员登录' } },
  { path: '/appearance', component: () => import('../modules/auth/AppearanceSettings.vue'), meta: { title: '外观设置' } },
  { path: '/maintenance/storage', component: () => import('../modules/maintenance/StorageMaintenance.vue'), meta: { title: '平台存储维护' } },
  { path: '/maintenance/components', component: () => import('../modules/maintenance/ComponentManagement.vue'), meta: { title: '组件管理' } },
  {
    path: '/',
    name: 'overview',
    component: () => import('../modules/overview/OverviewView.vue'),
    meta: { title: '系统概览' },
  },
  {
    path: '/terminals',
    name: 'terminals',
    component: () => import('../modules/terminals/TerminalWorkbenchView.vue'),
    meta: { title: '终端管理' },
  },
  { path: '/tasks', redirect: '/tasks/history' },
  {
    path: '/tasks/history',
    name: 'task-history',
    component: () => import('../modules/tasks/TaskCenterView.vue'),
    meta: { title: '任务中心' },
  },
  {
    path: '/tasks/schedules',
    name: 'task-schedules',
    component: () => import('../modules/tasks/TaskCenterView.vue'),
    meta: { title: '任务中心' },
  },
  {
    path: '/scripts',
    name: 'maa-library',
    redirect: to => ({ path: '/editor', query: { ...to.query, library: '1' } }),
    meta: { title: 'Maa 脚本库' },
  },
  {
    path: '/editor',
    name: 'maa-editor',
    component: () => import('../modules/maa/editor/EditorWorkbenchView.vue'),
    meta: { title: 'Maa 编辑工作台' },
  },
  {
    path: '/notifications',
    component: () => import('../modules/notifications/NotificationSettings.vue'),
    meta: { title: '通知设置' },
  },
  {
    path: '/bots',
    component: () => import('../modules/bots/BotManagement.vue'),
    meta: { title: 'Bot 管理' },
  },
  {
    path: '/maintenance',
    redirect: to => ({ path: '/terminals', query: { ...to.query, panel: 'releases' } }),
    meta: { title: '系统维护' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('../modules/placeholders/NotFoundView.vue'),
    meta: { title: '页面不存在' },
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  if (to.path === '/login') return true
  try {
    await apiClient.get('/auth/session')
    return true
  } catch {
    return { path: '/login', query: { next: to.fullPath } }
  }
})
