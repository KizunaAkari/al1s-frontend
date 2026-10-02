import { ref } from 'vue'
import { expect, it, vi } from 'vitest'
import { useCanvasPointer } from '../src/modules/maa/editor/use-canvas-pointer'

it('moves only the captured pointer in world coordinates and blocks links when disabled', () => {
  const zoom = ref(2)
  const positions = ref<Record<number, { x: number; y: number }>>({})
  const select = vi.fn()
  const link = vi.fn()
  const capture = vi.fn()
  const disabled = ref(false)
  const pointer = useCanvasPointer({
    zoom, positions, position: () => ({ x: 10, y: 20 }),
    disabled: () => disabled.value, select, link, contextMenu: vi.fn(),
  })
  const target = document.createElement('article')
  target.dataset.node = '3'
  const elementFromPoint = vi.spyOn(document, 'elementFromPoint').mockReturnValue(target)
  const event = {
    button: 0, pointerId: 7, clientX: 100, clientY: 200, target,
    currentTarget: { setPointerCapture: capture },
  } as unknown as PointerEvent
  try {
    pointer.down(event, 1)
    pointer.move({ ...event, pointerId: 8, clientX: 140 } as PointerEvent)
    expect(positions.value).toEqual({})
    pointer.move({ ...event, clientX: 140, clientY: 220 } as PointerEvent)
    expect(positions.value[1]).toEqual({ x: 30, y: 30 })
    expect(select).toHaveBeenCalledWith(1)
    expect(capture).toHaveBeenCalledWith(7)

    pointer.beginLink(event, 1)
    disabled.value = true
    pointer.finishLink(event)
    expect(link).not.toHaveBeenCalled()
    disabled.value = false
    pointer.beginLink(event, 1)
    pointer.finishLink(event)
    expect(link).toHaveBeenCalledWith(1, 3)
  } finally {
    pointer.dispose()
    elementFromPoint.mockRestore()
  }
})
it('allows title dragging but keeps controls interactive', () => {
 const positions = ref<Record<number, { x: number; y: number }>>({})
 const pointer = useCanvasPointer({ zoom: ref(1), positions, position: () => ({ x: 0, y: 0 }), disabled: () => false, select: vi.fn(), link: vi.fn(), contextMenu: vi.fn() })
 for (const tag of ['input', 'select', 'textarea', 'button']) {
  pointer.down({ button: 0, target: document.createElement(tag) } as unknown as PointerEvent, 0)
  expect(pointer.drag.value).toBeUndefined()
 }
 const title = document.createElement('button')
 title.setAttribute('data-node-drag-handle', '')
 const child = title.appendChild(document.createElement('span'))
 const event = { button: 0, target: child, pointerId: 2, clientX: 10, clientY: 20, currentTarget: { setPointerCapture: vi.fn() } } as unknown as PointerEvent
 pointer.down(event, 0)
 pointer.move({ ...event, clientX: 50, clientY: 80 } as PointerEvent)
 expect(positions.value[0]).toEqual({ x: 40, y: 60 })
 pointer.dispose()
})
