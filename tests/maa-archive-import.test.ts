import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ElButton } from 'element-plus'

const post = vi.hoisted(() => vi.fn())
const get = vi.hoisted(() => vi.fn())
vi.mock('../src/shared/api/client', async importOriginal => ({
  ...await importOriginal<typeof import('../src/shared/api/client')>(), apiClient: { post, get },
}))
import MaaArchiveImport from '../src/modules/maa/MaaArchiveImport.vue'

const id = '00000000-0000-4000-8000-000000000001'
const operation = { operation_id: id, state: 'executing', row_version: 1,
  error_code: null, deadline: '2026-09-25T00:05:00Z', can_cancel: true }
const batch = { batch_id: id, logical_sha256: 'logical-hash', archive_sha256: 'archive-hash',
  archive_schema: 'al1s-script-archive/v1', status: 'completed', script_count: 1,
  application_count: 1, resource_reference_count: 0, unique_resource_count: 0,
  error_code: null, diagnostic: null, created_at: '2026-09-25T00:00:00Z',
  completed_at: '2026-09-25T00:00:01Z', row_version: 2 }

function mounted() { return mount(MaaArchiveImport, { global: { stubs: ['RouterLink'] } }) }
function button(wrapper: ReturnType<typeof mounted>, label: string) {
  return wrapper.findAllComponents(ElButton).find(value => value.text() === label)!
}
async function selectFile(wrapper: ReturnType<typeof mounted>, file: File) {
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
  await input.trigger('change')
}
afterEach(() => {
  post.mockReset(); get.mockReset(); sessionStorage.clear(); vi.useRealTimers()
})

it('rejects invalid files before upload', async () => {
  const wrapper = mounted()
  try {
    await selectFile(wrapper, new File(['json'], 'script.json'))
    expect(wrapper.text()).toContain('不接受任意 JSON')
    await selectFile(wrapper, new File([], 'empty.zip'))
    expect(wrapper.text()).toContain('不能为空')
    expect(post).not.toHaveBeenCalled()
  } finally { wrapper.unmount() }
})

it('submits, queries and loads an asynchronous import without resubmitting', async () => {
  const file = new File(['zip'], 'script.zip')
  post.mockResolvedValueOnce({ data: operation })
  get.mockResolvedValueOnce({ data: { ...operation, state: 'completed', can_cancel: false } })
    .mockResolvedValueOnce({ data: batch })
    .mockResolvedValueOnce({ data: { items: [], next_after_ordinal: null } })
  const wrapper = mounted()
  try {
    await selectFile(wrapper, file)
    await button(wrapper, '导入归档').trigger('click'); await flushPromises()
    expect(post).toHaveBeenCalledWith('/maa/imports/operations', file, {
      headers: { 'Content-Type': 'application/zip',
        'X-AL1S-Import-Selection': '{"target_applications":{},"confirmed_overwrites":{}}' },
      timeout: 70000,
    })
    expect(sessionStorage.getItem('al1s.maa.import.operation')).toBe(id)
    await button(wrapper, '查询状态').trigger('click'); await flushPromises()
    expect(get.mock.calls.map(call => call[0])).toEqual([
      `/maa/imports/${id}/operation`, `/maa/imports/${id}`, `/maa/imports/${id}/items`,
    ])
    expect(wrapper.emitted('imported')?.[0]).toEqual([batch])
    expect(post).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem('al1s.maa.import.operation')).toBeNull()
  } finally { wrapper.unmount() }
})

it('recovers after refresh and cancels with the latest row version', async () => {
  sessionStorage.setItem('al1s.maa.import.operation', id)
  get.mockResolvedValueOnce({ data: operation })
    .mockResolvedValueOnce({ data: { ...batch, status: 'failed', error_code: 'archive_import_cancelled' } })
    .mockResolvedValueOnce({ data: { items: [], next_after_ordinal: null } })
  post.mockResolvedValueOnce({ data: { ...operation, state: 'cancelled', can_cancel: false } })
  const wrapper = mounted()
  try {
    await flushPromises()
    expect(get).toHaveBeenCalledWith(`/maa/imports/${id}/operation`)
    await button(wrapper, '取消导入').trigger('click'); await flushPromises()
    expect(post).toHaveBeenCalledWith(`/maa/imports/${id}/cancel`, { row_version: 1 })
    expect(wrapper.text()).toContain('archive_import_cancelled')
    expect(sessionStorage.getItem('al1s.maa.import.operation')).toBeNull()
  } finally { wrapper.unmount() }
})

it('keeps the file and avoids automatic retry when submission times out', async () => {
  post.mockRejectedValueOnce({ code: 'request_timeout' })
  const wrapper = mounted()
  try {
    await selectFile(wrapper, new File(['zip'], 'script.zip'))
    await button(wrapper, '导入归档').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('操作编号未知')
    expect(wrapper.text()).toContain('script.zip')
    expect(post).toHaveBeenCalledOnce()
  } finally { wrapper.unmount() }
})
