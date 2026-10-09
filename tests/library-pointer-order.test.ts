import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import MaaLibraryPanel from '../src/modules/maa/MaaLibraryPanel.vue'
import { apiClient } from '../src/shared/api/client'

const originalCapture = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'setPointerCapture')
afterEach(() => {
  vi.restoreAllMocks()
  if (originalCapture) Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', originalCapture)
  else Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture')
})
const scripts = ['start', 'cafe', 'end', 'refresh'].map((id, index) => ({
  script_id: id, application_id: 'app', name: id, status: 'active',
  script_type: index === 0 ? 'module_start' : index === 2 ? 'module_end' : 'module_process',
  current_version_id: 'version-' + id, candidate_version_id: null, row_version: 1,
  created_at: '', updated_at: '2026-10-04T00:00:00Z',
}))
async function library() {
  vi.spyOn(apiClient, 'get').mockImplementation(async url => ({ data: url === '/maa/applications'
    ? { items: [{ application_id: 'app', display_name: '应用', package_name: 'test.app',
        script_count: 4, icon_data_url: null, row_version: 1 }], next_after_id: null }
    : url.endsWith('/library-scripts') ? { items: structuredClone(scripts), next_after_id: null }
    : url.endsWith('/devices') ? [] : url.endsWith('/actions') ? { rename: null, delete: null }
    : { items: [], next_after_id: null } }) as never)
  const put = vi.spyOn(apiClient, 'put').mockResolvedValue({ data: null })
  const capture = vi.fn()
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: capture })
  const hit = vi.spyOn(document, 'elementFromPoint')
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: MaaLibraryPanel }] })
  await router.push('/'); await router.isReady()
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return { wrapper, put, hit }
}
const pointer = { pointerId: 1, isPrimary: true, button: 0, pointerType: 'mouse', clientX: 100, clientY: 100 }

it.each(['same row', 'blank space', 'returned row'])('does not submit a reorder on %s release', async scenario => {
  const { wrapper, put, hit } = await library()
  try {
    const rows = wrapper.findAll('.library-row')
    expect(rows).toHaveLength(4)
    await rows[1]!.find('.library-drag-handle').trigger('pointerdown', pointer)
    hit.mockReturnValue(scenario === 'returned row' ? rows[2]!.element : scenario === 'blank space' ? document.body : rows[1]!.element)
    await rows[1]!.trigger('pointermove', { ...pointer, clientY: 112 })
    hit.mockReturnValue(scenario === 'blank space' ? document.body : rows[1]!.element)
    await rows[1]!.trigger('pointerup', { ...pointer, clientY: 112 })
    await flushPromises()
    expect(put).not.toHaveBeenCalled()
    expect(wrapper.findAll('.library-row').map(row => row.attributes('data-script-id'))).toEqual(scripts.map(script => script.script_id))
    expect(wrapper.text()).not.toContain('正在保存顺序')
  } finally { wrapper.unmount() }
})

it('keeps valid relative moves available', async () => {
  const { wrapper, put, hit } = await library()
  try {
    const rows = wrapper.findAll('.library-row')
    await rows[3]!.find('.library-drag-handle').trigger('pointerdown', pointer)
    hit.mockReturnValue(rows[2]!.element)
    await rows[3]!.trigger('pointermove', { ...pointer, clientY: 112 })
    await rows[3]!.trigger('pointerup', { ...pointer, clientY: 112 })
    await flushPromises()
    expect(put).toHaveBeenCalledWith('/maa/applications/app/library-scripts/order',
      { script_id: 'refresh', target_id: 'end', placement: 'before' }, expect.any(Object))
  } finally { wrapper.unmount() }
})

it.each(['pointercancel', 'lostpointercapture'])('cancels a pending move on %s', async event => {
  const { wrapper, put, hit } = await library()
  try {
    const rows = wrapper.findAll('.library-row')
    await rows[1]!.find('.library-drag-handle').trigger('pointerdown', pointer)
    hit.mockReturnValue(rows[2]!.element)
    await rows[1]!.trigger('pointermove', { ...pointer, clientY: 112 })
    await rows[1]!.trigger(event, pointer)
    await rows[1]!.trigger('pointerup', { ...pointer, clientY: 112 })
    await flushPromises()
    expect(put).not.toHaveBeenCalled()
    expect(wrapper.findAll('.library-row').map(row => row.attributes('data-script-id'))).toEqual(scripts.map(script => script.script_id))
  } finally { wrapper.unmount() }
})
