import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import BotNavigation from '../src/modules/bots/BotNavigation.vue'

it('shows AI drawing as a separate QQ feature without adding it to Discord', async () => {
  const page = mount(BotNavigation, { props: { panel: 'interaction', kind: 'qq' } })
  await page.get('[data-panel="drawing"]').trigger('click')
  expect(page.emitted('select')?.[0]).toEqual(['drawing'])
  await page.setProps({ kind: 'discord' })
  expect(page.find('[data-panel="drawing"]').exists()).toBe(false)
})
