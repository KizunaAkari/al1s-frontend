import { afterEach, expect, it, vi } from 'vitest'
import { apiClient } from '../src/shared/api/client'
import { fetchEditorDrafts, openScript, saveScriptDocument } from '../src/shared/api/maa-script-editor'

afterEach(() => vi.restoreAllMocks())
it('opens the latest saved version rather than a stale candidate', async () => {
  const get = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: { script_id: 's', candidate_version_id: 'c', current_version_id: 'p' } })
    .mockResolvedValueOnce({ data: { manifest: { version: 2, steps: [{ action: 'home' }] } } })
  expect((await openScript('s')).document.steps[0]?.action).toBe('home')
  expect(get).toHaveBeenLastCalledWith('/maa/scripts/s/versions/p')
})
it('saves the whole manifest without losing untouched fields using PUT', async () => {
  const put = vi.spyOn(apiClient, 'put').mockResolvedValue({ data: { row_version: 3 } })
  const document = { version: 2, steps: [{ action: 'wait', seconds: 5, failure_retry: { enabled: true, process_script_id: 'p', max_retries: 2 } }] }
  await saveScriptDocument({ script_id: 's', current_version_id: 'published', candidate_version_id: null, row_version: 2 } as never, document, 'device-1', 'stable')
  expect(put).toHaveBeenCalledWith('/maa/scripts/s/document', { manifest: document, device_id: 'device-1' }, { headers: { 'Idempotency-Key': 'stable', 'If-Match': '2' } })
})
it('does not send an invalid known field from the editor to the platform', async () => {
  const put = vi.spyOn(apiClient, 'put')
  const script = { script_id: 's', row_version: 2 } as never
  await expect(saveScriptDocument(script, { version: 2, steps: [
    { action: 'tap', x: 'invalid', y: 1 },
  ] }, 'device-1', 'stable')).rejects.toThrow('脚本步骤格式无效')
  expect(put).not.toHaveBeenCalled()
})
it('opens an imported script from its current version when no candidate exists', async () => {
  const get = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
    data: { script_id: 'imported', status: 'active', current_version_id: 'published', candidate_version_id: null },
  }).mockResolvedValueOnce({ data: { manifest: { version: 2, steps: [{ action: 'home' }] } } })
  await openScript('imported')
  expect(get).toHaveBeenLastCalledWith('/maa/scripts/imported/versions/published')
})
it('does not reinterpret a legacy candidate as a new editor draft', async () => {
  vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: {
    script_id: 'legacy-candidate', current_version_id: null, candidate_version_id: 'old',
  } })
  await expect(openScript('legacy-candidate')).rejects.toThrow('旧版候选脚本')
})

it('reads only server-filtered drafts for the selected phone across pages', async () => {
  const get = vi.spyOn(apiClient, 'get')
    .mockResolvedValueOnce({ data: { items: [
      { script_id: 'draft-a', application_id: 'a', script_type: 'module_start', current_version_id: null },
    ], next_after_id: 'page-2' } })
    .mockResolvedValueOnce({ data: { items: [
      { script_id: 'draft-b', application_id: 'a', script_type: 'module_process', current_version_id: null },
    ], next_after_id: null } })
  expect((await fetchEditorDrafts('phone')).map(item => item.script_id)).toEqual(['draft-a', 'draft-b'])
  expect(get).toHaveBeenNthCalledWith(1, '/maa/editor/drafts', {
    params: { device_id: 'phone', after_id: undefined, limit: 200 }, signal: undefined,
  })
  expect(get).toHaveBeenNthCalledWith(2, '/maa/editor/drafts', {
    params: { device_id: 'phone', after_id: 'page-2', limit: 200 }, signal: undefined,
  })
})

it('stops requesting draft pages when the selected phone changes', async () => {
  const controller = new AbortController()
  const get = vi.spyOn(apiClient, 'get').mockImplementation(async () => {
    controller.abort()
    return { data: { items: [{ script_id: 'old-phone-draft' }], next_after_id: 'next' } } as never
  })
  await expect(fetchEditorDrafts('old-phone', controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  expect(get).toHaveBeenCalledTimes(1)
})
