import { flushPromises, mount } from '@vue/test-utils'
import { ElOption, ElSelect } from 'element-plus'
import { markRaw, nextTick } from 'vue'
import { afterEach, expect, it } from 'vitest'
import type { MaaScript } from '../src/shared/api/maa'
import type { StrategyDefinition } from '../src/shared/api/maa-strategies'
import StrategyDefinitionForm from '../src/modules/maa/StrategyDefinitionForm.vue'

const wrappers: Array<ReturnType<typeof mount>> = []

afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()))

function script(
  scriptId: string,
  scriptType: MaaScript['script_type'],
  name: string,
  overrides: Partial<MaaScript> = {},
): MaaScript {
  return {
    script_id: scriptId,
    application_id: 'app',
    name,
    script_type: scriptType,
    status: 'active',
    current_version_id: 'version',
    candidate_version_id: null,
    row_version: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function definition(processIds: string[] = []): StrategyDefinition {
  return {
    start_script_id: 'start-a',
    process_modules: processIds.map(scriptId => ({ script_id: scriptId, wait_after_ms: 0 })),
    end_script_id: 'end-a',
    start_wait_after_ms: 0,
    default_parameters: {},
  }
}

function values(wrapper: ReturnType<typeof mount>, index: number): string[] {
  return wrapper.findAllComponents(ElSelect)[index]!
    .findAllComponents(ElOption)
    .map(option => String(option.props('value')))
}

it('keeps eligible script groups in source order and exposes missing references', () => {
  const wrapper = mount(StrategyDefinitionForm, {
    props: {
      applicationId: 'app',
      modelValue: definition(['missing-process', 'process-b']),
      scripts: [
        script('start-a', 'module_start', '开始'),
        script('process-b', 'module_process', '过程B'),
        script('process-a', 'module_process', '过程A'),
        script('end-a', 'module_end', '结束'),
        script('wrong-app', 'module_process', '其他应用', { application_id: 'other' }),
        script('inactive', 'module_process', '未启用', { status: 'disabled' }),
        script('no-current', 'module_process', '没有当前版本', { current_version_id: null }),
        script('standard', 'standard', '标准脚本'),
      ],
    },
  })
  wrappers.push(wrapper)

  expect(values(wrapper, 0)).toEqual(['start-a'])
  expect(values(wrapper, 1)).toEqual(['missing-process', 'process-b', 'process-a'])
  expect(values(wrapper, 3)).toEqual(['end-a'])
  expect(wrapper.findAllComponents(ElOption).find(option => option.props('value') === 'missing-process')?.props('disabled')).toBe(true)
})

it('rebuilds the groups when application and script props change', async () => {
  const wrapper = mount(StrategyDefinitionForm, {
    props: { applicationId: 'app', modelValue: definition(), scripts: [script('start-a', 'module_start', '旧开始')] },
  })
  wrappers.push(wrapper)

  await wrapper.setProps({
    applicationId: 'next-app',
    modelValue: { ...definition(['next-process']), start_script_id: 'next-start', end_script_id: 'next-end' },
    scripts: [
      script('next-start', 'module_start', '新开始', { application_id: 'next-app' }),
      script('next-process', 'module_process', '新过程', { application_id: 'next-app' }),
      script('next-end', 'module_end', '新结束', { application_id: 'next-app' }),
    ],
  })
  await nextTick()
  await flushPromises()

  expect(values(wrapper, 0)).toEqual(['next-start'])
  expect(values(wrapper, 1)).toEqual(['next-process'])
  expect(values(wrapper, 2)).toEqual(['next-end'])
})

it('reads each eligible script type once with one hundred process rows', () => {
  let scriptTypeReads = 0
  const scripts = [
    script('start-a', 'module_start', '开始'),
    script('process-a', 'module_process', '过程'),
    script('end-a', 'module_end', '结束'),
  ].map(value => markRaw(new Proxy(value, {
    get(target, key, receiver) {
      if (key === 'script_type') scriptTypeReads += 1
      return Reflect.get(target, key, receiver)
    },
  })))
  const wrapper = mount(StrategyDefinitionForm, {
    props: { applicationId: 'app', modelValue: definition(Array.from({ length: 100 }, () => 'process-a')), scripts },
    global: {
      stubs: {
        ElSelect: { template: '<div><slot /></div>' },
        ElOption: { template: '<span />' },
        ElInputNumber: { template: '<input />' },
        ElButton: { template: '<button />' },
      },
    },
  })
  wrappers.push(wrapper)

  expect(scriptTypeReads).toBeLessThanOrEqual(scripts.length * 2)
})
