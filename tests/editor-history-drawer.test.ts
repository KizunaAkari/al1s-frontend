import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import EditorHistoryDrawer from '../src/modules/maa/editor/EditorHistoryDrawer.vue'

type HistoryEntry = {
  id: string
  source: 'local' | 'saved'
  label: string
  time: number | null
  steps?: number
  current?: boolean
}

const entries: HistoryEntry[] = [
  { id: 'local-1', source: 'local', label: '本地修改 1', time: Date.UTC(2026, 0, 2, 3, 4), steps: 4, current: true },
  { id: 'saved-1', source: 'saved', label: '已保存版本 1', time: null },
]

const stubs = {
  ElDrawer: {
    props: ['modelValue', 'title', 'size'],
    emits: ['update:modelValue'],
    template: '<div v-if="modelValue" class="drawer-stub"><h1>{{ title }}</h1><slot /></div>',
  },
  ElButton: {
    props: ['disabled', 'loading'],
    emits: ['click'],
    template: '<button :disabled="disabled || loading" @click="$emit(\'click\')"><slot /></button>',
  },
}

function view(overrides: Partial<{
  modelValue: boolean
  entries: HistoryEntry[]
  selectedId: string
  loading: boolean
  error: string
  more: boolean
  restoringDisabled: boolean
}> = {}) {
  return mount(EditorHistoryDrawer, {
    props: {
      modelValue: true,
      entries,
      loading: false,
      more: false,
      restoringDisabled: false,
      ...overrides,
    },
    slots: {
      summary: '<p class="summary-slot">diff</p>',
      preview: '<p class="preview-slot">readonly document</p>',
    },
    global: { stubs },
  })
}

afterEach(() => document.body.replaceChildren())

describe('EditorHistoryDrawer', () => {
  it('selects a row without restoring it', async () => {
    const wrapper = view({ selectedId: 'saved-1' })

    await wrapper.get('[data-history-entry="local-1"]').trigger('click')

    expect(wrapper.emitted('select')).toEqual([['local-1']])
    expect(wrapper.emitted('restore')).toBeUndefined()
    wrapper.unmount()
  })

  it('emits restore only from the explicit restore button', async () => {
    const wrapper = view({ selectedId: 'saved-1' })

    await wrapper.get('[data-history-restore]').trigger('click')

    expect(wrapper.emitted('restore')).toEqual([[]])
    wrapper.unmount()
  })

  it('shows source groups, current and step badges, and local dates', () => {
    const wrapper = view({ selectedId: 'local-1' })
    const rows = wrapper.findAll('[data-history-entry]')

    expect(rows.map(row => row.attributes('data-history-entry'))).toEqual(['local-1', 'saved-1'])
    expect(wrapper.text()).toContain('本地修改')
    expect(wrapper.text()).toContain('已保存版本')
    expect(wrapper.text()).toContain('当前状态')
    expect(wrapper.text()).toContain('4 步')
    expect(wrapper.text()).toContain('2026')
    expect(wrapper.text()).toContain('时间未记录')
    expect(wrapper.find('.summary-slot').text()).toBe('diff')
    expect(wrapper.find('.preview-slot').text()).toBe('readonly document')
    wrapper.unmount()
  })

  it('disables restoring when the parent disallows it, while loading, or without a selection', () => {
    const disabled = view({ selectedId: 'local-1', restoringDisabled: true })
    expect(disabled.get('[data-history-restore]').attributes('disabled')).toBeDefined()
    disabled.unmount()

    const loading = view({ selectedId: 'local-1', loading: true })
    expect(loading.get('[data-history-restore]').attributes('disabled')).toBeDefined()
    loading.unmount()

    const noSelection = view()
    expect(noSelection.get('[data-history-restore]').attributes('disabled')).toBeDefined()
    noSelection.unmount()
  })

  it('shows retry for errors and more only when requested', async () => {
    const wrapper = view({ error: '历史读取失败', more: true })

    expect(wrapper.get('[role="alert"]').text()).toContain('历史读取失败')
    await wrapper.get('[data-history-retry]').trigger('click')
    await wrapper.get('[data-history-more]').trigger('click')
    expect(wrapper.emitted('retry')).toEqual([[]])
    expect(wrapper.emitted('more')).toEqual([[]])

    await wrapper.setProps({ more: false, error: undefined })
    expect(wrapper.find('[data-history-more]').exists()).toBe(false)
    expect(wrapper.find('[data-history-retry]').exists()).toBe(false)
    wrapper.unmount()
  })
})
