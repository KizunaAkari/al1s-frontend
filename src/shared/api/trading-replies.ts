import { apiClient } from './client'

export type TradingEngine = 'quant' | 'freqtrade'
export interface ReplyVariable { key: string; label: string; example: string }
export interface ReplyVariant { id: string; label: string; default_template: string; variables: ReplyVariable[] }
export interface TradingCommand {
  id: string; label: string; group: string; description: string; usage: string;
  keyword: string; default_keyword: string; templates: Record<string, string>; variants: ReplyVariant[];
}
export interface CommandDraft { keyword: string; templates: Record<string, string> }
export interface TradingCommandsView {
  engine: TradingEngine; row_version: number; mapping_version: number; synchronized: boolean; commands: TradingCommand[];
}
const path = (id: string, engine: TradingEngine) => `/bots/trading/commands/${id}/${engine}`
export const fetchTradingCommands = async (id: string, engine: TradingEngine) =>
  (await apiClient.get<TradingCommandsView>(path(id, engine))).data
export const saveTradingCommand = async (id: string, engine: TradingEngine, action: string, value: CommandDraft, version: number, key: string) =>
  (await apiClient.put<TradingCommandsView>(`${path(id, engine)}/${action}`, value, {
    headers: { 'If-Match': String(version), 'Idempotency-Key': key },
  })).data
export const previewTradingCommand = async (id: string, engine: TradingEngine, action: string, value: CommandDraft & { variant: string }) =>
  (await apiClient.post<{ content: string }>(`${path(id, engine)}/${action}/preview`, value)).data
