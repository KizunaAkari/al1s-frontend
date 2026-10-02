import { flushPromises, type VueWrapper } from '@vue/test-utils'

/** Read the popup associated with the named help button, never unrelated body text. */
export async function helpText(wrapper: VueWrapper, subject: string): Promise<string> {
  const button = wrapper.get(`.help-hint__button[aria-label="${subject}说明"]`)
  await button.trigger('click')
  await flushPromises()
  const id = button.attributes('aria-describedby')
  const popup = id ? document.getElementById(id) : null
  if (!popup) throw new Error(`未显示帮助提示：${subject}`)
  return popup.textContent ?? ''
}
