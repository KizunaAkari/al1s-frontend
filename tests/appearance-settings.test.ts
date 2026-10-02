import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ElButton } from 'element-plus'

const put = vi.hoisted(() => vi.fn())
vi.mock('../src/shared/api/client', () => ({ apiClient: { put } }))
import AppearanceSettings from '../src/modules/auth/AppearanceSettings.vue'

afterEach(() => put.mockReset())

it('uploads a validated image for the shared login background', async () => {
  put.mockResolvedValue({ data: { media_type: 'image/png' } })
  const wrapper = mount(AppearanceSettings)
  try {
    const input = wrapper.get('input[type="file"]')
    const image = new File(['image'], 'background.png', { type: 'image/png' })
    Object.defineProperty(input.element, 'files', { configurable: true, value: [image] })
    await input.trigger('change')
    await wrapper.findComponent(ElButton).trigger('click')
    await flushPromises()
    expect(put).toHaveBeenCalledWith('/appearance/login-background', image, {
      headers: { 'Content-Type': 'image/png' }, timeout: 30000,
    })
    expect(wrapper.text()).toContain('登录背景已更新')
  } finally { wrapper.unmount() }
})

it('rejects an unsupported file before requesting the server', async () => {
  const wrapper = mount(AppearanceSettings)
  try {
    const input = wrapper.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', { configurable: true,
      value: [new File(['svg'], 'background.svg', { type: 'image/svg+xml' })] })
    await input.trigger('change')
    await wrapper.findComponent(ElButton).trigger('click')
    expect(wrapper.text()).toContain('请选择不超过 8 MiB')
    expect(put).not.toHaveBeenCalled()
  } finally { wrapper.unmount() }
})
