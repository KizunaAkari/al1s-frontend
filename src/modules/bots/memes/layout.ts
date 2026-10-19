import type { AvatarSlot, MemeLayout, Slot, TextSlot } from '../../../shared/api/memes'

export function defaultLayout(): MemeLayout {
  return { schema_version: 1, engine: 'composite', width: 320, height: 320, avatars: [], texts: [],
    frame_duration_ms: 100, background_color: '#ffffff' }
}
export function avatarSlot(layout: MemeLayout): AvatarSlot {
  return { x: 0, y: 0, width: Math.min(128, layout.width), height: Math.min(128, layout.height),
    order: layout.avatars.length + layout.texts.length, shape: 'circle', fit: 'cover', rotation: 0 }
}
export function textSlot(layout: MemeLayout): TextSlot {
  return { x: 0, y: 0, width: Math.min(220, layout.width), height: Math.min(80, layout.height),
    order: layout.avatars.length + layout.texts.length, font_size: 28, color: '#ffffff',
    stroke_color: '#000000', stroke_width: 1, align: 'center' }
}
export function normalizeSlot(layout: MemeLayout, slot: Slot): void {
  const bound = (value: number, min: number, max: number) =>
    Math.round(Math.max(min, Math.min(max, Number.isFinite(value) ? value : min)) * 10) / 10
  slot.width = bound(slot.width, 1, layout.width)
  slot.height = bound(slot.height, 1, layout.height)
  slot.x = bound(slot.x, 0, layout.width - slot.width)
  slot.y = bound(slot.y, 0, layout.height - slot.height)
}
export function transformSlot(layout: MemeLayout, kind: 'avatar' | 'text', index: number,
  original: Slot, dx: number, dy: number, scale: number, action: 'move' | 'resize'): MemeLayout {
  const next: MemeLayout = JSON.parse(JSON.stringify(layout))
  const slot = kind === 'avatar' ? next.avatars[index] : next.texts[index]
  if (!slot || scale <= 0) return next
  if (action === 'move') {
    slot.x = Math.max(0, Math.min(layout.width - slot.width, original.x + dx / scale))
    slot.y = Math.max(0, Math.min(layout.height - slot.height, original.y + dy / scale))
  } else {
    slot.width = Math.max(1, Math.min(layout.width - slot.x, original.width + dx / scale))
    slot.height = Math.max(1, Math.min(layout.height - slot.y, original.height + dy / scale))
  }
  slot.x = Math.round(slot.x * 10) / 10
  slot.y = Math.round(slot.y * 10) / 10
  slot.width = Math.round(slot.width * 10) / 10
  slot.height = Math.round(slot.height * 10) / 10
  return next
}
