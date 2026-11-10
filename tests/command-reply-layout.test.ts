import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'

import CommandReplyLayout from '../src/modules/bots/CommandReplyLayout.vue'

const entries = [
  { id: 'buy', label: '买入', group: 'A股', keyword: '买入', custom: false, dirty: false },
  { id: 'orders', label: '成交', group: 'A股', keyword: '成交', custom: true, dirty: true },
  { id: 'open', label: '开户', group: '通用', keyword: '开户', custom: false, dirty: false },
]

const props = {
  entries,
  active: 'buy',
  title: '买入',
  description: '提交模拟买入',
  keyword: '买入',
  usage: '股票代码和股数',
  variants: [{ id: 'accepted', label: '已受理' }, { id: 'empty', label: '空页' }],
  variant: 'accepted',
  template: '已受理：{name}',
  variables: [{ key: 'name', label: '股票名称', example: '贵州茅台' }],
  preview: '已受理：贵州茅台\n数量：100',
  previewCommand: '买入 600519 100',
  chart: false,
  customTemplate: false,
  dirty: true,
  busy: false,
  error: '',
  notice: '',
  sync: '已同步',
}

describe('CommandReplyLayout', () => {
  it('filters available variables without changing the template', async () => {
    const page = mount(CommandReplyLayout, { props: { ...props, variables: [
      ...props.variables, { key: 'quantity', label: '数量', example: '100' },
    ] } })
    await page.get('[data-field="variable-search"]').setValue('数量')
    expect(page.find('[data-variable="name"]').exists()).toBe(false)
    expect(page.find('[data-variable="quantity"]').exists()).toBe(true)
    expect(page.emitted('template')).toBeUndefined()
  })
  it('groups commands and filters by label or keyword while showing state markers', async () => {
    const page = mount(CommandReplyLayout, { props })

    expect(page.findAll('[data-group]').map(group => group.attributes('data-group'))).toEqual(['A股', '通用'])
    expect(page.get('[data-group="A股"] [data-group-count]').text()).toBe('2')
    expect(page.get('[data-entry="orders"]').text()).toContain('自定义')
    expect(page.find('[data-entry="orders"] [data-dirty-marker]').exists()).toBe(true)

    await page.get('[data-field="command-search"]').setValue('开户')
    expect(page.find('[data-entry="open"]').exists()).toBe(true)
    expect(page.find('[data-entry="buy"]').exists()).toBe(false)
    expect(page.find('[data-entry="orders"]').exists()).toBe(false)
  })

  it('opens and closes a command group on the first click', async () => {
    const page = mount(CommandReplyLayout, { props })
    const activeHeading = page.get('[data-group="A股"] .reply-group-heading')
    expect(activeHeading.attributes('aria-expanded')).toBe('true')
    await activeHeading.trigger('click')
    expect(activeHeading.attributes('aria-expanded')).toBe('false')
    expect(page.get('[data-group="A股"] .reply-entry-list').attributes('style')).toContain('display: none')
    await activeHeading.trigger('click')
    expect(activeHeading.attributes('aria-expanded')).toBe('true')

    const heading = page.get('[data-group="通用"] .reply-group-heading')
    expect(heading.attributes('aria-expanded')).toBe('false')
    await heading.trigger('click')
    expect(heading.attributes('aria-expanded')).toBe('true')
    expect(page.get('[data-entry="open"]').isVisible()).toBe(true)
    await heading.trigger('click')
    expect(heading.attributes('aria-expanded')).toBe('false')
  })

  it('keeps active selection controlled and saves only the current title', async () => {
    const page = mount(CommandReplyLayout, { props })

    await page.get('[data-entry="orders"]').trigger('click')
    expect(page.emitted('select')).toEqual([['orders']])
    expect(page.get('[data-entry="buy"]').classes()).toContain('active')

    await page.setProps({ active: 'orders', title: '成交' })
    expect(page.get('[data-entry="orders"]').classes()).toContain('active')
    await page.get('[data-action="save-command-reply"]').trigger('click')
    expect(page.emitted('save')).toHaveLength(1)
  })

  it('emits controlled keyword and variant edits', async () => {
    const page = mount(CommandReplyLayout, { props })

    await page.get('[data-field="keyword"]').setValue('买')
    await page.get('[data-field="variant"]').setValue('empty')
    expect(page.emitted('keyword')).toEqual([['买']])
    expect(page.emitted('variant')).toEqual([['empty']])
  })

  it('inserts a variable at the textarea selection and keeps the cursor after it', async () => {
    const host = defineComponent({
      setup() {
        const template = ref('前后')
        return () => h(CommandReplyLayout, { ...props, template: template.value, onTemplate: (value: string) => { template.value = value } })
      },
    })
    const page = mount(host)
    const textarea = page.get('[data-field="template"]').element as HTMLTextAreaElement
    textarea.focus()
    textarea.setSelectionRange(1, 1)

    await page.get('[data-variable="name"]').trigger('click')
    expect(page.findComponent(CommandReplyLayout).emitted('template')).toEqual([['前{name}后']])
    expect((page.get('[data-field="template"]').element as HTMLTextAreaElement).selectionStart).toBe(7)
  })

  it('renders preview as plain text with line breaks and has no send action', () => {
    const page = mount(CommandReplyLayout, { props })

    expect(page.get('[data-preview="message"]').element.textContent).toBe('已受理：贵州茅台\n数量：100')
    expect(page.get('[data-preview="message"]').attributes('style')).toBeUndefined()
    expect(page.find('[data-action="send-preview"]').exists()).toBe(false)
    expect(page.find('[data-preview="example"]').text()).toContain('示例数据')
  })

  it('emits restore for the current command', async () => {
    const page = mount(CommandReplyLayout, { props })

    await page.get('[data-action="restore-command-reply"]').trigger('click')
    expect(page.emitted('restore')).toHaveLength(1)
  })

  it('keeps template source controlled through default and custom mode events', async () => {
    const page = mount(CommandReplyLayout, { props: { ...props, customTemplate: false } })

    await page.get('[data-action="template-custom"]').trigger('click')
    expect(page.emitted('templateCustom')).toHaveLength(1)

    await page.setProps({ customTemplate: true })
    await page.get('[data-action="template-default"]').trigger('click')
    expect(page.emitted('templateDefault')).toHaveLength(1)
  })

  it('keeps highlighted template text plain and preserves controlled input updates', async () => {
    const host = defineComponent({
      setup() {
        const template = ref('原样 <b>标签</b> {name}')
        return () => h(CommandReplyLayout, { ...props, template: template.value, onTemplate: (value: string) => { template.value = value } })
      },
    })
    const page = mount(host)
    const highlight = page.get('[data-template-highlight]')
    expect(highlight.text()).toBe('原样 <b>标签</b> {name}')
    expect(highlight.html()).not.toContain('<b>标签</b>')
    expect(highlight.get('[data-variable-token]').text()).toBe('{name}')

    await page.get('[data-field="template"]').setValue('更新 {name}')
    expect(page.get('[data-template-highlight]').text()).toBe('更新 {name}')
  })
})
