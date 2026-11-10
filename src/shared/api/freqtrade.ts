import { apiClient } from './client'

export type FreqtradeAction =
  | 'open' | 'buy' | 'sell' | 'balance' | 'positions' | 'orders' | 'help' | 'chart' | 'deposit'
  | 'f_open' | 'long' | 'short' | 'close' | 'f_balance' | 'f_positions' | 'f_orders' | 'f_chart' | 'f_deposit' | 'f_margin'

export interface FreqtradeSettings {
  enabled: boolean
  private_enabled: boolean
  event_ws_url: string | null
  groups: string[]
  initial_cash: string
  fee: string
  futures_enabled: boolean
  futures_initial_cash: string
  futures_fee: string
  futures_default_leverage: number
  futures_max_leverage: number
  reply_interval_seconds: number
  max_active_accounts: number
  idle_seconds: number
}

export interface FreqtradeWrite {
  settings: FreqtradeSettings
  commands: Record<FreqtradeAction, string>
}

export interface FreqtradeView {
  desired: FreqtradeWrite & { row_version: number }
  applied_version: number
  synchronized: boolean
}

export interface FreqtradeStatus {
  state: 'ready' | 'unavailable'
  version: string
  active_accounts: number
  total_accounts: number
  max_active_accounts: number
  rss_bytes: number
  cpu_percent: number
  market: {
    state: 'unverified' | 'available' | 'error'
    last_success: string | null
    error: string | null
  }
}

export const fetchFreqtradeSettings = async (id: string) =>
  (await apiClient.get<FreqtradeView>(`/bots/freqtrade/settings/${id}`)).data

export const saveFreqtradeSettings = async (id: string, value: FreqtradeWrite | Pick<FreqtradeWrite, 'settings'>, version: number, operation: string) =>
  (await apiClient.put<FreqtradeView>(`/bots/freqtrade/settings/${id}`, value, {
    headers: { 'If-Match': String(version), 'Idempotency-Key': operation },
  })).data

export const fetchFreqtradeStatus = async () =>
  (await apiClient.get<FreqtradeStatus>('/bots/freqtrade/status')).data
