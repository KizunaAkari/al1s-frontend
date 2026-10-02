import { flushPromises, mount } from '@vue/test-utils'
import { ElButton, ElInput, ElMessageBox } from 'element-plus'
import { afterEach, expect, it, vi } from 'vitest'
import { ApiError } from '../src/shared/api/client'
import * as api from '../src/shared/api/maa-strategies'
import StrategyManageDialog from '../src/modules/maa/StrategyManageDialog.vue'
import StrategyDefinitionForm from '../src/modules/maa/StrategyDefinitionForm.vue'

vi.mock('vue-router', () => ({ onBeforeRouteLeave: vi.fn() }))
const strategy = { strategy_id: 'strategy', application_id: 'app', name: '原名称', row_version: 2 } as never
const definition: api.StrategyDefinition = {
  start_script_id: 'start', end_script_id: 'end', start_wait_after_ms: 0,
  process_modules: [], default_parameters: { keep: { nested: true } },
}
afterEach(() => vi.restoreAllMocks())

function editor() {
  vi.spyOn(api, 'readStrategyDefinition').mockResolvedValue({
    strategy, definition: JSON.parse(JSON.stringify(definition)),
  })
  return mount(StrategyManageDialog, { props: { strategy, scripts: [], more: false, loading: false },
    global: { stubs: { ElDialog: { template: '<div><slot /><slot name="footer" /></div>' } } } })
}

async function click(wrapper: ReturnType<typeof editor>, text: string) {
  await wrapper.findAllComponents(ElButton).find(b => b.text() === text)!.trigger('click')
  await flushPromises()
}

it('saves the edited strategy directly without publication preview', async () => {
  const execute = vi.spyOn(api, 'executeStrategyCommand').mockResolvedValue(strategy)
  const wrapper = editor()
  try {
    await click(wrapper, '管理策略')
    wrapper.findComponent(StrategyDefinitionForm).vm.$emit('update:modelValue', {
      ...definition, start_wait_after_ms: 50,
    })
    await flushPromises()
    await click(wrapper, '保存策略')
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'save', rowVersion: 2,
      definition: expect.objectContaining({ start_wait_after_ms: 50 }),
    }))
    expect(wrapper.emitted('changed')).toHaveLength(1)
  } finally { wrapper.unmount() }
})

it('retries an unknown save response with the same request identity', async () => {
  const execute = vi.spyOn(api, 'executeStrategyCommand')
    .mockRejectedValueOnce(new ApiError('offline', { code: 'network_error' }))
    .mockResolvedValueOnce(strategy)
  const wrapper = editor()
  try {
    await click(wrapper, '管理策略')
    wrapper.findComponent(StrategyDefinitionForm).vm.$emit('update:modelValue', {
      ...definition, start_wait_after_ms: 50,
    })
    await flushPromises()
    await click(wrapper, '保存策略')
    await click(wrapper, '核对原请求')
    expect(execute.mock.calls[1]).toEqual(execute.mock.calls[0])
  } finally { wrapper.unmount() }
})

it('saving a name preserves unsaved module edits and updates the concurrency version', async () => {
  const execute = vi.spyOn(api, 'executeStrategyCommand').mockResolvedValue({
    strategy_id: 'strategy', application_id: 'app', name: '新名称', row_version: 3,
  } as never)
  const wrapper = editor()
  try {
    await click(wrapper, '管理策略')
    wrapper.findComponent(StrategyDefinitionForm).vm.$emit('update:modelValue', {
      ...definition, start_wait_after_ms: 50,
    })
    await wrapper.findComponent(ElInput).setValue('新名称')
    await click(wrapper, '保存名称')
    expect(wrapper.findComponent(StrategyDefinitionForm).props('modelValue').start_wait_after_ms).toBe(50)
    await click(wrapper, '保存策略')
    expect(execute).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'save', rowVersion: 3 }))
  } finally { wrapper.unmount() }
})

it('requires deletion confirmation and retains the dialog on active-plan conflict', async () => {
  vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
  vi.spyOn(api, 'executeStrategyCommand').mockRejectedValue(new ApiError('仍有活动计划', {
    code: 'strategy_has_active_schedules', status: 409,
  }))
  const wrapper = editor()
  try {
    await click(wrapper, '管理策略')
    await click(wrapper, '删除策略')
    expect(ElMessageBox.confirm).toHaveBeenCalled()
    expect(wrapper.text()).toContain('仍有活动计划')
    expect(wrapper.emitted('changed')).toBeUndefined()
  } finally { wrapper.unmount() }
})
