import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import BotNavigation from '../src/modules/bots/BotNavigation.vue'

it('offers AI chat for QQ and does not expose it for Discord', async () => {
  const page = mount(BotNavigation, { props: { panel: 'interaction', kind: 'qq' } })
  expect(page.get('[data-panel="ai"]').text()).toContain('AI 对话')
  await page.get('[data-panel="ai"]').trigger('click')
  expect(page.emitted('select')?.[0]).toEqual(['ai'])
  await page.setProps({ kind: 'discord' })
  expect(page.find('[data-panel="ai"]').exists()).toBe(false)
})
