import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import WorkflowOutline from '../src/modules/maa/editor/WorkflowOutline.vue'
import type { ScriptDocument } from '../src/shared/api/maa-script-editor'

function editor(document: ScriptDocument, selected = 0) {
  return mount(WorkflowOutline, { props: { document, selected, disabled: false } })
}

it('shows one step panel with five append choices and localized managed steps', async () => {
  const wrapper = editor({ script_type: 'module_end', steps: [
    { action: 'start' }, { action: 'launch_app' }, { action: 'cleanup' },
  ] })
  try {
    expect(wrapper.findAll('.workflow-outline')).toHaveLength(1)
    expect(wrapper.text()).toContain('结束应用并清理')
    expect(wrapper.findAll('.flow-delete')).toHaveLength(0)
    expect(wrapper.findAll('.flow-row').every(row => row.attributes('draggable') === 'false')).toBe(true)
    await wrapper.get('.flow-append').trigger('click')
    expect(wrapper.findAll('[role="menuitem"]').map(item => item.text())).toEqual([
      '等待', '识别图形并执行', '返回', '主页', '任务视图',
    ])
    expect(wrapper.text()).not.toContain('管理步骤')
  } finally { wrapper.unmount() }
})

it('shows a fixed 00 global-rule entry only while enabled and keeps real two-digit numbering', async () => {
  const doc: ScriptDocument = { steps: [{ action: 'start' }, { action: 'wait' }], global_popups: [
    { name: '关闭弹窗', enabled: true, template_base64: 'kept' },
  ] }
  const wrapper = mount(WorkflowOutline, { props: { document: doc, selected: 0, selectedGlobal: true, disabled: false } })
  try {
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true')
    expect(wrapper.findAll('.flow-number').map(item => item.text())).toEqual(['00', '01', '02'])
    expect(wrapper.get('[aria-label="00 全局规则"]').attributes('draggable')).toBeUndefined()
    expect(wrapper.find('.global-node .flow-delete').exists()).toBe(false)
    expect(wrapper.findAll('.flow-delete')).toHaveLength(1)
    expect(wrapper.get('.flow-count').text()).toBe('2 步')
    await wrapper.get('[aria-label="00 全局规则"]').trigger('click')
    expect(wrapper.emitted('selectGlobal')).toHaveLength(1)
    await wrapper.get('[role="switch"]').trigger('click')
    expect(wrapper.emitted('toggleGlobal')?.[0]).toEqual([false])
    await wrapper.setProps({ document: { ...doc, global_popups: [{ ...(doc.global_popups as object[])[0], enabled: false }] } })
    expect(wrapper.find('[aria-label="00 全局规则"]').exists()).toBe(false)
    expect(wrapper.findAll('.flow-number').map(item => item.text())).toEqual(['01', '02'])
  } finally { wrapper.unmount() }
})

it('inserts in the gap and remaps the existing skip reference', async () => {
  const document: ScriptDocument = { steps: [
    { action: 'wait', seconds: 1, skip_condition: { skip_to_step_index: 2 } },
    { action: 'home' },
  ] }
  const wrapper = editor(document)
  try {
    await wrapper.get('[aria-label="在第 1 步与第 2 步之间插入"]').trigger('click')
    await wrapper.findAll('[role="menuitem"]').find(item => item.text() === '返回')!.trigger('click')
    const emitted = wrapper.emitted('change')?.[0]
    expect(emitted?.[1]).toBe(1)
    const next = emitted?.[0] as ScriptDocument
    expect(next.steps.map(step => step.action)).toEqual(['wait', 'back', 'home'])
    expect(next.steps[0]?.skip_condition).toMatchObject({ skip_to_step_index: 3 })
    expect(document.steps).toHaveLength(2)
  } finally { wrapper.unmount() }
})

it('drags an entire configurable row into a gap and updates selection', async () => {
  const wrapper = editor({ steps: [
    { action: 'wait', seconds: 1 }, { action: 'back' }, { action: 'home' },
  ] }, 0)
  try {
    const transfer = { effectAllowed: '', dropEffect: '', setData: vi.fn() }
    await wrapper.findAll('.flow-row')[0]!.trigger('dragstart', { dataTransfer: transfer })
    await wrapper.get('.flow-gap-end').trigger('dragover', { dataTransfer: transfer })
    await wrapper.get('.flow-gap-end').trigger('drop', { dataTransfer: transfer })
    const emitted = wrapper.emitted('change')?.[0]
    expect((emitted?.[0] as ScriptDocument).steps.map(step => step.action)).toEqual(['back', 'home', 'wait'])
    expect(emitted?.[1]).toBe(2)
  } finally { wrapper.unmount() }
})

it('deletes only a configurable step and restores the exact document with undo', async () => {
  const document: ScriptDocument = { steps: [
    { action: 'start' }, { action: 'launch_app' }, { action: 'wait_random', min_seconds: 1, max_seconds: 2 },
  ], cleanup_on_finish: true }
  const wrapper = editor(document, 2)
  try {
    expect(wrapper.findAll('.flow-delete')).toHaveLength(1)
    await wrapper.get('[aria-label="删除第 3 步"]').trigger('click')
    const next = wrapper.emitted('change')?.[0]?.[0] as ScriptDocument
    expect(next.steps).toHaveLength(2)
    await wrapper.setProps({ document: next, selected: 1 })
    expect(wrapper.get('[role="status"]').text()).toContain('已删除步骤')
    await wrapper.get('[role="status"] button').trigger('click')
    expect(wrapper.emitted('change')?.[1]).toEqual([document, 2])
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  } finally { wrapper.unmount() }
})

it('keeps referenced steps in place and explains the deletion failure', async () => {
  const wrapper = editor({ steps: [
    { action: 'wait', skip_condition: { skip_to_step_index: 2 } }, { action: 'home' },
  ] })
  try {
    await wrapper.get('[aria-label="删除第 2 步"]').trigger('click')
    expect(wrapper.get('[role="alert"]').text()).toContain('第 1 步')
    expect(wrapper.emitted('change')).toBeUndefined()
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  } finally { wrapper.unmount() }
})
