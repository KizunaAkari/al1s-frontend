import { apiClient } from './client'
import type { ComponentRelease, InventoryEntry, Page } from './components'
export type BotAlias = 'qq' | 'discord'
export type BotUpdateState = { alias: BotAlias; current: InventoryEntry; runtime_version: string | null }
export const botUpdateApi = {
  async versions(alias: BotAlias, limit = 5, cursor?: string) {
    return (await apiClient.get<Page<ComponentRelease>>(`/bots/updates/${alias}/versions`,
      { params: { limit, cursor } })).data
  },
  async state(alias: BotAlias) {
    return (await apiClient.get<BotUpdateState>(`/bots/updates/${alias}`)).data
  },
  async checkQq() {
    return (await apiClient.post<Page<ComponentRelease>>('/bots/updates/qq/check', {}, { timeout: 35_000 })).data
  },
  async prepare(row: ComponentRelease) {
    return (await apiClient.post<ComponentRelease>(`/bots/updates/qq/candidates/${row.release_id}/prepare`, {},
      { headers: { 'If-Match': String(row.row_version) } })).data
  },
}
