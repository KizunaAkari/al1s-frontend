import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ElSelect } from 'element-plus'

import LineupUploadPanel from '../src/modules/lineup/LineupUploadPanel.vue'
import * as workspaceApi from '../src/shared/api/lineup-workspace'
import { apiClient } from '../src/shared/api/client'
import type { LineupTerminal } from '../src/shared/api/lineup'

afterEach(() => vi.restoreAllMocks())

const terminals: LineupTerminal[] = [
  { terminal_id: 'terminal-1', display_name: 'Linux 识别机', available: true, reason: null },
  { terminal_id: 'terminal-2', display_name: '离线终端', available: false, reason: '离线' },
]

function props(overrides: Record<string, unknown> = {}) {
  return {
    busy: false,
    files: [] as File[],
    terminals,
    terminalId: 'terminal-1',
    layoutHint: 'auto' as const,
    recognitionMode: 'auto' as const,
    notice: '',
    error: '',
    progress: null,
    ...overrides,
  }
}

describe('lineup workspace API', () => {
  it('submits and queries a batch with fixed task request fields', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { task_id: 'task-1' } } as never)
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { task_id: 'task-1' } } as never)

    await expect(workspaceApi.submitLineupTask(['record-1'], 'terminal-1', {
      layout_hint: 'left_attack', recognition_mode: 'text',
    }, 'request-1')).resolves.toEqual({ task_id: 'task-1' })
    await workspaceApi.fetchLineupTask('task-1', 20, 'attention')

    expect(post).toHaveBeenCalledWith('/lineup/tasks', {
      record_ids: ['record-1'], terminal_id: 'terminal-1',
      layout_hint: 'left_attack', recognition_mode: 'text', idempotency_key: 'request-1',
    })
    expect(get).toHaveBeenCalledWith('/lineup/tasks/task-1', { params: { after: 20, category: 'attention' } })
  })

  it('uses the annotation task, save, retry, and export contracts', async () => {
    const get = vi.spyOn(apiClient, 'get')
      .mockResolvedValueOnce({ data: { items: [], next_cursor: null } } as never)
      .mockResolvedValueOnce({ data: { record_id: 'record-1' } } as never)
      .mockResolvedValueOnce({ data: new Blob(['zip']) } as never)
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { task_id: 'retry-1' } } as never)
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({ data: { record_id: 'record-1' } } as never)
    const document = { teams: { attack: 1 }, slots: [] }

    await workspaceApi.fetchAnnotationTasks('cursor-1')
    await workspaceApi.fetchLineupAnnotation('record-1', 'task-1')
    await workspaceApi.retryLineupTask('task-1', 'retry-key')
    await workspaceApi.saveLineupAnnotation('record-1', 7, document)
    await workspaceApi.exportLineupAnnotation('record-1')

    expect(get).toHaveBeenNthCalledWith(1, '/lineup/annotation-tasks', { params: { cursor: 'cursor-1' } })
    expect(get).toHaveBeenNthCalledWith(2, '/lineup/records/record-1/annotation', { params: { task_id: 'task-1' } })
    expect(post).toHaveBeenCalledWith('/lineup/tasks/task-1/retry', { idempotency_key: 'retry-key' })
    expect(put).toHaveBeenCalledWith('/lineup/records/record-1/annotation', {
      expected_version: 7, teams: { attack: 1 }, slots: [],
    })
    expect(get).toHaveBeenNthCalledWith(3, '/lineup/records/record-1/annotation/export', { responseType: 'blob' })
  })
})

describe('LineupUploadPanel', () => {
  it('has image and folder buttons inside the drop area and can clear the selection', async () => {
    const wrapper = mount(LineupUploadPanel, { props: props({ files: [new File(['a'], 'a.png')] }) })
    expect(wrapper.get('[data-upload-dropzone]').findAll('.upload-secondary').map(button => button.text())).toEqual(['选择图片', '选择文件夹'])
    const input = wrapper.get('input[aria-label="选择多张图片"]')
    const click = vi.spyOn(input.element as HTMLInputElement, 'click')
    await wrapper.get('[aria-label="选择图片"]').trigger('click')
    expect(click).toHaveBeenCalledTimes(1)
    await wrapper.get('[aria-label="全部移除"]').trigger('click')
    expect(wrapper.emitted('clear')).toEqual([[]])
    await wrapper.setProps({ busy: true })
    expect(wrapper.get('[aria-label="全部移除"]').attributes('disabled')).toBeDefined()
  })
  it('emits control updates and submit without owning network state', async () => {
    const file = new File(['png'], 'battle.png', { type: 'image/png' })
    const wrapper = mount(LineupUploadPanel, { props: props({ files: [file] }) })

    const selects = wrapper.findAllComponents(ElSelect)
    await selects[0]!.vm.$emit('update:modelValue', 'terminal-2')
    await selects[1]!.vm.$emit('update:modelValue', 'left_attack')
    await selects[2]!.vm.$emit('update:modelValue', 'text')
    await wrapper.get('[aria-label="开始识别"]').trigger('click')

    expect(wrapper.emitted('update:terminalId')).toEqual([['terminal-2']])
    expect(wrapper.emitted('update:layoutHint')).toEqual([['left_attack']])
    expect(wrapper.emitted('update:recognitionMode')).toEqual([['text']])
    expect(wrapper.emitted('submit')).toEqual([[]])
  })

  it('emits dropped and pasted images while ignoring ordinary text input paste', async () => {
    const wrapper = mount(LineupUploadPanel, { props: props() })
    const dropzone = wrapper.get('[data-upload-dropzone]')
    const dropped = new File(['jpg'], 'dropped.jpg', { type: 'image/jpeg' })
    await dropzone.trigger('drop', { dataTransfer: { files: [dropped] } })
    expect(wrapper.emitted('files')).toEqual([[[dropped]]])

    const pasted = new File(['png'], 'pasted.png', { type: 'image/png' })
    await wrapper.trigger('paste', {
      clipboardData: { files: [pasted], items: [] },
    })
    expect(wrapper.emitted('files')).toEqual([[[dropped]], [[pasted]]])

    const input = document.createElement('input')
    wrapper.element.appendChild(input)
    await input.dispatchEvent(new Event('paste', { bubbles: true }))
    expect(wrapper.emitted('files')).toHaveLength(2)
  })

  it('blocks drops and removals while busy and collapses long file lists', async () => {
    const files = Array.from({ length: 8 }, (_, index) => new File(['x'], `${index + 1}.png`, { type: 'image/png' }))
    const wrapper = mount(LineupUploadPanel, { props: props({ busy: true, files }) })
    await wrapper.get('[data-upload-dropzone]').trigger('drop', { dataTransfer: { files: [files[0]] } })
    await wrapper.get('[aria-label="移除 1.png"]').trigger('click')
    expect(wrapper.emitted('files')).toBeUndefined()
    expect(wrapper.emitted('remove')).toBeUndefined()
    expect(wrapper.findAll('[data-upload-file]').length).toBeLessThan(files.length)
    expect(wrapper.find('[aria-label="展开文件列表"]').exists()).toBe(true)
  })

  it('shows progress and warnings through accessible status regions', async () => {
    const wrapper = mount(LineupUploadPanel, { props: props({ notice: '正在上传', error: '有一张图片失败', progress: { uploaded: 2, total: 3 } }) })
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('有一张图片失败')
    expect(wrapper.get('[role="status"]').text()).toContain('正在上传')
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('2')
  })
})
