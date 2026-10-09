import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'
import { ElMessageBox } from 'element-plus'

const readDraft = vi.hoisted(() => vi.fn())
const writeDraft = vi.hoisted(() => vi.fn())
const deleteDraft = vi.hoisted(() => vi.fn())
vi.mock('../src/modules/maa/editor/editor-draft', () => ({ readDraft, writeDraft, deleteDraft }))

const openScript = vi.hoisted(() => vi.fn())
const fetchScripts = vi.hoisted(() => vi.fn())
const fetchApplicationDevices = vi.hoisted(() => vi.fn())
const capturePhoneScreenshot = vi.hoisted(() => vi.fn())
const readImportedScreenshot = vi.hoisted(() => vi.fn())
const saveScriptDocument = vi.hoisted(() => vi.fn())

vi.mock('../src/shared/api/maa-script-editor', () => ({
  openScript,
  saveScriptDocument,
}))
vi.mock('../src/shared/api/maa', () => ({ fetchScripts }))
vi.mock('../src/shared/api/maa-applicability', () => ({ fetchApplicationDevices }))
vi.mock('../src/modules/maa/editor/screenshot-connection', () => ({ capturePhoneScreenshot }))
vi.mock('../src/modules/maa/editor/imported-screenshot', () => ({ readImportedScreenshot }))
vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
  onBeforeRouteUpdate: vi.fn(),
}))

import ScriptWorkflowPanel from '../src/modules/maa/editor/ScriptWorkflowPanel.vue'
import StepImageBindings from '../src/modules/maa/editor/StepImageBindings.vue'
import WorkflowCanvas from '../src/modules/maa/editor/WorkflowCanvas.vue'
import ScriptQuickTest from '../src/modules/maa/editor/ScriptQuickTest.vue'
import StepActionForm from '../src/modules/maa/editor/StepActionForm.vue'
import WorkflowOutline from '../src/modules/maa/editor/WorkflowOutline.vue'
import GlobalPopupRuleForm from '../src/modules/maa/editor/GlobalPopupRuleForm.vue'
import StepRegionField from '../src/modules/maa/editor/StepRegionField.vue'

const script = {
  script_id: 'script-1',
  application_id: 'application-1',
  name: '编辑器脚本',
  script_type: 'module_process',
  status: 'active',
  current_version_id: 'published-v1',
  candidate_version_id: 'candidate-v2',
  row_version: 2,
  created_at: '',
  updated_at: '',
}

const stubs = {
  ElAlert: true,
  ElButton: true,
  ElDrawer: { template: '<section><slot /></section>' },
  ScriptQuickTest: true,
  ScriptStaticCheck: true,
  StepActionForm: true,
  StepAssertionForm: true,
  StepCoordinatesForm: true,
  StepImageBindings: true,
  StepImageBranches: true,
  StepRecoveryForm: true,
  StepSkipForm: true,
  StepSmartSwipeForm: true,
}

it('follows current-version execution, keeps failure selected, and ignores stale results or dirty edits', async () => {
  openScript.mockResolvedValueOnce({script,document:{steps:[{action:'start'},{action:'wait',seconds:1},{action:'back'}]}})
  const wrapper=mount(ScriptWorkflowPanel,{props:{scriptId:'script-1',device:{device_id:'device-1'} as never},global:{stubs}})
  try {
    await flushPromises()
    const quick=wrapper.getComponent(ScriptQuickTest), canvas=wrapper.getComponent(WorkflowCanvas)
    const progress={sessionId:'s',versionId:'published-v1',step:2,phase:'running',completed:[1]}
    quick.vm.$emit('progress',progress); await flushPromises()
    expect(canvas.props('selected')).toBe(1)
    expect(canvas.props('activeStep')).toBe(2)
    quick.vm.$emit('progress', { ...progress, ruleName: '通知' }); await flushPromises()
    expect(canvas.props('activeStep')).toBeNull()
    expect(wrapper.find('.debug-progress').text()).toContain('00 · 全局规则 · 通知')
    expect(canvas.props('selected')).toBe(1)
    quick.vm.$emit('progress', { ...progress, phase: 'failed', ruleName: '通知' }); await flushPromises()
    expect(canvas.props('failedStep')).toBeNull()
    expect(wrapper.find('.debug-progress').text()).toContain('全局规则失败')
    quick.vm.$emit('progress',{...progress,phase:'failed'}); await flushPromises()
    expect(canvas.props('failedStep')).toBe(2)
    quick.vm.$emit('progress',{...progress,versionId:'old',step:3}); await flushPromises()
    expect(canvas.props('selected')).toBe(1)
    expect(canvas.props('activeStep')).toBeNull()
    canvas.vm.$emit('edit',1,{action:'wait',seconds:2}); await flushPromises()
    quick.vm.$emit('progress',{...progress,step:3}); await flushPromises()
    expect(canvas.props('selected')).toBe(1)
    expect(canvas.props('activeStep')).toBeNull()
  } finally { wrapper.unmount() }
})

beforeEach(() => {
  readDraft.mockReset()
  writeDraft.mockReset()
  deleteDraft.mockReset()
  openScript.mockReset()
  fetchScripts.mockReset()
  fetchApplicationDevices.mockReset()
  capturePhoneScreenshot.mockReset()
  readImportedScreenshot.mockReset()
  saveScriptDocument.mockReset()
  fetchApplicationDevices.mockResolvedValue([{ application_id: 'application-1', device_id: 'device-1' }])
  openScript.mockResolvedValue({
    script,
    document: { steps: [{ action: 'wait_click' }] },
  })
  fetchScripts.mockResolvedValue({ items: [], nextCursor: null })
})

it('opens configuration on the live phone with the parameter and debug tabs', async () => {
  const wrapper = mount(ScriptWorkflowPanel, {
    props: { scriptId: 'script-1', device: { device_id: 'device-1' } as never },
    global: { stubs },
  })
  try {
    await flushPromises()
    wrapper.getComponent(WorkflowCanvas).vm.$emit('parameters')
    await flushPromises()
    expect(wrapper.findAll('.media-tabs button').map(button => button.text())).toEqual(['手机实时画面', '截图标注'])
    expect(wrapper.findAll('.media-tabs button')[1]?.attributes('disabled')).toBeUndefined()
    expect(wrapper.findAll('.config-tabs button').map(button => button.text())).toEqual(['识别与执行', '独立规则', '调试日志'])
    expect(wrapper.find('.media-live').isVisible()).toBe(true)
    expect(wrapper.emitted('phoneDock')?.at(-1)).toEqual([true])
    expect(wrapper.emitted('phoneHidden')?.at(-1)).toEqual([false])
    expect(wrapper.text()).not.toContain('已绑定图片')
    expect(wrapper.text()).not.toContain('原始截图')
    expect(wrapper.findComponent(StepImageBindings).exists()).toBe(false)
  } finally {
    wrapper.unmount()
  }
})

it('edits legacy popup rules through the fixed global row without changing real steps', async () => {
  openScript.mockResolvedValueOnce({ script, document: { steps: [{ action: 'back' }, { action: 'home' }],
    global_popups: [
      { name: '弹窗 A', enabled: true, template_base64: 'first', click_mode: 'match_center', step_indexes: [1] },
      { name: '弹窗 B', enabled: false, template_base64: 'second', click_mode: 'match_center', step_indexes: [2] },
    ] } })
  capturePhoneScreenshot.mockResolvedValue({ blob: new Blob(['png']), width: 1080, height: 2400 })
  const wrapper = mount(ScriptWorkflowPanel, { props: { scriptId: 'script-1', device: { device_id: 'device-1' } as never,
    screenshotUrl: 'wss://terminal/screenshot' }, global: { stubs } })
  try {
    await flushPromises()
    wrapper.getComponent(WorkflowCanvas).vm.$emit('parameters')
    await flushPromises()
    wrapper.getComponent(WorkflowOutline).vm.$emit('selectGlobal')
    await flushPromises()
    expect(wrapper.get('.config-heading strong').text()).toBe('00 · 全局规则')
    expect(wrapper.getComponent(GlobalPopupRuleForm).props('document').steps).toEqual([{ action: 'back' }, { action: 'home' }])
    expect(wrapper.findAll('.config-tabs button').filter(button => button.isVisible()).map(button => button.text())).toEqual(['识别与执行', '调试日志'])
    await wrapper.findAll('.media-tabs button')[1]!.trigger('click')
    await flushPromises()
    expect(wrapper.getComponent(StepImageBindings).props()).toMatchObject({ mode: 'popup', ruleIndex: 0 })
    wrapper.getComponent(GlobalPopupRuleForm).vm.$emit('select', 1)
    await flushPromises()
    expect(wrapper.findComponent(StepImageBindings).exists()).toBe(false)
    wrapper.getComponent(WorkflowOutline).vm.$emit('toggleGlobal', false)
    await flushPromises()
    const paused = wrapper.getComponent(WorkflowOutline).props('document')
    expect(paused.steps).toEqual([{ action: 'back' }, { action: 'home' }])
    expect((paused.global_popups as Array<{ enabled: boolean }>).map(rule => rule.enabled)).toEqual([false, false])
    expect(wrapper.find('.global-node').exists()).toBe(false)
    wrapper.getComponent(WorkflowOutline).vm.$emit('toggleGlobal', true)
    await flushPromises()
    const resumed = wrapper.getComponent(WorkflowOutline).props('document')
    expect((resumed.global_popups as Array<{ enabled: boolean }>).map(rule => rule.enabled)).toEqual([true, true])
  } finally { wrapper.unmount() }
})

it('marks a newly created start script as unsaved so its default workflow can be saved', async () => {
  openScript.mockResolvedValueOnce({
    script: { ...script, script_type: 'module_start', current_version_id: null, candidate_version_id: null },
    document: { steps: [{ action: 'start' }, { action: 'launch_app', package: 'com.example.game' }] },
  })
  const wrapper = mount(ScriptWorkflowPanel, {
    props: { scriptId: 'script-1', device: { device_id: 'device-1' } as never },
    global: { stubs },
  })
  try {
    await flushPromises()
    expect(wrapper.text()).toContain('未保存')
  } finally {
    wrapper.unmount()
  }
})

it('captures a fresh native screenshot before opening annotation and invalidates it when the session changes', async () => {
  const screenshot = { blob: new Blob(['png']), width: 576, height: 1280 }
  capturePhoneScreenshot.mockResolvedValue(screenshot)
  const wrapper = mount(ScriptWorkflowPanel, {
    props: { scriptId: 'script-1', device: { device_id: 'device-1' } as never,
      screenshotUrl: 'wss://terminal/session-one/screenshot' },
    global: { stubs },
  })
  try {
    await flushPromises()
    wrapper.getComponent(WorkflowCanvas).vm.$emit('parameters')
    await flushPromises()
    expect(wrapper.findComponent(StepImageBindings).exists()).toBe(false)
    await wrapper.findAll('.media-tabs button')[1]!.trigger('click')
    await flushPromises()
    expect(capturePhoneScreenshot).toHaveBeenCalledWith('wss://terminal/session-one/screenshot', expect.any(AbortSignal))
    expect(wrapper.getComponent(StepImageBindings).props('screenshot')).toEqual(screenshot)
    await wrapper.findAll('.media-tabs button')[0]!.trigger('click')
    expect(wrapper.findComponent(StepImageBindings).exists()).toBe(false)
    await wrapper.findAll('.media-tabs button')[1]!.trigger('click')
    await flushPromises()
    expect(capturePhoneScreenshot).toHaveBeenCalledTimes(2)
    expect(wrapper.getComponent(StepImageBindings).props('screenshot')).toEqual(screenshot)
    await wrapper.setProps({ screenLandscape: true })
    await flushPromises()
    expect(wrapper.findComponent(StepImageBindings).exists()).toBe(false)
    expect(wrapper.find('.media-live').isVisible()).toBe(true)
    await wrapper.findAll('.media-tabs button')[1]!.trigger('click')
    await flushPromises()
    expect(capturePhoneScreenshot).toHaveBeenCalledTimes(3)
    await wrapper.setProps({ screenshotUrl: undefined })
    await flushPromises()
    expect(wrapper.findComponent(StepImageBindings).exists()).toBe(false)
    expect(wrapper.find('.media-live').isVisible()).toBe(true)
  } finally {
    wrapper.unmount()
  }
})

it('keeps the live view when capture fails and places step safeguards under independent rules', async () => {
  capturePhoneScreenshot.mockRejectedValue(new Error('截图连接失败'))
  const wrapper = mount(ScriptWorkflowPanel, {
    props: { scriptId: 'script-1', device: { device_id: 'device-1' } as never,
      screenshotUrl: 'wss://terminal/session-one/screenshot' },
    global: { stubs },
  })
  try {
    await flushPromises()
    wrapper.getComponent(WorkflowCanvas).vm.$emit('parameters')
    await flushPromises()
    await wrapper.findAll('.media-tabs button')[1]!.trigger('click')
    await flushPromises()
    expect(wrapper.find('.media-live').isVisible()).toBe(true)
    expect(wrapper.get('.config-media el-alert-stub').attributes('title')).toBe('截图连接失败')
    expect(wrapper.findComponent(StepImageBindings).exists()).toBe(false)
    await wrapper.findAll('.config-tabs button')[1]!.trigger('click')
    expect(wrapper.find('.config-tabs button.active').text()).toBe('独立规则')
    expect(wrapper.find('.config-form-scroll').html()).toContain('step-assertion-form-stub')
    expect(wrapper.find('.config-form-scroll').html()).toContain('step-skip-form-stub')
    expect(wrapper.find('.config-form-scroll').html()).toContain('step-recovery-form-stub')
    expect(wrapper.find('.config-form-scroll').html()).not.toContain('independent-rules-form-stub')
  } finally { wrapper.unmount() }
})

it('saves node edits with one save action and keeps the canvas instance when returning', async () => {
  const wrapper = mount(ScriptWorkflowPanel, {
    props: { scriptId: 'script-1', device: { device_id: 'device-1' } as never },
    global: { stubs },
  })
  try {
    await flushPromises()
    const canvas = wrapper.getComponent(WorkflowCanvas)
    canvas.vm.$emit('parameters')
    await flushPromises()
    expect(wrapper.text()).toContain('脚本步骤')
    wrapper.getComponent(StepActionForm).vm.$emit('change', { action: 'wait_click', threshold: 0.91 })
    await flushPromises()
    expect(canvas.props('steps')).toEqual([{ action: 'wait_click' }])
    expect(wrapper.text()).toContain('选区已同步，保存后写入脚本')
    await wrapper.find('.config-actions el-button-stub:last-child').trigger('click')
    expect(wrapper.getComponent(WorkflowCanvas).element).toBe(canvas.element)
    expect(canvas.props('steps')).toEqual([{ action: 'wait_click', threshold: 0.91 }])
    expect(wrapper.text()).toContain('刚刚保存')
  } finally {
    wrapper.unmount()
  }
})

it('discards un-applied configuration and switches the single phone instance between floating and live areas', async () => {
  const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
  capturePhoneScreenshot.mockResolvedValue({ blob: new Blob(['png']), width: 576, height: 1280 })
  const wrapper = mount(ScriptWorkflowPanel, {
    props: { scriptId: 'script-1', device: { device_id: 'device-1' } as never,
      screenshotUrl: 'wss://terminal/session-one/screenshot' },
    global: { stubs },
  })
  try {
    await flushPromises()
    const canvas = wrapper.getComponent(WorkflowCanvas)
    canvas.vm.$emit('parameters')
    await flushPromises()
    expect(wrapper.emitted('phoneHidden')?.at(-1)).toEqual([false])
    expect(wrapper.emitted('phoneDock')?.at(-1)).toEqual([true])
    wrapper.getComponent(StepActionForm).vm.$emit('change', { action: 'wait_click', threshold: 0.92 })
    await flushPromises()
    await wrapper.findAll('.media-tabs button')[1]!.trigger('click')
    await flushPromises()
    expect(wrapper.emitted('phoneDock')?.at(-1)).toEqual([false])
    expect(wrapper.emitted('phoneHidden')?.at(-1)).toEqual([true])
    await wrapper.findAll('.media-tabs button')[0]!.trigger('click')
    expect(wrapper.emitted('phoneDock')?.at(-1)).toEqual([true])
    expect(wrapper.emitted('phoneHidden')?.at(-1)).toEqual([false])
    await wrapper.find('.config-heading el-button-stub').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('phoneHidden')?.at(-1)).toEqual([false])
    expect(canvas.props('steps')).toEqual([{ action: 'wait_click' }])
    expect(wrapper.getComponent(WorkflowCanvas).element).toBe(canvas.element)
  } finally {
    wrapper.unmount()
    confirm.mockRestore()
  }
})

it('accepts a completed image binding while the upload component is still busy', async () => {
  capturePhoneScreenshot.mockResolvedValue({ blob: new Blob(['png']), width: 576, height: 1280 })
  const wrapper = mount(ScriptWorkflowPanel, {
    props: { scriptId: 'script-1', device: { device_id: 'device-1' } as never,
      screenshotUrl: 'wss://terminal/session-one/screenshot' },
    global: { stubs },
  })
  try {
    await flushPromises()
    const canvas = wrapper.getComponent(WorkflowCanvas)
    canvas.vm.$emit('parameters')
    await flushPromises()
    await wrapper.findAll('.media-tabs button')[1]!.trigger('click')
    await flushPromises()
    const binding = wrapper.getComponent(StepImageBindings)
    binding.vm.$emit('busy', true)
    binding.vm.$emit('change', { steps: [{ action: 'wait_click', threshold: 0.88 }] })
    binding.vm.$emit('busy', false)
    await flushPromises()
    expect(wrapper.text()).toContain('选区已同步，保存后写入脚本')
    await wrapper.find('.config-actions el-button-stub:last-child').trigger('click')
    expect(canvas.props('steps')).toEqual([{ action: 'wait_click', threshold: 0.88 }])
  } finally { wrapper.unmount() }
})

it('restores saved history without a false draft prompt when server object keys are reordered', async () => {
  const document = { version: 2, steps: [{ action: 'tap', x: 12, y: 34 }] }
  openScript.mockResolvedValueOnce({ script, document })
  readDraft.mockResolvedValueOnce({ scriptId: 'script-1', baseRowVersion: 2, cursor: 0,
    history: [{ steps: [{ y: 34, x: 12, action: 'tap' }], version: 2 }], updatedAt: 1 })
  const confirm = vi.spyOn(ElMessageBox, 'confirm')
  const wrapper = mount(ScriptWorkflowPanel, { props: { scriptId: 'script-1', device: { device_id: 'device-1' } as never }, global: { stubs } })
  try {
    await flushPromises()
    expect(confirm).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('未保存')
  } finally { wrapper.unmount(); confirm.mockRestore() }
})


it.each([false, true])('preserves an unreadable original draft on unmount, edited=%s', async edited => {
  readDraft.mockRejectedValueOnce(new Error('本地草稿含无效脚本字段，草稿仍保留在本机'))
  const wrapper = mount(ScriptWorkflowPanel, {
    props: { scriptId: 'script-1', device: { device_id: 'device-1' } as never }, global: { stubs },
  })
  await flushPromises()
  if (edited) {
    wrapper.getComponent(WorkflowCanvas).vm.$emit('edit', 0, { action: 'wait', seconds: 7 })
    await flushPromises()
  }
  wrapper.unmount()
  await flushPromises()
  expect(writeDraft).not.toHaveBeenCalled()
  expect(deleteDraft).not.toHaveBeenCalled()
})

it('preserves a draft from an older server version after edits and unmount', async () => {
  readDraft.mockResolvedValueOnce({
    scriptId: 'script-1', baseRowVersion: 1, cursor: 0, updatedAt: 1,
    history: [{ version: 2, steps: [{ action: 'wait', seconds: 99 }] }],
  })
  const wrapper = mount(ScriptWorkflowPanel, {
    props: { scriptId: 'script-1', device: { device_id: 'device-1' } as never }, global: { stubs },
  })
  await flushPromises()
  wrapper.getComponent(WorkflowCanvas).vm.$emit('edit', 0, { action: 'wait', seconds: 7 })
  await flushPromises()
  wrapper.unmount()
  await flushPromises()
  expect(writeDraft).not.toHaveBeenCalled()
  expect(deleteDraft).not.toHaveBeenCalled()
})

it('imports a failure screenshot offline and reuses it when choosing the region purpose', async () => {
  openScript.mockResolvedValueOnce({ script, document: { steps: [{ action: 'wait_image' }],
    target: { screen_size: { width: 576, height: 1280 } } } })
  const screenshot = { blob: new Blob(['png']), width: 576, height: 1280 }
  readImportedScreenshot.mockResolvedValue(screenshot)
  const wrapper = mount(ScriptWorkflowPanel, { props: { scriptId: 'script-1', device: { device_id: 'device-1' } as never }, global: { stubs } })
  try {
    await flushPromises()
    wrapper.getComponent(WorkflowCanvas).vm.$emit('parameters')
    await flushPromises()
    await wrapper.findAll('.media-tabs button')[1]!.trigger('click')
    const input = wrapper.get('input[type="file"]')
    const file = new File(['png'], 'step-04-failure.png', { type: 'image/png' })
    Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
    await input.trigger('change')
    await flushPromises()
    expect(wrapper.getComponent(StepImageBindings).props('screenshot')).toEqual(screenshot)
    expect(wrapper.text()).toContain('step-04-failure.png')
    await wrapper.setProps({ device: { device_id: 'device-1', availability: 'disconnected' } as never })
    await flushPromises()
    expect(wrapper.getComponent(StepImageBindings).props('screenshot')).toEqual(screenshot)
    await wrapper.getComponent(StepRegionField).find('el-button-stub').trigger('click')
    expect(wrapper.getComponent(StepImageBindings).props('selectedUse')).toBe('template')
    expect(capturePhoneScreenshot).not.toHaveBeenCalled()
    await wrapper.findAll('.media-tabs button')[0]!.trigger('click')
    await wrapper.findAll('.media-tabs button')[1]!.trigger('click')
    expect(wrapper.getComponent(StepImageBindings).props('screenshot')).toEqual(screenshot)
    expect(capturePhoneScreenshot).not.toHaveBeenCalled()
    await wrapper.setProps({ device: { device_id: 'device-2' } as never })
    await flushPromises()
    expect(wrapper.findComponent(StepImageBindings).exists()).toBe(false)
  } finally { wrapper.unmount() }
})

it('can replace an imported image with an explicit fresh phone screenshot', async () => {
  const imported = { blob: new Blob(['file']), width: 576, height: 1280 }
  const phone = { blob: new Blob(['phone']), width: 576, height: 1280 }
  readImportedScreenshot.mockResolvedValue(imported)
  capturePhoneScreenshot.mockResolvedValue(phone)
  const wrapper = mount(ScriptWorkflowPanel, { props: { scriptId: 'script-1', device: { device_id: 'device-1' } as never,
    screenshotUrl: 'wss://terminal/session-one/screenshot' }, global: { stubs } })
  try {
    await flushPromises()
    wrapper.getComponent(WorkflowCanvas).vm.$emit('parameters')
    await flushPromises()
    await wrapper.findAll('.media-tabs button')[1]!.trigger('click')
    await flushPromises()
    const input = wrapper.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [new File(['png'], 'failure.png', { type: 'image/png' })] })
    await input.trigger('change'); await flushPromises()
    expect(wrapper.getComponent(StepImageBindings).props('screenshot')).toEqual(imported)
    await wrapper.get('[data-recapture-screenshot]').trigger('click'); await flushPromises()
    expect(wrapper.getComponent(StepImageBindings).props('screenshot')).toEqual(phone)
    expect(wrapper.text()).not.toContain('failure.png')
  } finally { wrapper.unmount() }
})

it('saves a conflicted draft baseline and reopens without losing the old history', async () => {
  let stored = { scriptId: 'script-1', baseRowVersion: 1, cursor: 0, updatedAt: 1,
    history: [{ version: 2, steps: [{ action: 'wait', seconds: 99 }] }],
    historyMetadata: [{ time: 1, versionId: 'old-version' }] }
  const serverDocument = { version: 2, steps: [{ action: 'wait', seconds: 1 }] }
  readDraft.mockImplementation(async () => structuredClone(stored))
  writeDraft.mockImplementation(async value => { stored = structuredClone(value) })
  openScript.mockResolvedValueOnce({ script, document: serverDocument })
  const savedScript = { ...script, row_version: 3, current_version_id: 'saved-v3' }
  saveScriptDocument.mockResolvedValue(savedScript)
  const options = { props: { scriptId: 'script-1', device: { device_id: 'device-1' } as never }, global: { stubs } }
  const first = mount(ScriptWorkflowPanel, options)
  try {
    await flushPromises()
    expect(first.text()).toContain('本地历史基于旧版本')
    first.getComponent(WorkflowCanvas).vm.$emit('edit', 0, { action: 'wait', seconds: 7 })
    await flushPromises()
    await first.get('.document-tools el-button-stub').trigger('click'); await flushPromises()
    expect(saveScriptDocument).toHaveBeenCalledOnce()
    expect(stored.baseRowVersion).toBe(3)
    expect(stored.history[stored.cursor]!.steps[0]!.seconds).toBe(7)
    expect(stored.history.some(value => value.steps[0]!.seconds === 99)).toBe(true)
    expect(stored.historyMetadata[stored.cursor]!.versionId).toBe('saved-v3')
    expect(first.text()).not.toContain('本地历史基于旧版本')
  } finally { first.unmount(); await flushPromises() }
  openScript.mockResolvedValueOnce({ script: savedScript, document: { version: 2, steps: [{ action: 'wait', seconds: 7 }] } })
  const second = mount(ScriptWorkflowPanel, options)
  try {
    await flushPromises()
    expect(second.text()).not.toContain('本地历史基于旧版本')
    expect(second.text()).not.toContain('未保存')
    expect(stored.history.some(value => value.steps[0]!.seconds === 99)).toBe(true)
    expect(deleteDraft).not.toHaveBeenCalled()
  } finally { second.unmount() }
})

it('resumes automatic writes only after explicitly discarding an unreadable old draft', async () => {
  readDraft.mockRejectedValueOnce(new Error('本地草稿格式无效，草稿仍保留在本机'))
  vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
  const wrapper = mount(ScriptWorkflowPanel, {
    props: { scriptId: 'script-1', device: { device_id: 'device-1' } as never },
    global: { stubs: { ...stubs, ElButton: { template: '<button><slot /></button>' } } },
  })
  try {
    await flushPromises()
    expect(writeDraft).not.toHaveBeenCalled()
    const discard = wrapper.findAll('button').find(button => button.text() === '舍弃旧草稿')!
    await discard.trigger('click')
    await flushPromises()
    expect(deleteDraft).toHaveBeenCalledExactlyOnceWith('script-1')
  } finally { wrapper.unmount() }
  await flushPromises()
  expect(writeDraft).toHaveBeenCalledOnce()
})
