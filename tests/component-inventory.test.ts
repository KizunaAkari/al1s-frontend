import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import ComponentInventory from '../src/modules/maintenance/ComponentInventory.vue'
import { componentApi, type InventoryEntry } from '../src/shared/api/components'

afterEach(() => vi.restoreAllMocks())
it('shows actual Maa separately from the offline terminal and disables unsafe upgrade selection', async () => {
  const common = { target: { kind: 'terminal' as const, terminal_id: 'terminal-id' }, display_name: 'Linux',
    upgrade_unit: 'linux-terminal' as const, architecture: 'arm64', observed_at: '2026-10-04T00:00:00Z',
    image: null, image_id: null, source_identity: 'a'.repeat(64), reason: null }
  const rows: InventoryEntry[] = [
    { ...common, component: 'linux-terminal', version: 'agent-r36', status: 'offline' },
    { ...common, component: 'maa', version: 'v5.12.1', status: 'offline' },
  ]
  vi.spyOn(componentApi, 'inventory').mockResolvedValue({ items: rows, next_cursor: null })
  const wrapper = mount(ComponentInventory)
  try {
    await flushPromises()
    expect(wrapper.text()).toContain('v5.12.1')
    expect(wrapper.text()).toContain('agent-r36')
    expect(wrapper.text()).toContain('最近观测')
    expect(wrapper.findAll('[data-component] button').every(button => button.attributes('disabled') !== undefined)).toBe(true)
    expect(wrapper.emitted('upgrade')).toBeUndefined()
  } finally { wrapper.unmount() }
})
