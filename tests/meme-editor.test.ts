import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MemeTemplateEditor from '../src/modules/bots/memes/MemeTemplateEditor.vue'

const api = vi.hoisted(() => ({ saveTemplate: vi.fn(), preview: vi.fn(), readAsset: vi.fn(), uploadAsset: vi.fn() }))
vi.mock('../src/shared/api/memes', async original => ({
  ...await original<typeof import('../src/shared/api/memes')>(), ...api,
}))
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); api.preview.mockResolvedValue(new Blob(['png'])) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('disables editing while the template save is in flight', async () => {
  let complete!: (value: unknown) => void
  api.saveTemplate.mockReturnValue(new Promise(resolve => { complete = resolve }))
  const wrapper = mount(MemeTemplateEditor, { props: { template: null } })
  await wrapper.findAll('button').find(button => button.text() === '保存模板')!.trigger('click')
  expect(wrapper.find('fieldset').attributes('disabled')).toBeDefined()
  complete({})
  await flushPromises()
  wrapper.unmount()
})

it('restoring examples discards a late FileReader result from an older test-avatar selection', async () => {
  const delayed: { result: string; onload?: () => void }[] = []
  class Reader {
    result = ''; onload?: () => void; onerror?: () => void
    readAsDataURL(blob: Blob) {
      if (blob instanceof File) delayed.push(this)
      else { this.result = 'data:image/png;base64,U0FNUExF'; queueMicrotask(() => this.onload?.()) }
    }
  }
  vi.stubGlobal('FileReader', Reader)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['sample']))))
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const wrapper = mount(MemeTemplateEditor, { props: { template: null } })
  const input = wrapper.get('input[multiple]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [new File(['avatar'], 'old.png', { type: 'image/png' })] })
  await input.trigger('change')
  await wrapper.findAll('button').find(button => button.text() === '恢复样例')!.trigger('click')
  delayed[0]!.result = 'data:image/png;base64,T0xE'; delayed[0]!.onload?.()
  await flushPromises()
  await vi.advanceTimersByTimeAsync(300)
  await flushPromises()
  expect(api.preview.mock.calls.at(-1)?.[0].avatars).not.toContain('T0xE')
  wrapper.unmount()
})
