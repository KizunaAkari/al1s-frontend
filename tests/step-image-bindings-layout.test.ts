import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import StepImageBindings from '../src/modules/maa/editor/StepImageBindings.vue'

const post = vi.hoisted(() => vi.fn())
vi.mock('../src/shared/api/client', () => ({ apiClient: { post } }))

const originalCreate = URL.createObjectURL
const originalRevoke = URL.revokeObjectURL
afterEach(() => {
  URL.createObjectURL = originalCreate
  URL.revokeObjectURL = originalRevoke
  document.body.innerHTML = ''
})

it('shows the screenshot once in the middle and sends recognition and click region controls to the right', async () => {
  URL.createObjectURL = vi.fn(() => 'blob:test-screenshot')
  URL.revokeObjectURL = vi.fn()
  document.body.innerHTML = '<div id="binding-target"></div><div id="binding-mount"></div>'
  const wrapper = mount(StepImageBindings, {
    attachTo: '#binding-mount',
    props: {
      scriptId: 'script-1', index: 0,
      document: { steps: [{ action: 'recognize_execute', recognition_mode: 'image', execution_mode: 'image_center' }] },
      screenshot: { blob: new Blob(['png']), width: 576, height: 1280 },
      selectedUse: 'template', selectionTitle: '识别图片', mode: 'recognition', controlsTarget: '#binding-target',
    },
    global: { stubs: { ElAlert: true, ElButton: true, ElInputNumber: true,
      ElOption: { props: ['label'], template: '<span>{{ label }}</span>' },
      ElSelect: { template: '<div><slot /></div>' } } },
  })
  try {
    await nextTick()
    expect(wrapper.findAll('img')).toHaveLength(1)
    expect(wrapper.get('img').attributes('src')).toBe('blob:test-screenshot')
    expect(wrapper.find('.selection').exists()).toBe(false)
    const controls = document.getElementById('binding-target')!
    expect(wrapper.text()).toContain('框选识别图片')
    expect(controls.innerHTML).not.toContain('选区用途')
    expect(controls.querySelector('.selection-controls')).toBeNull()
    expect(wrapper.text()).toContain('可以开始选区')
    expect(wrapper.find('.fields').exists()).toBe(false)

    await wrapper.setProps({ selectedUse: 'assertion', selectionTitle: '断言图片' })
    await nextTick()
    expect(wrapper.text()).toContain('框选断言图片')
    expect(controls.querySelector('el-button-stub')).toBeNull()
    await wrapper.setProps({ savedRect: { x: 12, y: 24, width: 60, height: 80 }, showControls: false })
    expect(wrapper.get('.selection.confirmed').attributes('style')).toContain('left:')
    expect(wrapper.get('.selection.confirmed').text()).toBe('')
    expect(controls.querySelector('.selection-controls')).toBeNull()
    await wrapper.setProps({ selectedUse: undefined, savedRect: undefined })
    expect(wrapper.find('.selection').exists()).toBe(false)
    expect(controls.querySelector('.selection-controls')).toBeNull()
  } finally { wrapper.unmount() }
})

it('picks native coordinates from a scaled screenshot without cropping or uploading', async () => {
  URL.createObjectURL = vi.fn(() => 'blob:point')
  URL.revokeObjectURL = vi.fn()
  post.mockClear()
  const wrapper = mount(StepImageBindings, { props: { scriptId: 'script-1', index: 0,
    document: { steps: [{ action: 'wait_click', click_mode: 'fixed' }] },
    screenshot: { blob: new Blob(['png']), width: 2400, height: 1080 }, selectedUse: 'point', selectionTitle: '点击位置',
  } })
  try {
    const image = wrapper.get('img').element as HTMLImageElement
    image.getBoundingClientRect = () => ({ left: 10, top: 20, width: 1200, height: 540 }) as DOMRect
    image.setPointerCapture = vi.fn()
    Object.defineProperty(image, 'complete', { value: true })
    await wrapper.get('img').trigger('pointerdown', { pointerId: 1, clientX: 1061, clientY: 484 })
    await wrapper.get('img').trigger('pointerup', { pointerId: 1, clientX: 1061, clientY: 484 })
    await flushPromises()
    const doc = wrapper.emitted('change')![0]![0] as { steps: object[] }
    expect(doc.steps[0]).toMatchObject({ click: { x: 2102, y: 928 } })
    expect(post).not.toHaveBeenCalled()
    expect(wrapper.emitted('preview')).toBeUndefined()
    await wrapper.setProps({ savedRect: { x: 2102, y: 928, width: 1, height: 1 } })
    expect(wrapper.find('.point-selection').exists()).toBe(true)
    expect(wrapper.findAll('.region-handle')).toHaveLength(0)
  } finally { wrapper.unmount() }
})
