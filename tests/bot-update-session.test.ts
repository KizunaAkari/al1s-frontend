import { expect, it } from 'vitest'
import { BotUpdateSession } from '../src/modules/bots/bot-update-session'

it('invalidates responses on switching away and back, and on leaving the page', () => {
  const session = new BotUpdateSession('qq')
  const old = session.capture()
  session.select('discord')
  expect(session.current(old)).toBe(false)
  session.select('qq')
  expect(session.current(old)).toBe(false)
  const fresh = session.capture()
  expect(session.current(fresh)).toBe(true)
  session.close()
  expect(session.current(fresh)).toBe(false)
})
