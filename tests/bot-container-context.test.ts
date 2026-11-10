import { flushPromises, mount } from '@vue/test-utils'
import { ElButton, ElMessageBox } from 'element-plus'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import BotContainers from '../src/modules/bots/BotContainers.vue'
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('../src/shared/api/client', () => ({ apiClient: api }))
const running = { running: true, status: 'running', health: 'healthy', revision: 'r1', started_at: null }
let wrapper: ReturnType<typeof mount> | undefined
beforeEach(() => { vi.resetAllMocks(); api.get.mockResolvedValue({ data: running }) })
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks() })
async function view() {
  wrapper = mount(BotContainers, { props: { alias: 'qq', showOnline: false } })
  await flushPromises()
  return wrapper
}
function stop(page: ReturnType<typeof mount>) { return page.findAllComponents(ElButton).find(button => button.text() === '停止')! }

it('colors container and health values independently for confirmed, abnormal, and unknown states', async () => {
  const style = document.createElement('style')
  style.textContent = readFileSync('src/modules/bots/bot-console.css', 'utf8')
  document.head.append(style)
  const host = document.createElement('div')
  host.className = 'bot-console'
  document.body.append(host)
  let complete!: (value: unknown) => void
  api.get.mockReturnValueOnce(new Promise(resolve => { complete = resolve }))
  try {
    wrapper = mount(BotContainers, { props: { alias: 'qq', showOnline: false }, attachTo: host })
    await flushPromises()
    const values = () => wrapper!.findAll('.bot-status-grid strong')
    const check = (labels: string[], colors: string[]) => {
      expect(values().map(value => value.text())).toEqual(labels)
      expect(values().map(value => getComputedStyle(value.element).color)).toEqual(colors)
    }
    const refresh = async () => {
      await wrapper!.findAllComponents(ElButton).find(button => button.text() === '刷新状态')!.trigger('click')
      await flushPromises()
    }
    check(['未知', '检查中'], ['#956e00', '#956e00'])
    complete({ data: running })
    await flushPromises()
    check(['运行中', '正常'], ['#16a36a', '#16a36a'])
    api.get.mockResolvedValueOnce({ data: { ...running, running: false, status: 'exited', health: 'unhealthy' } })
    await refresh()
    check(['已停止', '异常'], ['#bd3838', '#bd3838'])
    api.get.mockResolvedValueOnce({ data: { ...running, status: 'restarting', health: 'starting' } })
    await refresh()
    check(['重启中', '检查中'], ['#956e00', '#956e00'])
    api.get.mockResolvedValueOnce({ data: { ...running, health: 'not_configured' } })
    await refresh()
    check(['运行中', '未配置'], ['#16a36a', '#956e00'])
    api.get.mockResolvedValueOnce({ data: { ...running, health: 'unknown' } })
    await refresh()
    check(['运行中', '未知'], ['#16a36a', '#956e00'])
    api.get.mockRejectedValueOnce(new Error('offline'))
    await refresh()
    check(['未知', '未知'], ['#956e00', '#956e00'])
    wrapper.unmount()
    document.documentElement.classList.add('dark')
    api.get.mockRejectedValueOnce(new Error('offline'))
    wrapper = mount(BotContainers, { props: { alias: 'qq', showOnline: false }, attachTo: host })
    await flushPromises()
    check(['未知', '未知'], ['#e8be51', '#e8be51'])
    api.get.mockResolvedValueOnce({ data: { ...running, health: 'unhealthy' } })
    await refresh()
    check(['运行中', '异常'], ['#48d7a2', '#ff7474'])
  } finally {
    document.documentElement.classList.remove('dark')
    style.remove()
    host.remove()
  }
})

it('does not act on a different target after the platform changes during confirmation', async () => {
  let confirm!: (value: never) => void
  vi.spyOn(ElMessageBox, 'confirm').mockReturnValue(new Promise(resolve => { confirm = resolve }))
  const page = await view()
  await stop(page).trigger('click')
  await page.setProps({ alias: 'discord' })
  await flushPromises()
  confirm('confirm' as never)
  await flushPromises()
  expect(api.post).not.toHaveBeenCalled()
})

it('ignores an old operation result after another platform has loaded', async () => {
  let complete!: (value: unknown) => void
  vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
  api.post.mockReturnValue(new Promise(resolve => { complete = resolve }))
  const page = await view()
  await stop(page).trigger('click')
  await flushPromises()
  expect(api.post).toHaveBeenCalledWith('/bots/containers/qq', { action: 'stop', revision: 'r1' }, expect.any(Object))
  await page.setProps({ alias: 'discord' })
  await flushPromises()
  complete({ data: { ...running, running: false, status: 'exited', revision: 'old-result' } })
  await flushPromises()
  expect(page.text()).toContain('运行中')
  expect(page.emitted('state')?.at(-1)?.[0]).toEqual({ alias: 'discord', state: running })
})

it('does not publish a late status read from the previous platform', async () => {
  let complete!: (value: unknown) => void
  api.get.mockReturnValueOnce(new Promise(resolve => { complete = resolve })).mockResolvedValue({ data: running })
  wrapper = mount(BotContainers, { props: { alias: 'qq', showOnline: false } })
  await wrapper.setProps({ alias: 'discord' })
  await flushPromises()
  complete({ data: { ...running, running: false, status: 'exited' } })
  await flushPromises()
  expect(wrapper.emitted('state')?.at(-1)?.[0]).toEqual({ alias: 'discord', state: running })
})
