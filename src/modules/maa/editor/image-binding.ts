import type { ScriptDocument } from '../../../shared/api/maa-script-editor'
export type Rect = { x: number; y: number; width: number; height: number }
export type ImageUse = 'template' | 'skip' | 'assertion' | 'click' | 'region' | 'point' | 'screen' |
  'assertion_ocr' | 'ocr_region' | 'swipe_start' | 'swipe_end'
export type BlobResource = { $blob: string; sha256: string; size_bytes: number; media_type: 'image/png' }

export function bindImage(doc: ScriptDocument, index: number, size: { width: number; height: number },
  rect: Rect, use: ImageUse, resource?: BlobResource, branchIndex?: number, ruleIndex?: number): ScriptDocument {
  if (ruleIndex !== undefined) {
    const rules = doc.global_popups
    if (branchIndex !== undefined || !Array.isArray(rules) || !Number.isInteger(ruleIndex)
      || ruleIndex < 0 || ruleIndex >= rules.length || !rules[ruleIndex]
      || typeof rules[ruleIndex] !== 'object' || Array.isArray(rules[ruleIndex])) throw new Error('独立规则不存在')
    if (!['template', 'click', 'point'].includes(use)) throw new Error('独立规则仅支持识别图片、点击图片和坐标绑定')
    const rule = rules[ruleIndex] as Record<string, unknown>
    const result = bindImage({ ...doc, steps: [{ ...rule, action: 'wait_click' }] }, 0, size, rect, use, resource)
    const bound: Record<string, unknown> = { ...result.steps[0] }
    delete bound.action
    if ('action' in rule) bound.action = rule.action
    return { ...doc, target: result.target, global_popups: rules.map((r, i) => i === ruleIndex ? bound : r) }
  }
  const step = doc.steps[index]
  if (!step) throw new Error('请先选择一个步骤')
  if (branchIndex !== undefined) {
    const branches = step.image_branches
    if (step.action !== 'wait_click' || ['match_offset', 'color_marker'].includes(String(step.click_mode))
      || !Array.isArray(branches) || !Number.isInteger(branchIndex) || branchIndex < 0 || branchIndex >= branches.length
      || !branches[branchIndex] || typeof branches[branchIndex] !== 'object'
      || Array.isArray(branches[branchIndex])) throw new Error('图片分支不存在或当前动作不支持分支')
    if (!['template', 'click'].includes(use)) throw new Error('图片分支只支持识别图片和点击图片绑定')
    const branch = branches[branchIndex] as Record<string, unknown>
    const boundDoc = bindImage({ ...doc, steps: doc.steps.map((s, i) => i === index
      ? { ...branch, action: 'wait_click' } : s) }, index, size, rect, use, resource)
    const bound: Record<string, unknown> = { ...boundDoc.steps[index] }
    delete bound.action
    if ('action' in branch) bound.action = branch.action
    return { ...doc, target: boundDoc.target, steps: doc.steps.map((s, i) => i === index
      ? { ...s, image_branches: branches.map((b, j) => j === branchIndex ? bound : b) } : s) }
  }
  if (![size.width, size.height, rect.x, rect.y, rect.width, rect.height].every(Number.isInteger)
    || size.width < 1 || size.height < 1 || rect.x < 0 || rect.y < 0 || rect.width < 1 || rect.height < 1
    || rect.x + rect.width > size.width || rect.y + rect.height > size.height) throw new Error('选区超出原图范围')
  const target = (doc.target ?? {}) as Record<string, unknown>
  const previous = target.screen_size as { width: number; height: number } | undefined
  if (previous && (previous.width !== size.width || previous.height !== size.height)) {
    throw new Error(`脚本已绑定 ${previous.width}×${previous.height}，不能混用不同分辨率或方向的截图`)
  }
  if (!['region', 'point', 'screen', 'assertion_ocr', 'ocr_region', 'swipe_start', 'swipe_end'].includes(use) && !resource)
    throw new Error('识别图片尚未上传成功')
  const next = { ...step }
  if (use === 'screen') {
    // Bind only the coordinate baseline, leaving all step fields untouched.
  } else if (use === 'point') {
    if (!['wait_click', 'tap', 'recognize_execute'].includes(step.action) ||
      (step.action === 'recognize_execute' && step.execution_mode !== 'fixed_tap'))
      throw new Error('此动作不支持固定点击坐标')
    const point = { x: rect.x + Math.floor((rect.width - 1) / 2), y: rect.y + Math.floor((rect.height - 1) / 2) }
    Object.assign(next, step.action === 'tap' ? point
      : { click_mode: 'fixed', click: { ...(step.click as object ?? {}), ...point } })
    if (step.action === 'recognize_execute') delete next.click_mode
  } else if (use === 'assertion_ocr') {
    next.post_assertion = { threshold: 0.85, timeout_seconds: 20, poll_interval_seconds: 1, max_retries: 1,
      ...(step.post_assertion as object ?? {}), recognition_mode: 'text', search_region: { ...rect } }
  } else if (use === 'ocr_region') {
    if (step.action !== 'recognize_execute' || step.recognition_mode !== 'text')
      throw new Error('此动作不使用 OCR 搜索区域')
    next.search_region = { ...rect }
  } else if (use === 'swipe_start' || use === 'swipe_end') {
    if (step.action !== 'recognize_execute' || step.execution_mode !== 'fixed_swipe')
      throw new Error('此动作不支持滑动坐标')
    const point = { x: rect.x + Math.floor((rect.width - 1) / 2), y: rect.y + Math.floor((rect.height - 1) / 2) }
    const key = use === 'swipe_start' ? ['x1', 'y1'] : ['x2', 'y2']
    next.swipe = { x1: 0, y1: 0, x2: 0, y2: 0, duration_ms: 300,
      ...(step.swipe as object ?? {}), [key[0]!]: point.x, [key[1]!]: point.y }
  } else if (use === 'template') {
    if (!['wait_image', 'wait_click', 'smart_swipe', 'recognize_execute'].includes(step.action) ||
      (step.action === 'recognize_execute' && step.recognition_mode !== 'image'))
      throw new Error('此动作不使用识别模板')
    Object.assign(next, { template_base64: resource, template_rect: { ...rect } })
  } else if (use === 'click') {
    if (step.action !== 'wait_click' &&
      !(step.action === 'recognize_execute' && step.execution_mode === 'image_center'))
      throw new Error('此动作不支持点击模板')
    Object.assign(next, { ...(step.action === 'wait_click' ? { click_mode: 'image' } : {}),
      click_template_base64: resource, click_template_rect: { ...rect } })
  } else if (use === 'assertion') {
    next.post_assertion = { enabled: true, threshold: 0.85, timeout_seconds: 20, poll_interval_seconds: 1,
      max_retries: 1, ...(step.post_assertion as object ?? {}), template_base64: resource, template_rect: { ...rect } }
  } else {
    if (step.action === 'start') throw new Error('开始动作不能设置跳过条件')
    next.skip_condition = { enabled: true, threshold: 0.85, operator: 'gt', value: 0,
      ...(step.skip_condition as object ?? {}), mode: use === 'skip' ? 'image' : 'numeric',
      ...(use === 'skip' ? { preview_base64: resource, preview_rect: { ...rect } } : { region: { ...rect } }) }
  }
  if (resource && ['region', 'point', 'screen', 'assertion_ocr', 'ocr_region', 'swipe_start', 'swipe_end'].includes(use)) {
    next.region_previews = { ...(step.region_previews as object ?? {}), [`${use}_base64`]: resource }
  }
  return { ...doc, target: { ...target, screen_size: { width: size.width, height: size.height } },
    steps: doc.steps.map((s, i) => i === index ? next : s) }
}
