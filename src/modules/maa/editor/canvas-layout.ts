import type { WorkflowStep } from '../../../shared/api/maa-script-editor'

export function nodeSize(step: WorkflowStep, measured?: number) {
  const start = step.action === 'start'
  const image = ['wait_click', 'wait_image', 'smart_swipe', 'recognize_execute'].includes(step.action)
  return { width: start ? 132 : 216, height: measured || (start ? 52 : image ? 254 : 110) }
}

/** Content-sized rows; manually dragged coordinates are kept by the canvas. */
export function defaultNodeLayout(steps: WorkflowStep[], heights: Record<number, number>, availableWidth?: number) {
  const widthLimit = availableWidth === undefined || !Number.isFinite(availableWidth)
    ? undefined : Math.max(1, availableWidth)
  let x = 0, y = 0, rowHeight = 0, rowItems = 0
  return steps.map((step, index) => {
    const size = nodeSize(step, heights[index])
    const wrap = widthLimit === undefined
      ? rowItems >= 4
      : rowItems > 0 && x + size.width > widthLimit
    if (wrap) { x = 0; y += rowHeight + 44; rowHeight = 0; rowItems = 0 }
    const node = { x, y, ...size }
    x += size.width + 44
    rowHeight = Math.max(rowHeight, size.height)
    rowItems += 1
    return node
  })
}
