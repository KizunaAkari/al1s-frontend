import type { InjectionKey, Ref } from 'vue'
import type { NativeScreenshot } from './screenshot-connection'
import type { ImageUse, Rect } from './image-binding'

export type RegionRequest = { use: ImageUse; title: string; target: string; branchIndex?: number }
export type RegionPickerContext = {
  active: Ref<RegionRequest | undefined>
  screenshot?: Readonly<Ref<NativeScreenshot | undefined>>
  image?: (request: RegionRequest) => unknown
  testOcr?: (resource: unknown) => Promise<string[]>
  loadPreview?: (resource: unknown) => Promise<string | undefined>
  selection?: (request: RegionRequest) => Rect | undefined
  hasScreenshot: Readonly<Ref<boolean>>
  disabled: Readonly<Ref<boolean>>
  select: (request: RegionRequest, fresh: boolean) => void
}
export const regionPickerKey: InjectionKey<RegionPickerContext> = Symbol('region-picker')
