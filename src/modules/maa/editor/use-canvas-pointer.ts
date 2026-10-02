import { ref, type Ref } from 'vue'

type Position = { x: number; y: number }
type Drag = { index: number; x: number; y: number; px: number; py: number; pointer: number }

function isInteractiveControl(event: PointerEvent) {
  const control = (event.target as HTMLElement).closest('button,input,select,textarea')
  return control !== null && !control.matches('[data-node-drag-handle]')
}

type PointerContext = {
  zoom: Ref<number>
  positions: Ref<Record<number, Position>>
  position: (index: number) => Position
  disabled: () => boolean
  select: (index: number) => void
  link: (from: number, to: number) => void
  contextMenu: (event: PointerEvent, index?: number) => void
}

export function useCanvasPointer(context: PointerContext) {
  const drag = ref<Drag>()
  const linking = ref<number>()
  let hold: ReturnType<typeof setTimeout> | undefined

  function down(event: PointerEvent, index: number) {
    if (event.button !== 0 || isInteractiveControl(event)) return
    const point = context.position(index)
    drag.value = {
      index, x: event.clientX, y: event.clientY, px: point.x, py: point.y, pointer: event.pointerId,
    }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    context.select(index)
  }

  function move(event: PointerEvent) {
    const current = drag.value
    if (!current || current.pointer !== event.pointerId) return
    context.positions.value[current.index] = {
      x: Math.max(0, current.px + (event.clientX - current.x) / context.zoom.value),
      y: Math.max(0, current.py + (event.clientY - current.y) / context.zoom.value),
    }
  }

  function finishLink(event: PointerEvent) {
    if (linking.value === undefined) return
    const from = linking.value
    linking.value = undefined
    const target = (document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null)
      ?.closest<HTMLElement>('[data-node]')
    if (target && !context.disabled()) context.link(from, Number(target.dataset.node))
  }

  function beginLink(event: PointerEvent, index: number) {
    if (context.disabled()) return
    linking.value = index
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  function longPress(event: PointerEvent, index?: number) {
    if (event.pointerType !== 'touch' || isInteractiveControl(event)) return
    clearTimeout(hold)
    hold = setTimeout(() => {
      drag.value = undefined
      context.contextMenu(event, index)
    }, 550)
  }

  function blankHold(event: PointerEvent) {
    if (!(event.target as HTMLElement).closest('[data-node]')) longPress(event)
  }

  function cancelHold() { clearTimeout(hold) }
  function dispose() { clearTimeout(hold) }

  return { drag, linking, down, move, finishLink, beginLink, longPress, blankHold, cancelHold, dispose }
}
