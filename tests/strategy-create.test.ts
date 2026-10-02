import { flushPromises, mount } from '@vue/test-utils'
import { ElButton, ElInput, ElInputNumber, ElOption, ElSelect } from 'element-plus'
import { afterEach, expect, it, vi } from 'vitest'
import { ApiError } from '../src/shared/api/client'
import * as strategies from '../src/shared/api/maa-strategies'
import StrategyCreateDialog from '../src/modules/maa/StrategyCreateDialog.vue'

afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear() })
function editor() {
  const scripts = ['module_start', 'module_process', 'module_end', 'standard'].map((type, i) => ({
    script_id: String(i), application_id: 'app', script_type: type, status: 'active', current_version_id: `v${i}`, name: type,
  }))
  return mount(StrategyCreateDialog, {
    props: { application: { application_id: 'app' } as never, scripts: [...scripts,
      { ...scripts[0], script_id: 'candidate-only', current_version_id: null },
      { ...scripts[0], script_id: 'other-app', application_id: 'other' },
    ] as never, more: true, loading: false },
    global: { stubs: { ElDialog: { template: '<div><slot /><slot name="footer" /></div>' } } },
  })
}
async function click(wrapper: ReturnType<typeof editor>, text: string) {
  await wrapper.findAllComponents(ElButton).find(b => b.text() === text)!.trigger('click'); await flushPromises()
}
async function fill(wrapper: ReturnType<typeof editor>) {
  await wrapper.findComponent(ElInput).setValue('日常组合')
  const selects = wrapper.findAllComponents(ElSelect)
  selects[0]!.vm.$emit('update:modelValue', '0')
  await flushPromises()
  selects[1]!.vm.$emit('update:modelValue', '2')
  await flushPromises()
}
it('only offers published same-application role modules and supports zero process modules', async () => {
  const create = vi.spyOn(strategies, 'createStrategy').mockResolvedValue({} as never)
  const wrapper = editor()
  try {
    const options = wrapper.findAllComponents(ElOption).map(o => o.props('value'))
    expect(options).toEqual(['0', '2'])
    await fill(wrapper); await click(wrapper, '创建组合策略')
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ application_id: 'app', name: '日常组合',
      start_script_id: '0', end_script_id: '2', process_modules: [] }), expect.any(String))
    expect(wrapper.emitted('created')).toHaveLength(1)
  } finally { wrapper.unmount() }
})
it('keeps an unknown creation request across remount without creating a second identity', async () => {
  const create = vi.spyOn(strategies, 'createStrategy').mockRejectedValueOnce(new ApiError('offline', { code: 'network_error' }))
    .mockResolvedValueOnce({} as never)
  const first = editor()
  await fill(first); await click(first, '创建组合策略'); first.unmount()
  const second = editor()
  try {
    await click(second, '核对原请求')
    expect(create.mock.calls[1]).toEqual(create.mock.calls[0])
    expect(sessionStorage.getItem('al1s.strategy-create.pending')).toBeNull()
  } finally { second.unmount() }
})
it('emits pagination rather than treating the loaded page as the complete module pool', async () => {
  const wrapper = editor()
  try { await click(wrapper, '加载更多模块'); expect(wrapper.emitted('more')).toHaveLength(1) }
  finally { wrapper.unmount() }
})

it('moves process entries together with their wait intervals', async () => {
  const create = vi.spyOn(strategies, 'createStrategy').mockResolvedValue({} as never)
  const wrapper = editor()
  try {
    await fill(wrapper)
    await click(wrapper, '添加过程'); await click(wrapper, '添加过程')
    const selectors = wrapper.findAllComponents(ElSelect)
    selectors[1]!.vm.$emit('update:modelValue', '1')
    await flushPromises()
    selectors[2]!.vm.$emit('update:modelValue', '1')
    await flushPromises()
    const waits = wrapper.findAllComponents(ElInputNumber)
    waits[1]!.vm.$emit('change', 100)
    await flushPromises()
    waits[2]!.vm.$emit('change', 200)
    await flushPromises()
    await click(wrapper, '下移')
    await click(wrapper, '创建组合策略')
    expect(create.mock.calls[0]?.[0].process_modules).toEqual([
      { script_id: '1', wait_after_ms: 200 }, { script_id: '1', wait_after_ms: 100 },
    ])
  } finally { wrapper.unmount() }
})
