import { afterEach, expect, it, vi } from 'vitest'
import { createLineupSubmission } from '../src/modules/lineup/lineup-submission'
import * as images from '../src/shared/api/lineup'
import * as tasks from '../src/shared/api/lineup-workspace'

afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear() })
const settings = { terminalId: 'terminal', options: { layout_hint: 'auto' as const, recognition_mode: 'auto' as const } }

function memoryDraft() {
  let files: File[] = []
  return { load: async () => [...files], save: vi.fn(async (next: File[]) => { files = [...next] }) }
}

it('restores selected folder files on reload and clearing persists an empty draft', async () => {
  const draft = memoryDraft(), first = createLineupSubmission(draft)
  await first.ready
  const file = new File(['pixels'], 'a.png', { type: 'image/png', lastModified: 123 })
  Object.defineProperty(file, 'webkitRelativePath', { value: 'reports/a.png' })
  first.addFiles([file]); await first.flushDraft()
  const reloaded = createLineupSubmission(draft); await reloaded.ready
  expect(await reloaded.state.files[0]!.text()).toBe('pixels')
  expect(reloaded.state.files[0]!.webkitRelativePath).toBe('reports/a.png')
  reloaded.clear(); await reloaded.flushDraft()
  const cleared = createLineupSubmission(draft); await cleared.ready
  expect(cleared.state.files).toEqual([])
})

it('clears cached files after success but protects an unknown submission from clear', async () => {
  const draft = memoryDraft(), run = createLineupSubmission(draft); await run.ready
  vi.spyOn(images, 'createLineupRecord').mockResolvedValue({ id: 'one' } as images.LineupDetail)
  const submit = vi.spyOn(tasks, 'submitLineupTask').mockRejectedValueOnce(new Error('lost')).mockResolvedValueOnce({ task_id: 'task' })
  run.addFiles([new File(['a'], 'a.png', { type: 'image/png' })]); await run.flushDraft()
  await run.submit(settings); run.clear()
  expect(run.state.files).toHaveLength(1)
  await run.submit(settings); await run.flushDraft()
  const restored = createLineupSubmission(draft); await restored.ready
  expect(restored.state.files).toHaveLength(0)
  expect(submit.mock.calls[0]).toEqual(submit.mock.calls[1])
})

it('reports cache failure and does not prevent normal upload', async () => {
  const run = createLineupSubmission({ load: async () => [], save: async () => { throw new Error('quota') } })
  await run.ready
  run.addFiles([new File(['a'], 'a.png', { type: 'image/png' })]); await run.flushDraft()
  expect(run.state.draftNotice).toContain('刷新')
  expect(run.state.files).toHaveLength(1)
})

it('uploads the ordered set before creating exactly one task and deduplicates concurrent clicks', async () => {
  const upload = vi.spyOn(images, 'createLineupRecord').mockImplementation(async (file) => ({ id: file.name! } as images.LineupDetail))
  const submit = vi.spyOn(tasks, 'submitLineupTask').mockResolvedValue({ task_id: 'parent' })
  const run = createLineupSubmission()
  run.addFiles([new File(['a'], 'img10.png', { type: 'image/png' }), new File(['b'], 'img2.png', { type: 'image/png' })])
  await Promise.all([run.submit(settings), run.submit(settings)])
  expect(upload).toHaveBeenCalledTimes(2)
  expect(submit).toHaveBeenCalledTimes(1)
  expect(submit.mock.calls[0]![0]).toEqual(['img2.png', 'img10.png'])
  expect(run.state.taskId).toBe('parent')
})

it('never dispatches a partial upload; retry preserves uploaded image references', async () => {
  const upload = vi.spyOn(images, 'createLineupRecord').mockResolvedValueOnce({ id: 'one' } as images.LineupDetail).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ id: 'two' } as images.LineupDetail)
  const submit = vi.spyOn(tasks, 'submitLineupTask').mockResolvedValue({ task_id: 'parent' })
  const run = createLineupSubmission()
  run.addFiles(['1', '2'].map(n => new File(['a'], n + '.png', { type: 'image/png' })))
  await run.submit(settings)
  expect(submit).not.toHaveBeenCalled()
  await run.submit(settings)
  expect(upload).toHaveBeenCalledTimes(3)
  expect(submit.mock.calls[0]![0]).toEqual(['one', 'two'])
})

it('reuses the exact submission identity and frozen payload after an unknown response', async () => {
  vi.spyOn(images, 'createLineupRecord').mockResolvedValue({ id: 'one' } as images.LineupDetail)
  const submit = vi.spyOn(tasks, 'submitLineupTask').mockRejectedValueOnce(new Error('connection lost')).mockResolvedValueOnce({ task_id: 'parent' })
  const run = createLineupSubmission()
  run.addFiles([new File(['a'], '1.png', { type: 'image/png' })])
  await run.submit(settings)
  await run.submit(settings)
  expect(submit.mock.calls[0]).toEqual(submit.mock.calls[1])
  expect(run.state.taskId).toBe('parent')
})

it.each([401, 403])('restores the frozen submission after an HTTP %i response', async (status) => {
  const upload = vi.spyOn(images, 'createLineupRecord').mockResolvedValue({ id: 'one' } as images.LineupDetail)
  const submit = vi.spyOn(tasks, 'submitLineupTask')
    .mockRejectedValueOnce(new Error('response lost after server commit'))
    .mockRejectedValueOnce(Object.assign(new Error(`HTTP ${status}`), { status }))
    .mockResolvedValueOnce({ task_id: 'already-submitted' })
  const frozen = { terminalId: 'frozen-terminal', options: { layout_hint: 'left_attack' as const, recognition_mode: 'text' as const } }
  const run = createLineupSubmission(null)
  run.addFiles([new File(['a'], '1.png', { type: 'image/png' })])

  await run.submit(frozen)
  await run.submit({ terminalId: 'changed-terminal', options: { layout_hint: 'right_attack', recognition_mode: 'portrait' } })

  expect(run.state.pending).toBe(true)
  expect(sessionStorage.getItem('al1s-lineup-submit-v1')).not.toBeNull()

  const restored = createLineupSubmission(null)
  expect(restored.state.pending).toBe(true)
  await restored.submit({ terminalId: 'changed-terminal', options: { layout_hint: 'right_attack', recognition_mode: 'portrait' } })

  expect(restored.state.taskId).toBe('already-submitted')
  expect(upload).toHaveBeenCalledTimes(1)
  expect(submit).toHaveBeenCalledTimes(3)
  expect(submit.mock.calls[1]).toEqual(submit.mock.calls[0])
  expect(submit.mock.calls[2]).toEqual(submit.mock.calls[0])
})

it('allows corrected settings after a definite rejected submission', async () => {
  vi.spyOn(images, 'createLineupRecord').mockResolvedValue({ id: 'one' } as images.LineupDetail)
  const submit = vi.spyOn(tasks, 'submitLineupTask').mockRejectedValueOnce(Object.assign(new Error('offline'), { status: 400 })).mockResolvedValueOnce({ task_id: 'parent' })
  const run = createLineupSubmission()
  run.addFiles([new File(['a'], '1.png', { type: 'image/png' })])
  await run.submit(settings)
  expect(run.state.pending).toBe(false)
  const corrected = { terminalId: 'other-terminal', options: { layout_hint: 'right_attack' as const, recognition_mode: 'portrait' as const } }
  await run.submit(corrected)
  expect(submit.mock.calls[1]![1]).toBe('other-terminal')
  expect(submit.mock.calls[1]![2]).toEqual(corrected.options)
  expect(submit.mock.calls[0]![3]).not.toBe(submit.mock.calls[1]![3])
})

it('keeps invalid folder entries removable and never silently dispatches a partial selection', async () => {
  const upload = vi.spyOn(images, 'createLineupRecord').mockResolvedValue({ id: 'one' } as images.LineupDetail)
  vi.spyOn(tasks, 'submitLineupTask').mockResolvedValue({ task_id: 'parent' })
  const run = createLineupSubmission()
  run.addFiles([new File(['a'], 'image.png', { type: 'image/png' }), new File(['x'], 'notes.txt', { type: 'text/plain' })])
  expect(run.state.files).toHaveLength(2)
  await run.submit(settings)
  expect(upload).not.toHaveBeenCalled()
  run.remove(run.state.files.findIndex(file => file.name === 'notes.txt'))
  await run.submit(settings)
  expect(upload).toHaveBeenCalledTimes(1)
  expect(run.state.taskId).toBe('parent')
})
