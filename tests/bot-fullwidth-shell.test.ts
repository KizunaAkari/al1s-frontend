import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent } from 'vue'
import { expect, it } from 'vitest'
import App from '../src/app/App.vue'

it('keeps Bot content in the platform shell and supports the mobile navigation entry', async () => {
  const BotPage = defineComponent({ emits: ['platform-navigation'], template: '<button data-platform-navigation @click="$emit(\'platform-navigation\')">Bot 管理</button>' })
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/bots', component: BotPage }, { path: '/', component: { template: '<p>系统概览</p>' } },
    { path: '/:pathMatch(.*)*', component: { template: '<p>平台页面</p>' } },
    { path: '/:pathMatch(.*)*', component: { template: '<p>平台页面</p>' } },
  ] })
  await router.push('/bots'); await router.isReady()
  const page = mount(App, { global: { plugins: [createPinia(), router], stubs: { ThemeMenu: true, BrandLogo: true } } })
  await flushPromises()
  expect(page.get('.app-shell').classes()).toContain('bot-console-page')
  await page.get('[data-platform-navigation]').trigger('click')
  expect(page.get('.app-sidebar').classes()).toContain('is-open')
  await page.get('[aria-label="关闭导航"]').trigger('click')
  expect(page.get('.app-sidebar').classes()).not.toContain('is-open')
  await router.push('/'); await flushPromises()
  expect(page.get('.app-shell').classes()).not.toContain('bot-console-page')
  page.unmount()
})
