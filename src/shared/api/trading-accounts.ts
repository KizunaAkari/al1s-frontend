import { apiClient } from './client'

export type TradingMarket = 'a-share' | 'spot' | 'futures'
export type TradingAction = 'open' | 'buy' | 'sell' | 'long' | 'short' | 'close' | 'deposit' | 'margin'
export interface TradingOwner { qq_id: string | null; row_version: number }
export interface TradingOperation { id?: string; market?: TradingMarket; action?: TradingAction; status: string; result?: string | null }
export interface TradingAccountResult {
  status: string; code?: string; account_state?: string; data?: Record<string, unknown>; owner_version: number
  pending_operation?: TradingOperation | null
}
export interface TradingActionInput {
  owner_version: number; action: TradingAction; symbol?: string; amount?: string; quantity?: number; leverage?: number; all?: boolean
}

const root = (service: string, market: TradingMarket) => `/bots/trading/${service}/${market}`
export const fetchTradingOwner = async () => (await apiClient.get<TradingOwner>('/bots/trading/account-owner')).data
export const saveTradingOwner = async (qqId: string, version: number) =>
  (await apiClient.put<TradingOwner>('/bots/trading/account-owner', { qq_id: qqId }, { headers: { 'If-Match': String(version) } })).data
export const fetchTradingAccount = async (service: string, market: TradingMarket, view: 'account' | 'positions' | 'orders', page = 1) =>
  (await apiClient.get<TradingAccountResult>(`${root(service, market)}/${view}`, { params: { page }, timeout: 135_000 })).data
export const submitTradingAction = async (service: string, market: TradingMarket, value: TradingActionInput, operation: string) =>
  (await apiClient.post<TradingOperation>(`${root(service, market)}/actions`, value,
    { headers: { 'Idempotency-Key': operation }, timeout: 165_000 })).data
export const fetchTradingOperation = async (service: string, market: TradingMarket, operation: string) =>
  (await apiClient.get<TradingOperation>(`${root(service, market)}/actions/${operation}`)).data
