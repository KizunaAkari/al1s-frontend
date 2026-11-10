import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import BotNavigation from '../src/modules/bots/BotNavigation.vue'

it('offers quant settings on QQ only', async () => {
  const nav = mount(BotNavigation, { props: { panel: 'interaction', kind: 'qq' } })
  expect(nav.find('[data-panel="quant"]').exists()).toBe(true)
  expect(nav.get('[data-panel="quant"]').text()).toContain('模拟交易')
  await nav.setProps({ kind: 'discord' })
  expect(nav.find('[data-panel="quant"]').exists()).toBe(false)
})
