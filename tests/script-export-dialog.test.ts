import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'
import { ElSelect } from 'element-plus'
import ScriptExportDialog from '../src/modules/maa/ScriptExportDialog.vue'
import type { MaaScript } from '../src/shared/api/maa'
import { helpText } from './help-test-utils'

const get = vi.hoisted(() => vi.fn())
vi.mock('../src/shared/api/client', () => ({ apiClient: { get }, normalizeApiError: () => ({ message: '导出失败' }) }))
const script = { script_id: 'script', current_version_id: 'published', candidate_version_id: 'candidate' } as MaaScript
beforeEach(() => {
  get.mockReset()
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})
function view() { return mount(ScriptExportDialog, { props: { script }, global: { stubs: { ElDialog: { template: '<div><slot name="header" :title-id="\'dialog-title\'" :title-class="\'dialog-title\'"/><slot/><slot name="footer"/></div>' } } } }) }
it('describes export of the current saved version and matching import category', async () => {
  const wrapper = view()
  expect(await helpText(wrapper, '导出脚本归档')).toContain('当前已保存脚本')
  expect(wrapper.text()).not.toContain('导入后仍需测试、发布')
  wrapper.unmount()
})
it('requires explicit version and downloads that version', async () => {
  get.mockResolvedValue({ data: new Blob(['zip']) })
  const wrapper = view()
  const button = wrapper.findAll('button').find(b => b.text().includes('下载 ZIP'))!
  await button.trigger('click')
  expect(get).not.toHaveBeenCalled()
  wrapper.findComponent(ElSelect).vm.$emit('update:modelValue', 'published')
  await flushPromises(); await button.trigger('click'); await flushPromises()
  expect(get).toHaveBeenCalledWith('/maa/scripts/script/versions/published/archive', { responseType: 'blob', timeout: 180000 })
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce()
  wrapper.unmount()
})
it('ignores late response after script changes', async () => {
  let resolve!: (value: unknown) => void
  get.mockReturnValue(new Promise(r => { resolve = r }))
  const wrapper = view()
  wrapper.findComponent(ElSelect).vm.$emit('update:modelValue', 'published')
  await flushPromises()
  await wrapper.findAll('button').find(b => b.text().includes('下载 ZIP'))!.trigger('click')
  await wrapper.setProps({ script: { ...script, script_id: 'other' } })
  resolve({ data: new Blob(['zip']) }); await flushPromises()
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
  wrapper.unmount()
})
it('shows failure without starting an automatic retry', async () => {
  get.mockRejectedValue(new Error('offline'))
  const wrapper = view()
  wrapper.findComponent(ElSelect).vm.$emit('update:modelValue', 'published')
  await flushPromises()
  await wrapper.findAll('button').find(b => b.text().includes('下载 ZIP'))!.trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('导出失败')
  expect(get).toHaveBeenCalledOnce()
  wrapper.unmount()
})
