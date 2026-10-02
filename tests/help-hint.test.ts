import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElPopover } from 'element-plus'
import { afterEach, expect, it, vi } from 'vitest'
import HelpHint from '../src/shared/ui/HelpHint.vue'
import PageHeader from '../src/shared/ui/PageHeader.vue'

const mounted: VueWrapper[] = []
function view(props = { subject: '执行后等待', content: '全部动作完成后等待；计入步骤超时。' }) {
  const wrapper = mount(HelpHint, { props, attachTo: document.body })
  mounted.push(wrapper)
  return wrapper
}
afterEach(() => {
  mounted.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
})
function visible(wrapper: VueWrapper) { return wrapper.findComponent(ElPopover).props('visible') }

it('shows help on hover and focus, and hides when neither pointer nor focus remains', async () => {
  const wrapper = view(), button = wrapper.get('button')
  expect(visible(wrapper)).toBe(false)
  expect(wrapper.text()).not.toContain('全部动作完成后等待')
  await button.trigger('mouseenter')
  expect(visible(wrapper)).toBe(true)
  expect(button.attributes('aria-describedby')).toBeTruthy()
  await button.trigger('mouseleave')
  expect(visible(wrapper)).toBe(false)
  await button.trigger('focus')
  await button.trigger('mouseleave')
  expect(visible(wrapper)).toBe(true)
  await button.trigger('blur')
  expect(visible(wrapper)).toBe(false)
})

it('pins help on click, survives leaving the button, and closes on another click or Escape', async () => {
  const wrapper = view(), button = wrapper.get('button')
  await button.trigger('focus')
  await button.trigger('click')
  expect(button.attributes('aria-pressed')).toBe('true')
  await button.trigger('mouseleave')
  await button.trigger('blur')
  expect(visible(wrapper)).toBe(true)
  await button.trigger('click')
  expect(visible(wrapper)).toBe(false)
  await button.trigger('click')
  await button.trigger('keydown', { key: 'Escape' })
  expect(visible(wrapper)).toBe(false)
  expect(button.attributes('aria-pressed')).toBe('false')
})

it('closes a pinned hint when clicking outside, without leaving a dangling popup after removal', async () => {
  const wrapper = view()
  await wrapper.get('button').trigger('click')
  await flushPromises()
  document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  await flushPromises()
  expect(visible(wrapper)).toBe(false)
  wrapper.unmount()
  expect(document.querySelector('.help-hint__content')).toBeNull()
})

it('does not submit, change the labelled input, or invoke the surrounding business action', async () => {
  const submitted = vi.fn(), selected = vi.fn()
  const wrapper = mount({ components: { HelpHint }, setup: () => ({ submitted, selected }),
    template: '<form @submit.prevent="submitted" @click="selected"><label>等待<input value="2.75"><HelpHint subject="等待" content="说明" /></label></form>' }, { attachTo: document.body })
  mounted.push(wrapper)
  await wrapper.get('.help-hint__button').trigger('click')
  await wrapper.get('.help-hint__button').trigger('dblclick')
  expect(submitted).not.toHaveBeenCalled()
  expect(selected).not.toHaveBeenCalled()
  expect((wrapper.get('input').element as HTMLInputElement).value).toBe('2.75')
  expect(wrapper.get('.help-hint__button').attributes('type')).toBe('button')
})

it('keeps dynamic explanations intact and treats provided content as text', async () => {
  const wrapper = view({ subject: '说明', content: '<img src=x onerror=alert(1)>' })
  await wrapper.get('button').trigger('click')
  await flushPromises()
  expect(document.querySelector('.help-hint__content')?.textContent).toBe('<img src=x onerror=alert(1)>')
  expect(document.querySelector('.help-hint__content img')).toBeNull()
  await wrapper.setProps({ content: '新的说明' })
  expect(document.querySelector('.help-hint__content')?.textContent).toBe('新的说明')
})

it('places a page description next to the title without a separate paragraph', async () => {
  const wrapper = mount(PageHeader, { props: { title: '任务中心', description: '任务和计划说明' } })
  mounted.push(wrapper)
  expect(wrapper.find('h2 .help-hint').exists()).toBe(true)
  expect(wrapper.text()).not.toContain('任务和计划说明')
  expect(wrapper.findComponent(HelpHint).props('content')).toBe('任务和计划说明')
})
