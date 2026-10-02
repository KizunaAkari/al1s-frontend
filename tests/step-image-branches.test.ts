import StepRegionField from '../src/modules/maa/editor/StepRegionField.vue'
import { flushPromises, mount, shallowMount } from '@vue/test-utils'
import { ElButton, ElInput, ElInputNumber, ElMessageBox, ElSelect } from 'element-plus'
import { afterEach, describe, expect, it, vi } from 'vitest'
import StepImageBranches from '../src/modules/maa/editor/StepImageBranches.vue'
import type { ScriptDocument } from '../src/shared/api/maa-script-editor'

afterEach(() => vi.restoreAllMocks())

function documentFor(step: Record<string, unknown>): ScriptDocument {
  return {
    document_unknown: { keep: true },
    target: { keep: 'target' },
    steps: [step as ScriptDocument['steps'][number], { action: 'back', sibling_unknown: true }],
  }
}

function editor(document: ScriptDocument, props: Record<string, unknown> = {}) {
  return mount(StepImageBranches, { props: { document, index: 0, ...props } })
}

function firstChange(wrapper: ReturnType<typeof editor>) {
  return wrapper.emitted('change')?.[0]?.[0] as ScriptDocument | undefined
}

describe('StepImageBranches', () => {
  it('adds a default branch immutably and preserves document and step unknown fields', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001')
    const document = documentFor({
      action: 'wait_click',
      click_mode: 'fixed',
      step_unknown: { keep: true },
    })
    const before = structuredClone(document)
    const wrapper = editor(document)

    await wrapper.get('[aria-label="新增图片分支"]').trigger('click')
    const next = firstChange(wrapper)!

    expect(next).toMatchObject({
      document_unknown: { keep: true },
      target: { keep: 'target' },
    })
    expect(next.steps[0]).toMatchObject({
      action: 'wait_click',
      click_mode: 'fixed',
      step_unknown: { keep: true },
      image_branches: [{
          id: '00000000-0000-4000-8000-000000000001',
        name: '图片分支 1',
        threshold: 0.85,
        click_mode: 'match_center',
      }],
    })
    expect(document).toEqual(before)
    expect(next.steps[1]).toEqual(document.steps[1])
    await wrapper.setProps({ document: next })
    expect(wrapper.text()).toContain('缺少分支模板，请在本分支内截图选区。')
    wrapper.unmount()
  })

  it('does not add a twenty-first branch', async () => {
    const branches = Array.from({ length: 20 }, (_, index) => ({
      id: 'branch-' + index,
      name: 'existing-' + index,
      threshold: 0.85,
      click_mode: 'match_center',
      template_base64: { $blob: 'blob-' + index },
    }))
    const document = documentFor({ action: 'wait_click', image_branches: branches })
    const wrapper = shallowMount(StepImageBranches, { props: { document, index: 0 } })

    await wrapper.get('[aria-label="新增图片分支"]').trigger('click')

    expect(wrapper.emitted('change')).toBeUndefined()
    expect(wrapper.get('[aria-label="新增图片分支"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('图片分支最多 20 个')
    wrapper.unmount()
  })

  it('edits branch fields while preserving parent and branch unknown fields', async () => {
    const document = documentFor({
      action: 'wait_click',
      click_mode: 'fixed',
      parent_unknown: 'keep',
      image_branches: [{
        id: 'branch-1',
        name: 'old',
        threshold: 0.85,
        click_mode: 'match_center',
        branch_unknown: { keep: true },
        template_base64: { $blob: 'template-1' },
      }],
    })
    const wrapper = editor(document)

    await wrapper.findComponent(ElInput).vm.$emit('input', 'renamed')
    let next = firstChange(wrapper)!
    expect(next.steps[0]).toMatchObject({
      parent_unknown: 'keep',
      image_branches: [{
        id: 'branch-1',
        name: 'renamed',
        branch_unknown: { keep: true },
        template_base64: { $blob: 'template-1' },
      }],
    })
    await wrapper.setProps({ document: next })

    await wrapper.findComponent(ElInputNumber).vm.$emit('change', 0.91)
    next = wrapper.emitted('change')!.at(-1)![0] as ScriptDocument
    await wrapper.setProps({ document: next })
    await wrapper.findComponent(ElSelect).vm.$emit('change', 'image')
    next = wrapper.emitted('change')!.at(-1)![0] as ScriptDocument
    await wrapper.setProps({ document: next })
    await flushPromises()
    const clickThreshold = wrapper.findAllComponents(ElInputNumber).at(1)!
    await clickThreshold.vm.$emit('change', 0.77)
    next = wrapper.emitted('change')!.at(-1)![0] as ScriptDocument

    expect(next.steps[0]).toMatchObject({
      parent_unknown: 'keep',
      image_branches: [{
        threshold: 0.91,
        click_mode: 'image',
        click_threshold: 0.77,
        branch_unknown: { keep: true },
        template_base64: { $blob: 'template-1' },
      }],
    })
    expect(document.steps[0]).toEqual({
      action: 'wait_click',
      click_mode: 'fixed',
      parent_unknown: 'keep',
      image_branches: [{
        id: 'branch-1',
        name: 'old',
        threshold: 0.85,
        click_mode: 'match_center',
        branch_unknown: { keep: true },
        template_base64: { $blob: 'template-1' },
      }],
    })
    wrapper.unmount()
  })

  it('uses the requested ranges for threshold and optional click threshold', async () => {
    const document = documentFor({
      action: 'wait_click',
      image_branches: [{ name: 'branch', click_mode: 'image', template_base64: { $blob: 'x' } }],
    })
    const wrapper = editor(document)
    const inputs = wrapper.findAllComponents(ElInputNumber)
    expect(inputs[0]!.props('min')).toBe(0.000001)
    expect(inputs[0]!.props('max')).toBe(1)
    expect(inputs[1]!.props('min')).toBe(0.000001)
    expect(inputs[1]!.props('max')).toBe(1)
    wrapper.unmount()
  })

  it('cancelling deletion preserves the document and emits no selection reset', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
    const document = documentFor({
      action: 'wait_click',
      image_branches: [{ name: 'branch', template_base64: { $blob: 'x' } }],
    })
    const wrapper = editor(document)

    await wrapper.get('[aria-label="删除图片分支 1"]').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('change')).toBeUndefined()
    expect(wrapper.emitted('select')).toBeUndefined()
    expect(ElMessageBox.confirm).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('confirmed deletion emits the immutable result and resets selection only after deletion', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    const document = documentFor({
      action: 'wait_click',
      image_branches: [
        { id: 'first', name: 'first', template_base64: { $blob: 'x' }, unknown: true },
        { id: 'second', name: 'second', template_base64: { $blob: 'y' } },
      ],
    })
    const before = structuredClone(document)
    const wrapper = editor(document)

    await wrapper.get('[aria-label="删除图片分支 1"]').trigger('click')
    await flushPromises()

    const next = firstChange(wrapper)!
    expect(next.steps[0]?.image_branches).toEqual([
      { id: 'second', name: 'second', template_base64: { $blob: 'y' } },
    ])
    expect(wrapper.emitted('select')).toEqual([[undefined]])
    expect(document).toEqual(before)
    wrapper.unmount()
  })

  it('does not delete when the controlled target changes while confirmation is pending', async () => {
    let release!: (value: unknown) => void
    vi.spyOn(ElMessageBox, 'confirm').mockReturnValue(new Promise(resolve => { release = resolve }) as never)
    const original = documentFor({
      action: 'wait_click',
      image_branches: [{ id: 'original', name: 'original', template_base64: { $blob: 'x' } }],
    })
    const replacement = documentFor({
      action: 'wait_click',
      image_branches: [{ id: 'replacement', name: 'replacement', template_base64: { $blob: 'y' } }],
    })
    const wrapper = editor(original)
    const pendingClick = wrapper.get('[aria-label="删除图片分支 1"]').trigger('click')
    await flushPromises()

    await wrapper.setProps({ document: replacement })
    release('confirm')
    await pendingClick
    await flushPromises()

    expect(wrapper.emitted('change')).toBeUndefined()
    expect(wrapper.emitted('select')).toBeUndefined()
    expect(replacement.steps[0]?.image_branches).toEqual([{
      id: 'replacement',
      name: 'replacement',
      template_base64: { $blob: 'y' },
    }])
    wrapper.unmount()
  })

  it('does not delete when the controlled index changes while confirmation is pending', async () => {
    let release!: (value: unknown) => void
    vi.spyOn(ElMessageBox, 'confirm').mockReturnValue(new Promise(resolve => { release = resolve }) as never)
    const document = {
      document_unknown: { keep: true },
      steps: [
        { action: 'wait_click', image_branches: [{ id: 'first', template_base64: { $blob: 'x' } }] },
        { action: 'wait_click', image_branches: [{ id: 'second', template_base64: { $blob: 'y' } }] },
      ],
    } satisfies ScriptDocument
    const wrapper = mount(StepImageBranches, { props: { document, index: 0 } })
    const pendingClick = wrapper.get('[aria-label="删除图片分支 1"]').trigger('click')
    await flushPromises()

    await wrapper.setProps({ index: 1 })
    release('confirm')
    await pendingClick
    await flushPromises()

    expect(wrapper.emitted('change')).toBeUndefined()
    expect(wrapper.emitted('select')).toBeUndefined()
    expect(document.steps[0]?.image_branches).toEqual([{ id: 'first', template_base64: { $blob: 'x' } }])
    expect(document.steps[1]?.image_branches).toEqual([{ id: 'second', template_base64: { $blob: 'y' } }])
    wrapper.unmount()
  })

  it('does not delete when the confirmed branch object was replaced', async () => {
    let release!: (value: unknown) => void
    vi.spyOn(ElMessageBox, 'confirm').mockReturnValue(new Promise(resolve => { release = resolve }) as never)
    const original = documentFor({
      action: 'wait_click',
      image_branches: [{ id: 'original', name: 'original', template_base64: { $blob: 'x' } }],
    })
    const wrapper = editor(original)
    const pendingClick = wrapper.get('[aria-label="删除图片分支 1"]').trigger('click')
    await flushPromises()

    const step = original.steps[0]!
    const branches = step.image_branches as Array<Record<string, unknown>>
    branches[0] = { id: 'replacement', name: 'replacement', template_base64: { $blob: 'y' } }
    await wrapper.setProps({ document: original })
    release('confirm')
    await pendingClick
    await flushPromises()

    expect(wrapper.emitted('change')).toBeUndefined()
    expect(wrapper.emitted('select')).toBeUndefined()
    expect(original.steps[0]?.image_branches).toEqual([{
      id: 'replacement',
      name: 'replacement',
      template_base64: { $blob: 'y' },
    }])
    wrapper.unmount()
  })

  it('offers a selection field scoped to its branch without changing the document', async () => {
    const document = documentFor({
      action: 'wait_click',
      image_branches: [{ name: 'branch', template_base64: { $blob: 'x' } }],
    })
    const wrapper = editor(document)

    expect(wrapper.getComponent(StepRegionField).props()).toMatchObject({ use: 'template', branchIndex: 0 })
    expect(wrapper.emitted('change')).toBeUndefined()
    wrapper.unmount()
  })

  it('preserves historical branches and only explains unsupported parents', async () => {
    const document = documentFor({
      action: 'wait_click',
      click_mode: 'match_offset',
      image_branches: [{ id: 'legacy', custom: 'keep' }],
    })
    const before = structuredClone(document)
    const wrapper = editor(document)

    expect(wrapper.text()).toContain('已有历史分支已保留，未修改。')
    expect(wrapper.find('[aria-label="新增图片分支"]').exists()).toBe(false)
    expect(wrapper.emitted()).toEqual({})
    await wrapper.findAllComponents(ElButton).forEach(button => button.trigger('click'))
    expect(document).toEqual(before)
    wrapper.unmount()
  })

  it('does not offer branch editing for non-wait_click actions', () => {
    const wrapper = editor(documentFor({
      action: 'wait_image',
      image_branches: [{ id: 'legacy', custom: 'keep' }],
    }))

    expect(wrapper.text()).toContain('当前动作不支持图片分支编辑')
    expect(wrapper.text()).toContain('已有历史分支已保留，未修改。')
    expect(wrapper.find('[aria-label="新增图片分支"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
