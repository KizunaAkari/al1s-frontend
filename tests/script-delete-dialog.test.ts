import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { ElButton } from 'element-plus'
import { ApiError } from '../src/shared/api/client'
import * as deletion from '../src/shared/api/maa-script-deletion'
import ScriptDeleteDialog from '../src/modules/maa/ScriptDeleteDialog.vue'

const push = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
afterEach(() => { vi.restoreAllMocks(); push.mockClear() })

it('lists multiple referrers and opens the selected script and step', async () => {
  vi.spyOn(deletion, 'deleteScript').mockRejectedValue(new ApiError('仍被引用', { code: 'script_in_use', status: 409 }))
  vi.spyOn(deletion, 'fetchScriptReferrers').mockResolvedValue({ items: [
    { script_id: 'a', name: '脚本A', step_indices: [2] },
    { script_id: 'b', name: '脚本B', step_indices: [4, 6] },
  ], nextCursor: null })
  const wrapper = mount(ScriptDeleteDialog, { props: { script: null },
    global: { stubs: { ElDialog: { template: '<div><slot /><slot name="footer" /></div>' } } },
  })
  await wrapper.setProps({ script: { script_id: 's', name: '恢复', row_version: 1 } as never })
  await wrapper.findAllComponents(ElButton).find(b => b.text() === '确认删除')!.trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('脚本A')
  expect(wrapper.text()).toContain('脚本B')
  await wrapper.findAllComponents(ElButton).filter(b => b.text() === '编辑引用脚本')[1]!.trigger('click')
  await flushPromises()
  expect(push).toHaveBeenCalledWith({ path: '/editor', query: { script_id: 'b', step: 4 } })
})
