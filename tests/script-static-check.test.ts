import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'
import ScriptStaticCheck from '../src/modules/maa/editor/ScriptStaticCheck.vue'
import type { MaaScript } from '../src/shared/api/maa'

const post = vi.hoisted(() => vi.fn())
vi.mock('../src/shared/api/client', () => ({ apiClient: { post } }))
beforeEach(() => post.mockReset())
const script = { script_id: 'script', current_version_id: 'saved' } as MaaScript
it('checks the exact saved version without changing it', async () => {
  post.mockResolvedValue({ data: { status: 'passed', executor_version: 'v2.2', issues: [] } })
  const wrapper = mount(ScriptStaticCheck, { props: { script, disabled: false } })
  await wrapper.find('button').trigger('click'); await flushPromises()
  expect(post.mock.calls[0]?.slice(0, 2)).toEqual(['/maa/scripts/script/static-check', { candidate_version_id: 'saved' }])
  expect(wrapper.text()).toContain('静态检查通过')
  expect(wrapper.emitted('busy')).toEqual([[true], [false]])
  wrapper.unmount()
})
it('reuses the request key after an unknown response', async () => {
  post.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ data: {
    status: 'failed', executor_version: 'v2.2', issues: [{ pointer: '/steps/0', message: 'missing template' }],
  } })
  const wrapper = mount(ScriptStaticCheck, { props: { script, disabled: false } })
  await wrapper.find('button').trigger('click'); await flushPromises()
  await wrapper.find('button').trigger('click'); await flushPromises()
  expect(post.mock.calls[0]?.[2]).toEqual(post.mock.calls[1]?.[2])
  expect(wrapper.text()).toContain('/steps/0：missing template')
  wrapper.unmount()
})
it('does not check unsaved edits or versions without a candidate', async () => {
  const wrapper = mount(ScriptStaticCheck, { props: { script, disabled: true } })
  await wrapper.find('button').trigger('click')
  expect(post).not.toHaveBeenCalled()
  wrapper.unmount()
})
