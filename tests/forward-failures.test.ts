import { expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const fetchReviews = vi.hoisted(() => vi.fn())
const fetchDeliveries = vi.hoisted(() => vi.fn())
vi.mock('../src/shared/api/reviews', () => ({ fetchReviews }))
vi.mock('../src/shared/api/notifications', () => ({ fetchDeliveries }))
import ForwardFailures from '../src/modules/notifications/ForwardFailures.vue'

it('separates rejected sources from exhausted forward deliveries', async () => {
  fetchReviews.mockResolvedValue({ items: [{ id: 'review-1', message_id: 'message-1',
    state: 'rejected', failure_reason: 'source_not_allowed', received_at: 'today' }], next_cursor: null })
  fetchDeliveries.mockResolvedValue({ items: [{ delivery_id: 'delivery-1',
    channel_name: 'QQ', targets: ['group-1'], last_error_code: 'provider_timeout',
    created_at: 'today' }], next_cursor: null })
  const wrapper = mount(ForwardFailures)
  try {
    await flushPromises()
    expect(fetchReviews).toHaveBeenCalledWith('rejected', undefined)
    expect(fetchDeliveries).toHaveBeenCalledWith('dead_letter', undefined, 'forward')
    expect(wrapper.text()).toContain('来源不在允许范围')
    expect(wrapper.text()).toContain('provider_timeout')
  } finally { wrapper.unmount() }
})
