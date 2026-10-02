import { afterEach, expect, it, vi } from 'vitest'
import { apiClient } from '../src/shared/api/client'
import { fetchScriptMetadataActions, renameScript } from '../src/shared/api/maa-script-metadata'

afterEach(() => vi.restoreAllMocks())

it('loads actions only for the script being managed', async () => {
  const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { rename: null, row_version: 3 } })
  expect(await fetchScriptMetadataActions('s')).toEqual({ rename: null, row_version: 3 })
  expect(get).toHaveBeenCalledWith('/maa/scripts/s/metadata-actions')
})

it('renames with a stable caller key and the displayed version', async () => {
  const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ data: {} })
  await renameScript({ script_id: 's', row_version: 3 } as never, '新名称', 'key')
  expect(patch).toHaveBeenCalledWith('/maa/scripts/s', { name: '新名称' }, {
    headers: { 'Idempotency-Key': 'key', 'If-Match': '3' },
  })
})
