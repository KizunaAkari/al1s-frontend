import { flushPromises, mount } from '@vue/test-utils'
import { ElButton, ElMessageBox } from 'element-plus'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
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
