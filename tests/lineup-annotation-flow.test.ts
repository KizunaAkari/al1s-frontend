import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { ElMessageBox } from 'element-plus'
import { useLineupAnnotation } from '../src/modules/lineup/use-lineup-annotation'
import { resizeTeam } from '../src/modules/lineup/annotation-draft'
import * as api from '../src/shared/api/lineup-workspace'
import * as images from '../src/shared/api/lineup'

const wrappers: ReturnType<typeof mount>[] = []
function record(id = 'one'): api.WorkspaceDetail {
  return { id, task_id: 'task', name: `${id}.png`, width: 100, height: 100,
    created_at: '', catalog_version: 'v1', state: 'failure', result: null,
    error_code: 'failed', review: null, row_version: 1, annotation: null,
    needs_attention: true, attention_reason: 'runtime_failure', usable_result: null }
}
function setup() {
  let flow!: ReturnType<typeof useLineupAnnotation>
  wrappers.push(mount(defineComponent({ setup() { flow = useLineupAnnotation(); return () => null } })))
  return flow
}
beforeEach(() => {
  vi.spyOn(images, 'fetchLineupImage').mockResolvedValue(new Blob(['image']))
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})
afterEach(() => { wrappers.splice(0).forEach(w => w.unmount()); vi.restoreAllMocks() })

it('discards an older detail response after the next image is selected', async () => {
  let resolve!: (value: api.WorkspaceDetail) => void
  const first = new Promise<api.WorkspaceDetail>(r => { resolve = r })
  vi.spyOn(api, 'fetchLineupAnnotation').mockReturnValueOnce(first).mockResolvedValueOnce(record('two'))
  const flow = setup()
  const pending = flow.open('one'); await flushPromises()
  await flow.open('two')
  resolve(record('one')); await pending
  expect(flow.detail.value?.id).toBe('two')
  expect(images.fetchLineupImage).toHaveBeenCalledTimes(1)
})

it('closing the save/discard prompt keeps the original unsaved image and makes no request', async () => {
  const fetch = vi.spyOn(api, 'fetchLineupAnnotation').mockResolvedValue(record())
  vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('close')
  const flow = setup(); await flow.open('one')
  flow.document.value = resizeTeam(flow.document.value, 'attack', 1)
  expect(await flow.open('two')).toBe(false)
  expect(flow.detail.value?.id).toBe('one')
  expect(flow.dirty.value).toBe(true)
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('save conflict preserves the draft and never marks it saved', async () => {
  vi.spyOn(api, 'fetchLineupAnnotation').mockResolvedValue(record())
  const save = vi.spyOn(api, 'saveLineupAnnotation').mockRejectedValue(new Error('version conflict'))
  const flow = setup(); await flow.open('one')
  flow.document.value = resizeTeam(flow.document.value, 'attack', 1)
  expect(await flow.save()).toBe(false)
  expect(flow.error.value).toContain('version conflict')
  expect(flow.dirty.value).toBe(true)
  expect(save.mock.calls[0]?.[1]).toBe(0)
})

it('image retry preserves a draft when the original download failed', async () => {
  vi.spyOn(api, 'fetchLineupAnnotation').mockResolvedValue(record())
  vi.mocked(images.fetchLineupImage).mockRejectedValueOnce(new Error('image failed')).mockResolvedValue(new Blob(['image']))
  const flow = setup(); await flow.open('one')
  flow.document.value = resizeTeam(flow.document.value, 'attack', 1)
  await flow.retryImage()
  expect(flow.document.value.teams).toEqual({ attack: 1 })
  expect(flow.dirty.value).toBe(true)
  expect(flow.imageUrl.value).toBe('blob:preview')
})
