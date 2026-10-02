import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../src/shared/api/client'
import {
  deleteApplication, deleteApplicationIcon, fetchApplicationDeletePreview,
  renameApplication, uploadApplicationIcon,
} from '../src/shared/api/maa-applications'
import type { MaaApplication } from '../src/shared/api/maa'

afterEach(() => vi.restoreAllMocks())
const application: MaaApplication = {
  application_id: 'app-1', package_name: 'org.example', display_name: '分类',
  row_version: 3, created_at: '', updated_at: '', icon_data_url: null,
}

describe('Maa application commands', () => {
  it('loads the cascade and active-task preview before deletion', async () => {
    const body = { script_count: 2, strategy_count: 1, device_count: 1, blocking_task_ids: [], has_more_blockers: false }
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: body })
    await expect(fetchApplicationDeletePreview('app-1')).resolves.toEqual(body)
    expect(get).toHaveBeenCalledWith('/maa/applications/app-1/delete-preview')
  })
  it('renames only metadata with concurrency protection', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ data: application })
    await renameApplication(application, '新名称', 'rename-key')
    expect(patch).toHaveBeenCalledWith('/maa/applications/app-1', { display_name: '新名称' },
      { headers: { 'Idempotency-Key': 'rename-key', 'If-Match': '3' } })
  })
  it('protects deletion with row version and idempotency', async () => {
    const remove = vi.spyOn(apiClient, 'delete').mockResolvedValue({})
    await deleteApplication(application, 'delete-key')
    expect(remove).toHaveBeenCalledWith('/maa/applications/app-1',
      { headers: { 'Idempotency-Key': 'delete-key', 'If-Match': '3' } })
  })
  it('uploads and deletes an icon with category concurrency protection', async () => {
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({ data: application })
    const remove = vi.spyOn(apiClient, 'delete').mockResolvedValue({ data: application })
    const file = new File(['image'], 'icon.png', { type: 'image/png' })
    await uploadApplicationIcon(application, file, 'upload-key')
    expect(put).toHaveBeenCalledWith('/maa/applications/app-1/icon', file, {
      headers: { 'Content-Type': 'image/png', 'Idempotency-Key': 'upload-key', 'If-Match': '3' },
    })
    await deleteApplicationIcon(application, 'remove-key')
    expect(remove).toHaveBeenCalledWith('/maa/applications/app-1/icon', {
      headers: { 'Idempotency-Key': 'remove-key', 'If-Match': '3' },
    })
  })
})
