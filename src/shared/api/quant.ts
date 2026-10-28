import { apiClient } from './client'

export type QuantAction = 'open' | 'buy' | 'sell' | 'balance' | 'positions' | 'orders' | 'backtest' | 'help'
export type QuantProvider = 'sina' | 'tencent' | 'eastmoney' | 'tushare' | 'gugudata'
export type CredentialProvider = 'tushare' | 'gugudata'
export interface QuantSettings {
  enabled: boolean; private_enabled: boolean; event_ws_url: string | null; groups: string[];
  initial_cash: string; commission_rate: string; minimum_commission: string; stamp_tax_rate: string;
  slippage: string; max_quote_age_seconds: number; bar_cache_days: number; refresh_seconds: number;
  reply_interval_seconds: number; provider: QuantProvider; provider_order: QuantProvider[];
}
export interface QuantWrite { settings: QuantSettings; commands: Record<QuantAction, string> }
export interface QuantVersions { row_version: number; mapping_version: number }
export interface QuantView {
  desired: QuantWrite & QuantVersions; applied: QuantVersions; process_applied: QuantVersions | null;
  synchronized: boolean;
}
export interface QuantStatus {
  database: 'available' | 'unavailable'; engine: { version: string | null; entitlement_supported: boolean };
  source: Record<string, { last_success: string | null; checked_at: string; error: string | null }>;
  rss_bytes: number | null; cpu_seconds: number; cpu_percent: number;
}
export const fetchQuantStatus = async () => (await apiClient.get<QuantStatus>('/bots/quant/status')).data
export const fetchQuantCredentials = async () => (await apiClient.get<Record<CredentialProvider, boolean>>('/bots/quant/credentials')).data
export const saveQuantCredential = async (provider: CredentialProvider, secret: string | null) =>
  (await apiClient.put<{ configured: boolean }>(`/bots/quant/credentials/${provider}`, { secret })).data
export const fetchQuantSettings = async (id: string) =>
  (await apiClient.get<QuantView>(`/bots/quant/settings/${id}`)).data
export const saveQuantSettings = async (id: string, value: QuantWrite, version: number, operation: string) =>
  (await apiClient.put<QuantView>(`/bots/quant/settings/${id}`, value, {
    headers: { 'If-Match': String(version), 'Idempotency-Key': operation },
  })).data
