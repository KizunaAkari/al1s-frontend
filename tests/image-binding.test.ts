import { expect, it } from 'vitest'
import { bindImage, type BlobResource, type Rect } from '../src/modules/maa/editor/image-binding'
import type { ScriptDocument, WorkflowStep } from '../src/shared/api/maa-script-editor'

const size = { width: 2400, height: 1080 }
const selection: Rect = { x: 120, y: 80, width: 640, height: 360 }
const resource: BlobResource = {
  $blob: 'blob-template',
  sha256: 'a'.repeat(64),
  size_bytes: 1234,
  media_type: 'image/png',
}

it('binds separate recognition and execution targets to one new step', () => {
  const original = documentFor({ action: 'recognize_execute', recognition_mode: 'image',
    execution_mode: 'image_center', execution_count: 2 })
  const recognized = bindImage(original, 0, size, selection, 'template', resource)
  const clicked = bindImage(recognized, 0, size, { x: 900, y: 100, width: 40, height: 30 },
    'click', { ...resource, $blob: 'click-target' })
  expect(clicked.steps[0]).toMatchObject({
    template_base64: resource,
    click_template_base64: { $blob: 'click-target' },
    execution_count: 2,
  })
  expect((clicked.target as Record<string, unknown>).screen_size).toEqual(size)
  expect(original.steps[0]).not.toHaveProperty('template_base64')
})

it('binds OCR region and fixed swipe points without uploading image bytes', () => {
  let doc = documentFor({ action: 'recognize_execute', recognition_mode: 'text',
    execution_mode: 'fixed_swipe', text: '领取' })
  doc = bindImage(doc, 0, size, selection, 'ocr_region')
  doc = bindImage(doc, 0, size, { x: 10, y: 20, width: 1, height: 1 }, 'swipe_start')
  doc = bindImage(doc, 0, size, { x: 100, y: 200, width: 1, height: 1 }, 'swipe_end')
  expect(doc.steps[0]).toMatchObject({
    search_region: selection,
    swipe: { x1: 10, y1: 20, x2: 100, y2: 200, duration_ms: 300 },
  })
  expect(() => bindImage(doc, 0, { width: 1080, height: 2400 }, selection, 'screen'))
    .toThrow('不能混用不同分辨率')
})

it('binds independent rules without changing main steps or rule settings', () => {
  const doc = documentFor({ action: 'back' })
  doc.global_popups = [{ name: '关闭弹窗', enabled: false, step_indexes: [1], unknown: true }]
  const before = structuredClone(doc)
  const result = bindImage(doc, 0, size, selection, 'template', resource, undefined, 0)
  expect(doc).toEqual(before)
  expect(result.steps).toEqual(doc.steps)
  expect(result.global_popups).toEqual([{ ...(doc.global_popups as object[])[0], template_base64: resource, template_rect: selection }])
  expect(() => bindImage(doc, 0, size, selection, 'skip', resource, undefined, 0)).toThrow()
  expect(() => bindImage(doc, 0, size, selection, 'template', resource, 0, 0)).toThrow()
})

function documentFor(step: WorkflowStep, target: Record<string, unknown> = {}): ScriptDocument {
  return {
    version: 2,
    script_type: 'module_process',
    document_unknown: { keep: true },
    target: { device_hint: 'phone', ...target },
    steps: [step, { action: 'back', step_unknown: 'untouched' }],
  }
}

it('binds a branch image without replacing parent or sibling fields', () => {
  const doc = documentFor({ action: 'wait_click', template_base64: 'parent',
    image_branches: [{ name: 'first', threshold: .9, custom: true }, { name: 'second' }] })
  const before = structuredClone(doc)
  const next = bindImage(doc, 0, size, selection, 'click', resource, 0)
  expect(next.steps[0]?.template_base64).toBe('parent')
  expect(next.steps[0]?.image_branches).toEqual([
    { name: 'first', threshold: .9, custom: true, click_mode: 'image',
      click_template_base64: resource, click_template_rect: selection }, { name: 'second' },
  ])
  expect(doc).toEqual(before)
  expect((next.target as Record<string, unknown>).screen_size).toEqual(size)
  expect(() => bindImage(doc, 0, size, selection, 'skip', resource, 0)).toThrow('分支只支持')
  expect(() => bindImage(doc, 0, size, selection, 'template', resource, 2)).toThrow('分支不存在')
})

it('binds a template and stores only the native screenshot width and height', () => {
  const step: WorkflowStep = {
    action: 'wait_image',
    existing_template: 'replace-only-template-fields',
    step_unknown: { keep: true },
  }
  const document = documentFor(step)
  const before = structuredClone(document)
  const nativeScreenshot = { ...size, blob: new Blob(['native screenshot']), capture_unknown: 'not manifest data' }

  const next = bindImage(document, 0, nativeScreenshot, selection, 'template', resource)
  const bound = next.steps[0]!
  const screenSize = (next.target as Record<string, unknown>).screen_size

  expect(bound.template_base64).toBe(resource)
  expect(bound.template_rect).toEqual(selection)
  expect(bound.step_unknown).toEqual({ keep: true })
  expect(bound.existing_template).toBe('replace-only-template-fields')
  expect(screenSize).toEqual(size)
  expect(Object.keys(screenSize as Record<string, unknown>)).toEqual(['width', 'height'])
  expect(JSON.stringify(next)).not.toContain('native screenshot')
  expect(next.steps[1]).toBe(document.steps[1])
  expect(document).toEqual(before)
})

it('binds a click template only for the click target fields', () => {
  const step: WorkflowStep = {
    action: 'wait_click',
    click_mode: 'fixed',
    click_template_base64: { old: true },
    click_template_rect: { x: 1, y: 1, width: 2, height: 2 },
    unknown: 'keep',
  }
  const document = documentFor(step)
  const next = bindImage(document, 0, size, selection, 'click', resource)
  const bound = next.steps[0]!

  expect(bound).toMatchObject({
    action: 'wait_click',
    click_mode: 'image',
    click_template_base64: resource,
    click_template_rect: selection,
    unknown: 'keep',
  })
  expect(bound.click_template_rect).not.toBe(selection)
  expect(bound).not.toHaveProperty('template_base64')
})

it('binds an image skip condition and preserves its existing options', () => {
  const step: WorkflowStep = {
    action: 'wait',
    skip_condition: { enabled: false, operator: 'lt', value: 2, skip_to_step_index: 2, custom: 'keep' },
  }
  const document = documentFor(step)
  const next = bindImage(document, 0, size, selection, 'skip', resource)

  expect(next.steps[0]!.skip_condition).toEqual({
    enabled: false,
    threshold: 0.85,
    operator: 'lt',
    value: 2,
    skip_to_step_index: 2,
    custom: 'keep',
    mode: 'image',
    preview_base64: resource,
    preview_rect: selection,
  })
  expect(document.steps[0]!.skip_condition).toEqual({
    enabled: false,
    operator: 'lt',
    value: 2,
    skip_to_step_index: 2,
    custom: 'keep',
  })
})

it('binds an OCR region without requiring or inventing an image resource', () => {
  const step: WorkflowStep = {
    action: 'wait',
    skip_condition: { enabled: false, operator: 'gt', value: 3, custom: { keep: true } },
  }
  const document = documentFor(step)
  const next = bindImage(document, 0, size, selection, 'region')

  expect(next.steps[0]!.skip_condition).toEqual({
    enabled: false,
    threshold: 0.85,
    operator: 'gt',
    value: 3,
    custom: { keep: true },
    mode: 'numeric',
    region: selection,
  })
  expect(next.steps[0]!.skip_condition).not.toHaveProperty('preview_base64')
  expect(next.steps[0]!.skip_condition).not.toHaveProperty('template_base64')
})

it('binds an assertion with defaults while preserving existing assertion fields', () => {
  const step: WorkflowStep = {
    action: 'wait_image',
    post_assertion: { enabled: false, custom: { keep: true }, assertion_unknown: 'untouched' },
    step_unknown: 'keep',
  }
  const document = documentFor(step)
  const next = bindImage(document, 0, size, selection, 'assertion', resource)

  expect(next.steps[0]!.post_assertion).toEqual({
    enabled: false,
    threshold: 0.85,
    timeout_seconds: 20,
    poll_interval_seconds: 1,
    max_retries: 1,
    custom: { keep: true },
    assertion_unknown: 'untouched',
    template_base64: resource,
    template_rect: selection,
  })
  expect(next.steps[0]!.step_unknown).toBe('keep')
  expect(document.steps[0]!.post_assertion).toEqual({
    enabled: false,
    custom: { keep: true },
    assertion_unknown: 'untouched',
  })
})

it('rejects invalid selections without changing the input document', () => {
  const document = documentFor({ action: 'wait_image', unknown: 'keep' })
  const before = structuredClone(document)

  expect(() => bindImage(document, 0, size, { x: 2399, y: 0, width: 2, height: 1 }, 'template', resource))
    .toThrow('选区超出原图范围')
  expect(() => bindImage(document, 0, size, { x: 0, y: 0, width: 1.5, height: 1 }, 'template', resource))
    .toThrow('选区超出原图范围')
  expect(document).toEqual(before)
})

it('rejects a different screenshot resolution or orientation', () => {
  const document = documentFor({ action: 'wait_image' }, {
    screen_size: { width: 1080, height: 2400 },
    target_unknown: 'keep',
  })

  expect(() => bindImage(document, 0, size, selection, 'template', resource))
    .toThrow('不能混用不同分辨率或方向的截图')
  expect(document.target).toEqual({
    device_hint: 'phone',
    screen_size: { width: 1080, height: 2400 },
    target_unknown: 'keep',
  })
})

it('rejects image skip bindings on the start action', () => {
  const document = documentFor({ action: 'start', unknown: 'keep' })
  const before = structuredClone(document)

  expect(() => bindImage(document, 0, size, selection, 'skip', resource))
    .toThrow('开始动作不能设置跳过条件')
  expect(document).toEqual(before)
})

it('binds an OCR assertion region without an upload or changing its matching text', () => {
 const doc = documentFor({ action: 'wait', seconds: 1,
   post_assertion: { recognition_mode: 'text', text: '开始[游戏]+', enabled: true, custom: 'keep' } })
 const bound = bindImage(doc, 0, size, selection, 'assertion_ocr')
 expect(bound.steps[0]!.post_assertion).toMatchObject({ recognition_mode: 'text', text: '开始[游戏]+', search_region: selection, custom: 'keep' })
 expect(bound.steps[0]!.post_assertion).not.toHaveProperty('template_base64')
})

it('persists the cropped OCR preview resource separately from its recognition region', () => {
 const doc = documentFor({ action: 'wait', seconds: 1, post_assertion: { recognition_mode: 'text', text: '主菜单' } })
 const bound = bindImage(doc, 0, size, selection, 'assertion_ocr', resource)
 expect(bound.steps[0]!.region_previews).toEqual({ assertion_ocr_base64: resource })
 expect(bound.steps[0]!.post_assertion).toMatchObject({ search_region: selection, text: '主菜单' })
})
