import { apiClient } from './client'
import type { MaaStrategy } from './maa'

export interface StrategyDefinition {
  start_script_id: string
  process_modules: Array<{ script_id: string; wait_after_ms: number }>
  end_script_id: string
  start_wait_after_ms: number
  default_parameters: Record<string, unknown>
}
export interface NewStrategy extends StrategyDefinition { application_id: string; name: string }
export async function createStrategy(body: NewStrategy, key: string) {
  return (await apiClient.post<{ strategy: MaaStrategy }>('/maa/strategies', body,
    { headers: { 'Idempotency-Key': key } })).data.strategy
}

export async function readStrategyDefinition(id: string) {
  return (await apiClient.get<{ strategy: MaaStrategy; definition: StrategyDefinition }>(`/maa/strategies/${id}/edit-definition`)).data
}
export type StrategyCommand = {
  id: string; rowVersion: number; key: string
} & ({ kind: 'save'; definition: StrategyDefinition } | { kind: 'rename'; name: string } | { kind: 'delete' })
export async function executeStrategyCommand(command: StrategyCommand) {
  const url = `/maa/strategies/${command.id}`
  const config = { headers: { 'If-Match': String(command.rowVersion), 'Idempotency-Key': command.key } }
  if (command.kind === 'delete') await apiClient.delete(url, config)
  else if (command.kind === 'rename') return (await apiClient.patch<MaaStrategy>(url, { name: command.name }, config)).data
  else return (await apiClient.put<MaaStrategy>(`${url}/definition`, command.definition, config)).data
}

export async function exportStrategyArchive(strategyId: string): Promise<Blob> {
  return (await apiClient.get<Blob>(
    `/maa/strategies/${encodeURIComponent(strategyId)}/archive`,
    { responseType: 'blob', timeout: 180000 },
  )).data
}
