import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse, compileStyle } from '@vue/compiler-sfc'
import { Window } from 'happy-dom'
import { ElMessageBox } from 'element-plus'

const api = vi.hoisted(() => ({ settings: vi.fn(), save: vi.fn(), groups: vi.fn(), groupSave: vi.fn(),
  presets: vi.fn(), resources: vi.fn(), tasks: vi.fn(), check: vi.fn(), preset: vi.fn(), presetSave: vi.fn(),
  preview: vi.fn(), cancel: vi.fn(), retry: vi.fn(), image: vi.fn(), release: vi.fn(),
  prompt: vi.fn(), promptSave: vi.fn(), promptActivate: vi.fn(), promptDelete: vi.fn(), promptTest: vi.fn(),
  taskDetail: vi.fn(), taskDelete: vi.fn() }))
vi.mock('../src/shared/api/bot-drawing', () => ({
  fetchDrawingSettings: api.settings, saveDrawingSettings: api.save, fetchDrawingGroups: api.groups,
  saveDrawingGroup: api.groupSave, fetchDrawingPresets: api.presets, fetchDrawingResources: api.resources,
  fetchDrawingTasks: api.tasks, checkDrawingPreset: api.check, fetchDrawingPreset: api.preset,
  saveDrawingPreset: api.presetSave, previewDrawingPreset: api.preview, cancelDrawingTask: api.cancel,
  retryDrawingSend: api.retry,
  releaseDrawingResources: api.release,
  fetchDrawingTaskImage: api.image,
  fetchDrawingPromptModels: api.prompt, saveDrawingPromptModel: api.promptSave,
  activateDrawingPromptModel: api.promptActivate, deleteDrawingPromptModel: api.promptDelete,
  testDrawingPromptModel: api.promptTest, fetchDrawingTask: api.taskDetail, deleteDrawingTasks: api.taskDelete,
}))
import AiDrawingSettings from '../src/modules/bots/drawing/AiDrawingSettings.vue'

const cleanupStubs = {
  ElDialog: { props: ['modelValue'], template: '<section v-if="modelValue" role="dialog"><slot name="header" title-id="cleanup-title" title-class="dialog-title" /><slot /><slot name="footer" /></section>' },
  ElCheckbox: { props: ['modelValue', 'disabled'], emits: ['change'], template: '<label><input type="checkbox" :checked="modelValue" :disabled="disabled" @change="$emit(\'change\', $event.target.checked)"><slot /></label>' },
  ElPopover: { template: '<span><slot name="reference" /><slot /></span>' },
  ElDrawer: { props: ['modelValue'], emits: ['update:modelValue'], template: '<aside v-if="modelValue" role="dialog"><button @click="$emit(\'update:modelValue\', false)">关闭侧栏</button><slot /></aside>' },
}

describe('AI drawing settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.settings.mockResolvedValue({ service_id: 'qq', enabled: false, keep_drawing_warm: false,
      default_text_preset_id: null, default_edit_preset_id: null, row_version: 1, applied_version: 1,
      resource_configured: true, allow_private: false, event_ws_url: 'ws://bot:3001',
      comfy_base_url: 'http://host.docker.internal:8188', groups: ['123456'] })
    api.save.mockResolvedValue({ row_version: 2, applied_version: 1 })
    api.groups.mockResolvedValue([{ group_id: '123456', mode: 'green', row_version: 0 }])
    api.groupSave.mockResolvedValue({ group_id: '123456', mode: 'r18', row_version: 1 })
    api.presets.mockResolvedValue([])
    api.resources.mockResolvedValue({ state: 'available', effective_resident: false, active: 0,
      drawing_resources: 0, idle_seconds_remaining: null })
    api.tasks.mockResolvedValue({ items: [], next_after_id: null })
    api.release.mockResolvedValue({ status: 'queued' })
    api.prompt.mockResolvedValue({ items: [], active_id: null, selection_version: 1 })
    api.promptSave.mockResolvedValue({ id: 'model-1', name: '绘图模型', adapter_kind: 'openai_chat_completion',
      model_id: 'my-draw-model', base_url: 'https://example.test/v1', network_mode: 'direct',
      row_version: 1, revision: 1, secret_configured: true })
  })

  it('keeps drawing switches and fields aligned when the older card stylesheet loads later', async () => {
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true } })
    await flushPromises()
    const scope = [...page.element.attributes].map(attribute => attribute.name).find(name => name.startsWith('data-v-'))
    expect(scope).toBeTruthy()
    const source = readFileSync('src/modules/bots/drawing/AiDrawingSettings.vue', 'utf8')
    const style = parse(source).descriptor.styles[0]!
    const compiled = compileStyle({ source: style.content, filename: 'AiDrawingSettings.vue', id: scope!, scoped: true })
    expect(compiled.errors).toEqual([])
    const browser = new Window({ width: 1440, height: 800 })
    browser.document.body.innerHTML = page.html()
    const stylesheet = browser.document.createElement('style')
    stylesheet.textContent = compiled.code + `\n.drawing-card label[${scope}]:not(.drawing-switch-row){display:grid}`
    browser.document.head.appendChild(stylesheet)
    const switches = browser.document.querySelectorAll('.drawing-general-settings .drawing-setting-row:has(input[type=checkbox])')
    expect(switches.length).toBe(2)
    for (const row of switches) {
      expect(browser.getComputedStyle(row).display).toBe('flex')
      expect(browser.getComputedStyle(row).flexDirection || 'row').toBe('row')
    }
    const address = browser.document.querySelector('.drawing-general-settings [data-drawing-field="event-url"]')!.parentElement!
    expect(browser.getComputedStyle(address).display).toBe('flex')
    expect(browser.getComputedStyle(address).flexDirection || 'row').toBe('row')
    browser.close()
    page.unmount()
  })

  it('saves drawing scopes and private access independently of chat', async () => {
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true } })
    await flushPromises()
    await page.get('[data-drawing-field="allow-private"]').setValue(true)
    await page.findAll('button').find(button => button.text() === '批量编辑')!.trigger('click')
    await page.get('[data-drawing-field="groups"]').setValue('123456\n789012')
    await page.get('[data-drawing-action="save-settings"]').trigger('click')
    await flushPromises()
    expect(api.save).toHaveBeenCalledWith('qq', expect.objectContaining({
      allow_private: true, groups: ['123456', '789012'], event_ws_url: 'ws://bot:3001',
      comfy_base_url: 'http://host.docker.internal:8188',
    }), 1, expect.any(String))
    page.unmount()
  })

  it('saves a separate drawing prompt model and never displays its saved key', async () => {
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true } })
    await flushPromises()
    await page.get('[data-drawing-action="open-models"]').trigger('click')
    await page.get('[data-drawing-model="name"]').setValue('绘图模型')
    await page.get('[data-drawing-model="id"]').setValue('my-draw-model')
    await page.get('[data-drawing-model="url"]').setValue('https://example.test/v1')
    await page.get('[data-drawing-model="secret"]').setValue('drawing-secret')
    await page.get('.drawing-model-form').trigger('submit')
    await flushPromises()
    expect(api.promptSave).toHaveBeenCalledWith('qq', null, expect.objectContaining({
      model_id: 'my-draw-model', base_url: 'https://example.test/v1', secret_input: 'drawing-secret',
    }), 0, expect.any(String))
    expect((page.get('[data-drawing-model="secret"]').element as HTMLInputElement).value).toBe('')
    page.unmount()
  })

  it('switches, tests, and deletes saved prompt models in the dialog', async () => {
    const a = { id: 'a', name: '模型 A', adapter_kind: 'openai_chat_completion', model_id: 'a',
      base_url: '', network_mode: 'direct', row_version: 1, revision: 1, secret_configured: true }
    const b = { ...a, id: 'b', name: '模型 B', model_id: 'b' }
    api.prompt.mockResolvedValueOnce({ items: [a, b], active_id: 'a', selection_version: 1 })
      .mockResolvedValueOnce({ items: [a, b], active_id: 'b', selection_version: 2 })
      .mockResolvedValueOnce({ items: [a], active_id: null, selection_version: 3 })
    api.promptActivate.mockResolvedValue({ active_id: 'b', selection_version: 2 })
    api.promptTest.mockResolvedValue({ state: 'success', message: '连接测试通过。' })
    api.promptDelete.mockResolvedValue({ deleted: true, active_id: null, selection_version: 3 })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true } })
    await flushPromises()
    expect(page.text()).toContain('当前生效：模型 A')
    await page.get('[data-drawing-action="open-models"]').trigger('click')
    await page.get('[data-drawing-model-select="b"]').trigger('click')
    await page.findAll('button').find(button => button.text() === '设为当前')!.trigger('click')
    await flushPromises()
    expect(api.promptActivate).toHaveBeenCalledWith('qq', 'b', 1, expect.any(String))
    await page.findAll('button').find(button => button.text() === '测试连接')!.trigger('click')
    await flushPromises()
    expect(api.promptTest).toHaveBeenCalledWith('qq', 'b')
    expect(page.text()).toContain('连接测试通过')
    await page.findAll('button').find(button => button.text() === '删除')!.trigger('click')
    await flushPromises()
    expect(api.promptDelete).toHaveBeenCalledWith('qq', 'b', 1, expect.any(String))
    page.unmount(); confirm.mockRestore()
  })

  it('shows queue progress, supports force cancel, and deletes selected history', async () => {
    let removed = false
    const common = { operation: 'draw', origin: 'qq', error_code: null, created_at: '2026-11-09',
      audit_status: 'pending', cleanup_status: 'done', cancel_requested: false, deletion_state: 'visible',
      scope_kind: 'qq_group', target_id: '123456', queue_position: null, progress: null }
    const active = { ...common, id: 'running-1', generation_status: 'running', send_status: 'none',
      processing_stage: 'executing', queue_position: 0,
      progress: { node_id: '3', node_name: 'KSampler', value: 4, max: 10, updated_at: '2026-11-09' } }
    const old = { ...common, id: 'history-1', generation_status: 'succeeded', send_status: 'sent',
      processing_stage: 'finished', has_image: true }
    api.tasks.mockImplementation(async (_id, view) => ({ items: view === 'active' ? [active] : removed ? [] :
      [{ ...active, progress: null, processing_stage: 'waiting_native' }, old], next_after_id: null }))
    api.taskDetail.mockResolvedValue({ ...old, wish_text: '画一只猫', positive: 'cat', negative: 'blur' })
    api.cancel.mockResolvedValue({ status: 'cancelling' })
    api.taskDelete.mockImplementation(async () => { removed = true; return { deleted: ['history-1'], pending: [] } })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const confirmDelete = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true }, global: { stubs: cleanupStubs } })
    await flushPromises()
    await page.get('[data-drawing-tab="tasks"]').trigger('click')
    expect(page.text()).toContain('节点 #3 · KSampler · 4 / 10')
    expect(page.findAll('.drawing-history-row')).toHaveLength(2)
    expect(page.text()).not.toContain('当前队列')
    await page.findAll('button').find(button => button.text() === '强制结束')!.trigger('click')
    await flushPromises()
    expect(api.cancel).toHaveBeenCalledWith('qq', 'running-1', expect.any(String))
    await page.findAll('button').find(button => button.text() === '详情')!.trigger('click')
    await flushPromises()
    expect(page.text()).toContain('画一只猫')
    expect(page.find('.drawing-history-table input[type="checkbox"]').exists()).toBe(false)
    await page.findAll('button').find(button => button.text() === '批量清理')!.trigger('click')
    expect(page.get('.drawing-cleanup-list').text()).not.toContain('running-1')
    await page.get('.drawing-cleanup-list input[type="checkbox"]').setValue(true)
    await page.findAll('button').find(button => button.text().startsWith('删除选中'))!.trigger('click')
    await flushPromises()
    expect(api.taskDelete).toHaveBeenCalledWith('qq', ['history-1'], expect.any(String))
    page.unmount(); confirm.mockRestore(); confirmDelete.mockRestore()
  })

  it('clears selection and reloads the first page when old history is pending deletion', async () => {
    const row = { id: 'old-task', operation: 'draw', origin: 'qq', generation_status: 'succeeded',
      audit_status: 'allow', send_status: 'sent', cleanup_status: 'done', error_code: null,
      created_at: '2026-11-09', processing_stage: 'finished', cancel_requested: false,
      deletion_state: 'visible', scope_kind: 'qq_group', target_id: '123456', queue_position: null, progress: null }
    api.tasks.mockImplementation(async (_id, view, cursor) => view === 'active' ? { items: [], next_after_id: null }
      : cursor ? { items: [row], next_after_id: null } : { items: [], next_after_id: 'next' })
    api.taskDelete.mockResolvedValue({ deleted: [], pending: ['old-task'] })
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true }, global: { stubs: cleanupStubs } })
    await flushPromises()
    await page.get('[data-drawing-tab="tasks"]').trigger('click')
    await page.findAll('button').find(button => button.text() === '加载更多')!.trigger('click')
    await flushPromises()
    await page.findAll('button').find(button => button.text() === '批量清理')!.trigger('click')
    await page.get('.drawing-cleanup-list input[type="checkbox"]').setValue(true)
    await page.findAll('button').find(button => button.text().startsWith('删除选中'))!.trigger('click')
    await flushPromises()
    expect(page.text()).toContain('1 条等待清理')
    expect(page.find('.drawing-cleanup-list input').exists()).toBe(false)
    expect(page.findAll('button').find(button => button.text() === '批量清理')!.attributes('disabled')).toBeDefined()
    page.unmount(); confirm.mockRestore()
  })

  it('only offers loaded, deletable history in the cleanup dialog and cancels safely', async () => {
    const base = { operation: 'draw', origin: 'qq', generation_status: 'succeeded', audit_status: 'allow',
      send_status: 'sent', cleanup_status: 'done', error_code: null, created_at: '2026-11-09',
      processing_stage: 'finished', cancel_requested: false, deletion_state: 'visible',
      scope_kind: 'qq_group', target_id: '123456', queue_position: null, progress: null }
    api.tasks.mockImplementation(async (_id, view) => ({ items: view === 'active' ? [] : [
      { ...base, id: 'eligible' }, { ...base, id: 'not-cleaned', cleanup_status: 'deferred' },
    ], next_after_id: 'more' }))
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true }, global: { stubs: cleanupStubs } })
    await flushPromises()
    await page.get('[data-drawing-tab="tasks"]').trigger('click')
    expect(page.find('.drawing-history-table input[type="checkbox"]').exists()).toBe(false)
    expect(page.findAll('.drawing-flow-trigger').every(button => !button.text().includes('⌄'))).toBe(true)
    await page.findAll('button').find(button => button.text() === '批量清理')!.trigger('click')
    expect(page.get('.drawing-cleanup-list').text()).toContain('eligible')
    expect(page.get('.drawing-cleanup-list').text()).not.toContain('not-cleaned')
    await page.get('.drawing-cleanup-list input').setValue(true)
    await page.findAll('button').find(button => button.text().startsWith('删除选中'))!.trigger('click')
    await flushPromises()
    expect(api.taskDelete).not.toHaveBeenCalled()
    expect(page.find('.drawing-cleanup-list input').exists()).toBe(true)
    page.unmount(); confirm.mockRestore()
  })

  it('shows queued tasks even when the history endpoint is empty', async () => {
    const queued = { id: 'queued-task', operation: 'draw', origin: 'qq', generation_status: 'queued',
      audit_status: 'pending', send_status: 'none', cleanup_status: 'none', error_code: null,
      created_at: '2026-11-09', processing_stage: 'queued', cancel_requested: false,
      deletion_state: 'visible', scope_kind: 'qq_group', target_id: '123456', queue_position: 2, progress: null }
    api.tasks.mockImplementation(async (_id, view) => ({ items: view === 'active' ? [queued] : [], next_after_id: null }))
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true }, global: { stubs: cleanupStubs } })
    await flushPromises()
    await page.get('[data-drawing-tab="tasks"]').trigger('click')
    expect(page.findAll('.drawing-history-row')).toHaveLength(1)
    expect(page.text()).toContain('前方 2 项共享任务')
    expect(page.text()).toContain('群 123456')
    expect(page.findAll('button').some(button => button.text() === '强制结束')).toBe(true)
    expect(page.findAll('button').find(button => button.text() === '批量清理')!.attributes('disabled')).toBeDefined()
    page.unmount()
  })

  it('opens task prompts in a drawer and ignores late responses after switching or closing', async () => {
    const base = { operation: 'draw', origin: 'admin_preview', generation_status: 'succeeded', audit_status: 'allow',
      send_status: 'none', cleanup_status: 'done', error_code: null, created_at: '2026-11-09',
      processing_stage: 'finished', cancel_requested: false, deletion_state: 'visible',
      scope_kind: null, target_id: null, queue_position: null, progress: null }
    const first = { ...base, id: 'first' }, second = { ...base, id: 'second' }
    api.tasks.mockImplementation(async (_id, view) => ({ items: view === 'active' ? [] : [first, second], next_after_id: null }))
    const pending: Record<string, (value: unknown) => void> = {}
    api.taskDetail.mockImplementation((_id, task) => new Promise(resolve => { pending[task] = resolve }))
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true }, global: { stubs: cleanupStubs } })
    await flushPromises()
    await page.get('[data-drawing-tab="tasks"]').trigger('click')
    const rows = page.findAll('.drawing-history-row')
    await rows[0]!.findAll('button').find(button => button.text() === '详情')!.trigger('click')
    expect(page.get('aside[role="dialog"]').text()).toContain('正在读取')
    await rows[1]!.findAll('button').find(button => button.text() === '详情')!.trigger('click')
    pending.second!({ ...second, positive: 'second prompt', negative: 'blur' })
    await flushPromises()
    pending.first!({ ...first, positive: 'stale prompt', negative: '' })
    await flushPromises()
    expect(page.get('aside[role="dialog"]').text()).toContain('second prompt')
    expect(page.text()).not.toContain('stale prompt')
    await page.findAll('button').find(button => button.text() === '关闭侧栏')!.trigger('click')
    expect(page.find('aside[role="dialog"]').exists()).toBe(false)
    await rows[0]!.findAll('button').find(button => button.text() === '详情')!.trigger('click')
    const afterClose = pending.first!
    await page.findAll('button').find(button => button.text() === '关闭侧栏')!.trigger('click')
    afterClose({ ...first, positive: 'late prompt', negative: '' })
    await flushPromises()
    expect(page.find('aside[role="dialog"]').exists()).toBe(false)
    expect(page.text()).not.toContain('late prompt')
    page.unmount()
  })

  it('previews and downloads an authorized image inside the prompt drawer', async () => {
    const task = { id: 'image-task', operation: 'draw', origin: 'admin_preview', generation_status: 'succeeded',
      audit_status: 'allow', send_status: 'none', cleanup_status: 'done', error_code: null,
      created_at: '2026-11-09', processing_stage: 'finished', cancel_requested: false,
      deletion_state: 'visible', scope_kind: null, target_id: null, queue_position: null, progress: null, has_image: true }
    api.tasks.mockImplementation(async (_id, view) => ({ items: view === 'active' ? [] : [task], next_after_id: null }))
    api.taskDetail.mockResolvedValue({ ...task, positive: 'cat', negative: 'blur' })
    api.image.mockResolvedValue(new Blob(['image'], { type: 'image/png' }))
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:drawer-image')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true }, global: { stubs: cleanupStubs } })
    await flushPromises()
    await page.get('[data-drawing-tab="tasks"]').trigger('click')
    await page.findAll('button').find(button => button.text() === '详情')!.trigger('click')
    await flushPromises()
    const drawer = page.get('aside[role="dialog"]')
    expect(drawer.get('img[alt="绘图任务生成图片预览"]').attributes('src')).toBe('blob:drawer-image')
    await drawer.findAll('button').find(button => button.text() === '下载')!.trigger('click')
    await flushPromises()
    expect(click).toHaveBeenCalledOnce()
    expect(api.image).toHaveBeenCalledTimes(2)
    await drawer.findAll('button').find(button => button.text() === '关闭侧栏')!.trigger('click')
    expect(revoke).toHaveBeenCalledWith('blob:drawer-image')
    page.unmount(); create.mockRestore(); revoke.mockRestore(); click.mockRestore()
  })

  it('does not load unavailable images and ignores stale image responses', async () => {
    const base = { operation: 'draw', origin: 'admin_preview', generation_status: 'succeeded', audit_status: 'allow',
      send_status: 'none', cleanup_status: 'done', error_code: null, created_at: '2026-11-09',
      processing_stage: 'finished', cancel_requested: false, deletion_state: 'visible',
      scope_kind: null, target_id: null, queue_position: null, progress: null }
    const first = { ...base, id: 'image-first', has_image: true }, second = { ...base, id: 'image-second', has_image: false }
    api.tasks.mockImplementation(async (_id, view) => ({ items: view === 'active' ? [] : [first, second], next_after_id: null }))
    api.taskDetail.mockImplementation(async (_id, task) => ({ ...(task === first.id ? first : second), positive: 'cat' }))
    let resolveImage!: (value: Blob) => void
    api.image.mockImplementation(() => new Promise(resolve => { resolveImage = resolve }))
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:stale')
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true }, global: { stubs: cleanupStubs } })
    await flushPromises()
    await page.get('[data-drawing-tab="tasks"]').trigger('click')
    const rows = page.findAll('.drawing-history-row')
    await rows[0]!.findAll('button').find(button => button.text() === '详情')!.trigger('click')
    await flushPromises()
    expect(page.get('aside[role="dialog"]').text()).toContain('正在读取图片')
    await rows[1]!.findAll('button').find(button => button.text() === '详情')!.trigger('click')
    await flushPromises()
    resolveImage(new Blob(['old image'], { type: 'image/png' }))
    await flushPromises()
    expect(create).not.toHaveBeenCalled()
    expect(api.image).toHaveBeenCalledTimes(1)
    expect(page.get('aside[role="dialog"]').find('img').exists()).toBe(false)
    expect(page.get('aside[role="dialog"]').findAll('button').some(button => button.text() === '下载')).toBe(false)
    page.unmount(); create.mockRestore()
  })

  it('shows a preview error without hiding the saved prompt', async () => {
    const task = { id: 'image-error', operation: 'draw', origin: 'admin_preview', generation_status: 'succeeded',
      audit_status: 'allow', send_status: 'none', cleanup_status: 'done', error_code: null,
      created_at: '2026-11-09', processing_stage: 'finished', cancel_requested: false,
      deletion_state: 'visible', scope_kind: null, target_id: null, queue_position: null, progress: null, has_image: true }
    api.tasks.mockImplementation(async (_id, view) => ({ items: view === 'active' ? [] : [task], next_after_id: null }))
    api.taskDetail.mockResolvedValue({ ...task, positive: 'cat' })
    api.image.mockRejectedValue(new Error('unavailable'))
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true }, global: { stubs: cleanupStubs } })
    await flushPromises()
    await page.get('[data-drawing-tab="tasks"]').trigger('click')
    await page.findAll('button').find(button => button.text() === '详情')!.trigger('click')
    await flushPromises()
    expect(page.get('aside[role="dialog"]').text()).toContain('图片暂不可查看')
    expect(page.get('aside[role="dialog"]').text()).toContain('cat')
    page.unmount()
  })

  it('rechecks image access when downloading from the drawer', async () => {
    const task = { id: 'image-access', operation: 'draw', origin: 'admin_preview', generation_status: 'succeeded',
      audit_status: 'allow', send_status: 'none', cleanup_status: 'done', error_code: null,
      created_at: '2026-11-09', processing_stage: 'finished', cancel_requested: false,
      deletion_state: 'visible', scope_kind: null, target_id: null, queue_position: null, progress: null, has_image: true }
    api.tasks.mockImplementation(async (_id, view) => ({ items: view === 'active' ? [] : [task], next_after_id: null }))
    api.taskDetail.mockResolvedValue({ ...task, positive: 'cat' })
    api.image.mockResolvedValueOnce(new Blob(['image'], { type: 'image/png' })).mockRejectedValueOnce(new Error('denied'))
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:prior-image')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true }, global: { stubs: cleanupStubs } })
    await flushPromises()
    await page.get('[data-drawing-tab="tasks"]').trigger('click')
    await page.findAll('button').find(button => button.text() === '详情')!.trigger('click')
    await flushPromises()
    await page.get('aside[role="dialog"]').findAll('button').find(button => button.text() === '下载')!.trigger('click')
    await flushPromises()
    expect(api.image).toHaveBeenCalledTimes(2)
    expect(click).not.toHaveBeenCalled()
    expect(revoke).toHaveBeenCalledWith('blob:prior-image')
    expect(page.get('aside[role="dialog"]').text()).toContain('图片已清理或暂不可下载')
    page.unmount(); create.mockRestore(); revoke.mockRestore(); click.mockRestore()
  })

  it('previews and downloads a GIF with the correct filename', async () => {
    const task = { id: 'gif-task-123', operation: 'draw', origin: 'admin_preview', generation_status: 'succeeded',
      audit_status: 'allow', send_status: 'none', cleanup_status: 'done', error_code: null,
      created_at: '2026-11-09', processing_stage: 'finished', cancel_requested: false,
      deletion_state: 'visible', scope_kind: null, target_id: null, queue_position: null, progress: null, has_image: true }
    api.tasks.mockImplementation(async (_id, view) => ({ items: view === 'active' ? [] : [task], next_after_id: null }))
    api.taskDetail.mockResolvedValue({ ...task, positive: 'a cat GIF' })
    api.image.mockResolvedValue(new Blob(['gif'], { type: 'image/gif' }))
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:gif-preview')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const names: string[] = []
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download)
    })
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true }, global: { stubs: cleanupStubs } })
    await flushPromises()
    await page.get('[data-drawing-tab="tasks"]').trigger('click')
    await page.findAll('button').find(button => button.text() === '详情')!.trigger('click')
    await flushPromises()
    const drawer = page.get('aside[role="dialog"]')
    expect(drawer.get('img').attributes('src')).toBe('blob:gif-preview')
    await drawer.findAll('button').find(button => button.text() === '下载')!.trigger('click')
    await flushPromises()
    expect(names).toEqual(['绘图-gif-task.gif'])
    page.unmount(); create.mockRestore(); revoke.mockRestore(); click.mockRestore()
  })

  it('keeps an image under output audit actionable and out of cleanup', async () => {
    const auditing = { id: 'audit-task', operation: 'draw', origin: 'admin_preview', generation_status: 'succeeded',
      audit_status: 'pending', send_status: 'none', cleanup_status: 'none', error_code: null,
      created_at: '2026-11-09', processing_stage: 'output_audit', cancel_requested: false,
      deletion_state: 'visible', scope_kind: null, target_id: null, queue_position: null, progress: null }
    api.tasks.mockImplementation(async (_id, view) => ({ items: view === 'active' ? [] : [auditing], next_after_id: null }))
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true }, global: { stubs: cleanupStubs } })
    await flushPromises()
    await page.get('[data-drawing-tab="tasks"]').trigger('click')
    const row = page.get('.drawing-history-row')
    expect(row.text()).toContain('审核生成图片')
    expect(row.findAll('button').some(button => button.text() === '强制结束')).toBe(true)
    expect(page.findAll('button').find(button => button.text() === '批量清理')!.attributes('disabled')).toBeDefined()
    page.unmount()
  })

  it('does not allow cleanup if active tasks cannot be read', async () => {
    const task = { id: 'history', operation: 'draw', origin: 'qq', generation_status: 'succeeded',
      audit_status: 'allow', send_status: 'sent', cleanup_status: 'done', error_code: null,
      created_at: '2026-11-09', processing_stage: 'finished', cancel_requested: false,
      deletion_state: 'visible', scope_kind: 'qq_group', target_id: '123456', queue_position: null, progress: null }
    api.tasks.mockImplementation(async (_id, view) => {
      if (view === 'active') throw new Error('offline')
      return { items: [task], next_after_id: null }
    })
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true }, global: { stubs: cleanupStubs } })
    await flushPromises()
    await page.get('[data-drawing-tab="tasks"]').trigger('click')
    expect(page.text()).toContain('无法读取绘图任务')
    expect(page.findAll('button').find(button => button.text() === '批量清理')!.attributes('disabled')).toBeDefined()
    page.unmount()
  })

  it('does not delete if a selected task becomes ineligible while confirming', async () => {
    let eligible = true
    const task = { id: 'changing', operation: 'draw', origin: 'qq', generation_status: 'succeeded',
      audit_status: 'allow', send_status: 'sent', cleanup_status: 'done', error_code: null,
      created_at: '2026-11-09', processing_stage: 'finished', cancel_requested: false,
      deletion_state: 'visible', scope_kind: 'qq_group', target_id: '123456', queue_position: null, progress: null }
    api.tasks.mockImplementation(async (_id, view) => ({ items: view === 'active' ? [] : [
      eligible ? task : { ...task, cleanup_status: 'deferred' },
    ], next_after_id: null }))
    let approve!: (value: never) => void
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockImplementation(() => new Promise(resolve => { approve = resolve }))
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true }, global: { stubs: cleanupStubs } })
    await flushPromises()
    await page.get('[data-drawing-tab="tasks"]').trigger('click')
    await page.findAll('button').find(button => button.text() === '批量清理')!.trigger('click')
    await page.get('.drawing-cleanup-list input').setValue(true)
    await page.findAll('button').find(button => button.text().startsWith('删除选中'))!.trigger('click')
    eligible = false
    await page.findAll('button').find(button => button.text() === '刷新')!.trigger('click')
    await flushPromises()
    approve('confirm' as never)
    await flushPromises()
    expect(api.taskDelete).not.toHaveBeenCalled()
    expect(page.text()).toContain('部分任务状态已变化，请重新选择')
    page.unmount(); confirm.mockRestore()
  })

  it('limits each cleanup selection to fifty tasks', async () => {
    const task = { operation: 'draw', origin: 'qq', generation_status: 'succeeded', audit_status: 'allow',
      send_status: 'sent', cleanup_status: 'done', error_code: null, created_at: '2026-11-09',
      processing_stage: 'finished', cancel_requested: false, deletion_state: 'visible',
      scope_kind: 'qq_group', target_id: '123456', queue_position: null, progress: null }
    api.tasks.mockImplementation(async (_id, view) => ({ items: view === 'active' ? [] :
      Array.from({ length: 51 }, (_, index) => ({ ...task, id: `task-${index}` })), next_after_id: null }))
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true }, global: { stubs: cleanupStubs } })
    await flushPromises()
    await page.get('[data-drawing-tab="tasks"]').trigger('click')
    await page.findAll('button').find(button => button.text() === '批量清理')!.trigger('click')
    const inputs = page.findAll('.drawing-cleanup-list input')
    await Promise.all(inputs.slice(0, 50).map(input => input.setValue(true)))
    expect(inputs[50]!.attributes('disabled')).toBeDefined()
    await inputs[0]!.setValue(false)
    expect(inputs[50]!.attributes('disabled')).toBeUndefined()
    page.unmount()
  })

  it('edits a selected group workflow scope and R18 detection together', async () => {
    api.settings.mockResolvedValue({ service_id: 'qq', enabled: false, keep_drawing_warm: false,
      default_text_preset_id: null, default_edit_preset_id: null, row_version: 1, applied_version: 1,
      resource_configured: true, allow_private: false, event_ws_url: 'ws://bot:3001',
      comfy_base_url: 'http://host.docker.internal:8188', groups: ['123456', '789012'] })
    api.groups.mockResolvedValue([
      { group_id: '123456', mode: 'green', row_version: 1, restrict_workflows: false, allowed_preset_ids: [] },
      { group_id: '789012', mode: 'r18', row_version: 2, restrict_workflows: true, allowed_preset_ids: ['a'] },
    ])
    api.presets.mockResolvedValue([
      { id: 'a', number: 1, name: '文生图', kind: 'txt2img', enabled: true, validation_state: 'ready', lora_keys: [] },
      { id: 'b', number: 2, name: '图生图', kind: 'image_edit', enabled: true, validation_state: 'ready', lora_keys: [] },
    ])
    api.groupSave.mockResolvedValue({ group_id: '789012', mode: 'green', row_version: 3,
      restrict_workflows: true, allowed_preset_ids: ['a', 'b'] })
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true } })
    await flushPromises()
    await page.get('[data-drawing-configure-group="789012"]').trigger('click')
    expect(page.get('[data-drawing-tab="groups"]').attributes('aria-selected')).toBe('true')
    expect((page.get('[data-drawing-group-select]').element as HTMLSelectElement).value).toBe('789012')
    expect((page.get('[data-drawing-scope="restricted"]').element as HTMLInputElement).checked).toBe(true)
    await page.get('[data-drawing-allowed="b"]').setValue(true)
    await page.get('[data-drawing-r18-check]').setValue(true)
    await page.get('[data-drawing-save-group="789012"]').trigger('click')
    await flushPromises()
    expect(api.groupSave).toHaveBeenCalledWith('qq', '789012', {
      mode: 'green', restrict_workflows: true, allowed_preset_ids: ['a', 'b'],
    }, 2, expect.any(String))
    page.unmount()
  })

  it('refreshes authorized groups when returning to the drawing page', async () => {
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true } })
    await flushPromises()
    api.groups.mockResolvedValue([
      { group_id: '123456', mode: 'green', row_version: 0, restrict_workflows: false, allowed_preset_ids: [] },
      { group_id: '789012', mode: 'green', row_version: 0, restrict_workflows: false, allowed_preset_ids: [] },
    ])
    await page.setProps({ active: false })
    await page.setProps({ active: true })
    await flushPromises()
    await page.get('[data-drawing-tab="groups"]').trigger('click')
    expect(page.get('[data-drawing-group-select]').text()).toContain('789012')
    page.unmount()
  })

  it('keeps each group draft when switching and only saves the selected group', async () => {
    api.groups.mockResolvedValue([
      { group_id: '123456', mode: 'green', row_version: 1, restrict_workflows: false, allowed_preset_ids: [] },
      { group_id: '789012', mode: 'green', row_version: 2, restrict_workflows: false, allowed_preset_ids: [] },
    ])
    api.groupSave.mockResolvedValue({ group_id: '789012', mode: 'r18', row_version: 3,
      restrict_workflows: false, allowed_preset_ids: [] })
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true } })
    await flushPromises()
    await page.get('[data-drawing-tab="groups"]').trigger('click')
    await page.get('[data-drawing-scope="restricted"]').setValue(true)
    await page.get('[data-drawing-group-select]').setValue('789012')
    await page.get('[data-drawing-r18-check]').setValue(false)
    await page.get('[data-drawing-save-group="789012"]').trigger('click')
    await flushPromises()
    expect(api.groupSave).toHaveBeenCalledTimes(1)
    expect(api.groupSave).toHaveBeenCalledWith('qq', '789012',
      { mode: 'r18', restrict_workflows: false, allowed_preset_ids: [] }, 2, expect.any(String))
    await page.get('[data-drawing-group-select]').setValue('123456')
    expect((page.get('[data-drawing-scope="restricted"]').element as HTMLInputElement).checked).toBe(true)
    expect(page.text()).toContain('当前群有未保存的修改')
    page.unmount()
  })

  it('uses automatic model retention and saves only the current connection', async () => {
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true } })
    await flushPromises()
    await page.get('[data-drawing-field="enabled"]').setValue(true)
    expect(page.find('[data-drawing-field="keep-warm"]').exists()).toBe(false)
    expect(page.text()).toContain('空闲 60 秒')
    await page.get('[data-drawing-action="save-settings"]').trigger('click')
    await flushPromises()
    expect(api.save).toHaveBeenCalledWith('qq', expect.objectContaining({ enabled: true, keep_drawing_warm: false }),
      1, expect.any(String))
    expect(api.preview).not.toHaveBeenCalled()
    page.unmount()
  })

  it('saves the automatic policy when an older configuration had infinite retention', async () => {
    api.settings.mockResolvedValue({ service_id: 'qq', enabled: true, keep_drawing_warm: true,
      default_text_preset_id: null, default_edit_preset_id: null, row_version: 1, applied_version: 1,
      resource_configured: true })
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true } })
    await flushPromises()
    await page.get('[data-drawing-field="enabled"]').setValue(false)
    await page.get('[data-drawing-action="save-settings"]').trigger('click')
    await flushPromises()
    expect(api.save).toHaveBeenCalledWith('qq', expect.objectContaining({ keep_drawing_warm: false }),
      1, expect.any(String))
    page.unmount()
  })

  it('sets the mode for one authorized group without changing the AI vision switch', async () => {
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true } })
    await flushPromises()
    await page.get('[data-drawing-tab="groups"]').trigger('click')
    expect(page.text()).toContain('普通及轻度敏感类放行')
    expect(page.text()).toContain('可疑、明确类及审核异常时不发送')
    await page.get('[data-drawing-r18-check]').setValue(false)
    await page.get('[data-drawing-save-group="123456"]').trigger('click')
    await flushPromises()
    expect(api.groupSave).toHaveBeenCalledWith('qq', '123456', {
      mode: 'r18', restrict_workflows: false, allowed_preset_ids: [],
    }, 0, expect.any(String))
    expect(api.save).not.toHaveBeenCalled()
    page.unmount()
  })

  it('shows unverified resources honestly and explains the group commands', async () => {
    api.resources.mockResolvedValue({ state: 'unconfigured' })
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true } })
    await flushPromises()
    expect(page.text()).toContain('未配置')
    expect(page.text()).toContain('/wf0')
    expect(page.text()).toContain('/p2p')
    expect(page.text()).toContain('回复当前会话中的单张图片')
    expect(page.text()).toContain('/tag')
    expect(page.text()).toContain('/wfN 画面描述')
    expect(page.text()).toContain('普通聊天不会触发绘图')
    page.unmount()
  })

  it('shows the shared queue and WD14 verification state', async () => {
    api.resources.mockResolvedValue({ state: 'available', active: 0, queued: 2, drawing_resources: 0 })
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true } })
    await flushPromises()
    expect(page.text()).toContain('排队 2 个任务')
    expect(page.text()).toContain('WD14 节点已就绪，模型文件将在标签请求时核验')
    expect(page.text()).toContain('当前未保留生图模型')
    page.unmount()
  })

  it('shows a QQ event address conflict instead of claiming drawing is connected', async () => {
    api.resources.mockResolvedValue({ state: 'available', qq_connection: 'conflict' })
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true } })
    await flushPromises()
    expect(page.text()).toContain('绘图的 QQ 事件地址与当前连接不一致')
    page.unmount()
  })

  it('requests an idle release for the current connection', async () => {
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true } })
    await flushPromises()
    await page.get('[data-drawing-tab="tasks"]').trigger('click')
    await page.findAll('button').find(button => button.text() === '释放资源')!.trigger('click')
    await flushPromises()
    expect(api.release).toHaveBeenCalledWith('qq')
    expect(page.text()).toContain('已请求释放当前连接的空闲生图模型')
    page.unmount()
  })

  it('explains why a green preview cannot run without a negative prompt input', async () => {
    api.tasks.mockResolvedValue({ items: [{ id: 'preview-2', operation: 'draw', origin: 'admin_preview',
      generation_status: 'failed', audit_status: 'pending', send_status: 'none', cleanup_status: 'done',
      error_code: 'drawing_negative_unsupported', created_at: '2026-11-03', has_image: false }], next_after_id: null })
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true } })
    await flushPromises()
    await page.get('[data-drawing-tab="tasks"]').trigger('click')
    expect(page.text()).toContain('绿色模式需要工作流配置负面提示词入口')
    page.unmount()
  })

  it.each([
    ['drawing_online_moderation_blocked', '服务商内容审核未通过'],
    ['drawing_online_auth_failed', 'API 认证失败'],
    ['drawing_online_quota_exceeded', '服务商额度或预算不足'],
    ['drawing_online_rate_limited', '服务商请求频率超限'],
    ['drawing_online_model_unavailable', '线上模型不可用'],
    ['drawing_online_access_denied', '服务商拒绝访问'],
    ['drawing_online_org_verification', '完成组织验证'],
    ['drawing_online_http_400', 'HTTP 400'],
    ['drawing_online_http_402', '账单和付款状态'],
    ['drawing_online_http_429', '额度或请求频率'],
    ['drawing_online_http_418', 'HTTP 418'],
    ['drawing_online_rejected', '服务商拒绝了请求'],
  ])('displays a safe online failure reason in active and history tasks: %s', async (code, message) => {
    const item = { id: 'online-failed', operation: 'draw', origin: 'admin_preview', generation_status: 'failed',
      audit_status: 'pending', send_status: 'none', cleanup_status: 'done', error_code: code,
      created_at: '2026-11-09', processing_stage: 'finished', cancel_requested: false,
      deletion_state: 'visible', scope_kind: null, target_id: null, queue_position: null, progress: null }
    api.tasks.mockImplementation(async (_id, view) => ({ items: [{ ...item, id: view === 'active' ? 'online-active' : 'online-history' }], next_after_id: null }))
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true } })
    await flushPromises()
    await page.get('[data-drawing-tab="tasks"]').trigger('click')
    const rows = page.findAll('.drawing-history-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.find('.drawing-task-error').text()).toContain(message)
    expect(rows[1]!.find('.drawing-task-error').text()).toContain(message)
    expect(rows[1]!.text()).toContain('未进行')
    page.unmount()
  })

  it('uses a task history table and shows evidence-based execution steps', async () => {
    const base = { operation: 'draw', origin: 'qq', created_at: '2026-11-09T02:00:00Z',
      audit_status: 'pending', send_status: 'none', cleanup_status: 'none', error_code: null,
      cancel_requested: false, deletion_state: 'visible', scope_kind: 'qq_group', target_id: '123456',
      queue_position: null, progress: null, input_audit_status: 'pending', prompt_model_used: true,
      prompt_status: 'ready', has_input_image: false, resource_registration_state: 'pending', has_started: true }
    const active = { ...base, id: 'current', generation_status: 'submitting', processing_stage: 'online_waiting',
      online_request_state: 'sent', online_request_sent: true, online_image_received: false, prompt_transport_started: true }
    const failed = { ...active, id: 'failed', generation_status: 'failed', processing_stage: 'finished',
      online_request_state: 'failed', error_code: 'drawing_online_moderation_blocked', cleanup_status: 'done', has_input_image: null }
    const cancelled = { ...base, id: 'cancelled', generation_status: 'cancelled', processing_stage: 'finished',
      prompt_status: 'failed', prompt_transport_started: false, has_started: false, has_input_image: null, cancel_requested: true }
    const stoppedOnline = { ...active, id: 'stopped-online', generation_status: 'cancelled', processing_stage: 'finished',
      cancel_requested: true, has_input_image: null }
    const auditing = { ...active, id: 'auditing', generation_status: 'succeeded', processing_stage: 'output_audit',
      online_request_state: 'received', online_image_received: true }
    const local = { ...base, id: 'local', generation_status: 'succeeded', processing_stage: 'finished',
      audit_status: 'block', send_status: 'sent', cleanup_status: 'done', prompt_model_used: false,
      prompt_transport_started: true, resource_registration_state: 'confirmed', reply_kind: 'image' }
    api.tasks.mockImplementation(async (_id, view) => ({ items: view === 'active' ? [active, auditing] : [failed, cancelled, stoppedOnline, local], next_after_id: null }))
    const popover = { template: '<div><slot name="reference" /><slot /></div>' }
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true }, global: { stubs: { ElPopover: popover } } })
    await flushPromises()
    await page.get('[data-drawing-tab="tasks"]').trigger('click')
    expect(page.find('table.drawing-history-table').exists()).toBe(true)
    const row = (id: string) => page.findAll('.drawing-history-row').find(item => item.text().includes(id))!
    const step = (wrapper: ReturnType<typeof row>, name: string) => wrapper.get(`[data-flow-stage="${name}"]`)
    expect(step(row('current'), '服务商生成').attributes('data-flow-tone')).toBe('warning')
    expect(row('current').text()).toContain('请求已发送 · 未收到图片')
    expect(step(row('failed'), '许愿提示词整理').attributes('data-flow-tone')).toBe('success')
    expect(step(row('failed'), '参考图审核').text()).toContain('未记录')
    expect(step(row('failed'), '服务商生成').attributes('data-flow-tone')).toBe('danger')
    expect(row('failed').text()).toContain('服务商内容审核未通过')
    expect(step(row('cancelled'), '许愿提示词整理').text()).toContain('未记录')
    expect(step(row('cancelled'), '许愿提示词整理').attributes('data-flow-tone')).toBe('neutral')
    expect(row('cancelled').get('.drawing-flow-trigger').classes()).toContain('status-badge--danger')
    expect(step(row('stopped-online'), '服务商生成').attributes('data-flow-tone')).toBe('danger')
    expect(step(row('stopped-online'), '服务商生成').text()).toContain('已结束')
    expect(step(row('auditing'), '生成图审核').attributes('data-flow-tone')).toBe('warning')
    expect(step(row('local'), 'ComfyUI 生成').attributes('data-flow-tone')).toBe('success')
    expect(step(row('local'), '生成图审核').attributes('data-flow-tone')).toBe('success')
    expect(step(row('local'), '发送结果').text()).toContain('已发送')
    expect(page.findAll('.drawing-flow')).toHaveLength(6)
    const trigger = row('failed').get('.drawing-flow-trigger')
    await trigger.trigger('mouseenter')
    expect(trigger.attributes('aria-expanded')).toBe('true')
    await trigger.trigger('focus')
    await trigger.trigger('click')
    expect(trigger.attributes('aria-expanded')).toBe('true')
    await trigger.trigger('keydown', { key: 'Escape' })
    expect(trigger.attributes('aria-expanded')).toBe('false')
    page.unmount()
  })

  it('explains when an uncertain green audit prevents a preview', async () => {
    api.tasks.mockResolvedValue({ items: [{ id: 'preview-3', operation: 'draw', origin: 'admin_preview',
      generation_status: 'succeeded', audit_status: 'unknown', send_status: 'none', cleanup_status: 'done',
      error_code: 'drawing_audit_unknown', created_at: '2026-11-03', has_image: false }], next_after_id: null })
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true } })
    await flushPromises()
    await page.get('[data-drawing-tab="tasks"]').trigger('click')
    expect(page.text()).toContain('审核无法确认，图片未发送或展示')
    expect(page.findAll('button').some(button => button.text() === '查看预览')).toBe(false)
    page.unmount()
  })

  it('combines prompt and image preview in one task detail drawer', async () => {
    const item = { id: 'preview-1', operation: 'draw', origin: 'admin_preview',
      generation_status: 'succeeded', audit_status: 'allow', send_status: 'none', cleanup_status: 'done',
      error_code: null, created_at: '2026-11-03', has_image: true }
    api.tasks.mockImplementation(async (_id, view) => ({ items: view === 'active' ? [] : [item], next_after_id: null }))
    api.taskDetail.mockResolvedValue({ ...item, positive: 'cat by the window' })
    api.image.mockResolvedValue(new Blob(['image'], { type: 'image/png' }))
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true }, global: { stubs: cleanupStubs } })
    await flushPromises()
    await page.get('[data-drawing-tab="tasks"]').trigger('click')
    const row = page.get('.drawing-history-row')
    expect(row.findAll('button').filter(button => button.text() === '详情')).toHaveLength(1)
    expect(row.findAll('button').some(button => ['提示词', '预览'].includes(button.text()))).toBe(false)
    await row.findAll('button').find(button => button.text() === '详情')!.trigger('click')
    await flushPromises()
    expect(api.taskDetail).toHaveBeenCalledWith('qq', 'preview-1')
    expect(api.image).toHaveBeenCalledWith('qq', 'preview-1')
    expect(page.get('aside[role="dialog"]').text()).toContain('cat by the window')
    expect(page.get('aside[role="dialog"] img[alt="绘图任务生成图片预览"]').attributes('src')).toBe('blob:preview')
    expect(page.find('.drawing-preview-image').exists()).toBe(false)
    page.unmount()
    expect(create).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalledWith('blob:preview')
  })

  it.each([
    [{ stage: 'input', categories: ['sexual', 'violence'] }, '请求输入', '性内容、暴力'],
    [{ stage: 'output', categories: ['harassment'] }, '生成结果', '骚扰'],
    [{ stage: 'unknown', categories: ['unrecognized'] }, '未知', '未识别类别'],
    [null, '未提供或未记录', '未提供或未记录'],
  ])('shows recorded provider moderation details in the task drawer', async (details, stage, categories) => {
    const item = { id: 'blocked', operation: 'draw', origin: 'qq', generation_status: 'failed',
      audit_status: 'pending', send_status: 'sent', cleanup_status: 'done',
      error_code: 'drawing_online_moderation_blocked', created_at: '2026-11-09', has_image: false }
    api.tasks.mockImplementation(async (_id, view) => ({ items: view === 'active' ? [] : [item], next_after_id: null }))
    api.taskDetail.mockResolvedValue({ ...item, positive: 'cat', online_moderation_details: details })
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true }, global: { stubs: cleanupStubs } })
    await flushPromises()
    await page.get('[data-drawing-tab="tasks"]').trigger('click')
    await page.findAll('button').find(button => button.text() === '详情')!.trigger('click')
    await flushPromises()
    const drawer = page.get('aside[role="dialog"]')
    expect(drawer.text()).toContain(`审核阶段：${stage}`)
    expect(drawer.text()).toContain(`原因类别：${categories}`)
    page.unmount()
  })

  it('accepts one prompt field with inline negative markers for administrator preview', async () => {
    api.presets.mockResolvedValue([{ id: 'online', number: 6, name: '线上', kind: 'both', engine: 'openai',
      enabled: true, revision: 1, row_version: 1, validation_state: 'ready', lora_keys: [] }])
    api.preview.mockResolvedValue({ task_id: 'new-task' })
    const page = mount(AiDrawingSettings, { props: { serviceId: 'qq', active: true } })
    await flushPromises()
    await page.get('[data-drawing-tab="workflows"]').trigger('click')
    await page.findAll('button').find(button => button.text() === '试运行（计费）')!.trigger('click')
    expect(page.findAll('.drawing-preview textarea')).toHaveLength(1)
    expect(page.get('.drawing-preview').text()).toContain('【负面】')
    await page.get('.drawing-preview textarea').setValue('1girl【NP】blur')
    await page.findAll('button').find(button => button.text() === '提交试运行')!.trigger('click')
    await flushPromises()
    const body = api.preview.mock.calls[0]![2] as FormData
    expect(body.get('positive')).toBe('1girl【NP】blur')
    expect(body.get('negative')).toBe('')
    page.unmount()
  })
})
