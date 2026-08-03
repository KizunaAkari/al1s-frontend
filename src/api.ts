import axios from 'axios'
import type { Agent, AgentLog, Command, FailureRecord, MaintenanceStatus, NotificationSettingsPayload, NotificationStatus, Overview, SavedScript, ScriptAuditRecord, ScriptCategory, Task, TerminalArtifact, TerminalDeployment } from './types'

const client = axios.create({ baseURL: '/api', timeout: 15_000 })

export const api = {
  overview: async () => (await client.get<Overview>('/overview')).data,
  agents: async () => (await client.get<Agent[]>('/agents')).data,
  tasks: async () => (await client.get<Task[]>('/tasks')).data,
  failures: async () => (await client.get<FailureRecord[]>('/failures')).data,
  failure: async (id: string) => (await client.get<FailureRecord>(`/failures/${id}`)).data,
  notificationStatus: async () => (await client.get<NotificationStatus>('/notifications/status')).data,
  notificationSettings: async () => (await client.get<NotificationStatus>('/notifications/settings')).data,
  saveNotificationSettings: async (payload: NotificationSettingsPayload) =>
    (await client.put<NotificationStatus>('/notifications/settings', payload)).data,
  testNotification: async (to: string) =>
    (await client.post<{ ok: boolean; to: string[] }>('/notifications/test', { to }, { timeout: 30_000 })).data,
  command: async (id: string) => (await client.get<Command>(`/commands/${id}`)).data,
  waitCommand: async (id: string, waitSeconds = 15) =>
    (await client.get<Command>(`/commands/${id}`, {
      params: { wait_seconds: waitSeconds },
      timeout: Math.ceil((waitSeconds + 5) * 1000),
    })).data,
  logs: async (agentId: string) => (await client.get<AgentLog[]>(`/agents/${agentId}/logs`)).data,
  action: async (agentId: string, path: string, body: unknown = undefined) =>
    (await client.post<{ command_id: string; status: string }>(`/agents/${agentId}/${path}`, body)).data,
  control: async (agentId: string, payload: Record<string, unknown>) =>
    (await client.post<{ command_id: string; status: string }>(`/agents/${agentId}/control`, payload)).data,
  startInteractive: async (agentId: string, deviceSerial: string) =>
    (await client.post<{ command_id: string; status: string }>(`/agents/${agentId}/interactive/start`, { device_serial: deviceSerial })).data,
  stopInteractive: async (agentId: string, sessionToken: string) =>
    (await client.post<{ command_id: string; status: string }>(`/agents/${agentId}/interactive/stop`, { session_token: sessionToken })).data,
  createTask: async (payload: Record<string, unknown>) => (await client.post<Task>('/tasks', payload)).data,
  createTaskBatch: async (payload: Record<string, unknown>) =>
    (await client.post<{ batch_id: string; mode: string; count: number; tasks: Task[] }>('/tasks/batch', payload)).data,
  createTaskComposition: async (payload: Record<string, unknown>) =>
    (await client.post<{ batch_id: string; mode: string; count: number; tasks: Task[] }>('/tasks/compositions', payload)).data,
  cancelTask: async (taskId: string) => (await client.post<Task>(`/tasks/${taskId}/cancel`)).data,
  retryTask: async (taskId: string) => (await client.post<Task>(`/tasks/${taskId}/retry`)).data,
  deleteTask: async (taskId: string) =>
    (await client.delete<{ ok: boolean; id: string; recording_deleted_bytes?: number }>(`/tasks/${taskId}`)).data,
  confirmFailure: async (failureId: string) =>
    (await client.post<FailureRecord>(`/failures/${failureId}/confirm`)).data,
  deleteFailure: async (failureId: string) =>
    (await client.delete<{ ok: boolean; id: string; removed_bytes?: number }>(`/failures/${failureId}`)).data,
  maintenanceStatus: async () => (await client.get<MaintenanceStatus>('/maintenance/status')).data,
  cleanup: async (payload: Record<string, unknown>) =>
    (await client.post<Record<string, unknown>>('/maintenance/cleanup', payload, { timeout: 60_000 })).data,
  listScripts: async (agentId: string) =>
    (await client.get<SavedScript[]>(`/agents/${agentId}/scripts`)).data,
  listScriptCategories: async (agentId: string) =>
    (await client.get<ScriptCategory[]>(`/agents/${agentId}/script-categories`)).data,
  renameScriptCategory: async (agentId: string, packageName: string, displayName: string) =>
    (await client.put<ScriptCategory>(
      `/agents/${agentId}/script-categories/${encodeURIComponent(packageName)}`,
      { display_name: displayName },
    )).data,
  scriptAudit: async (agentId: string, limit = 200) =>
    (await client.get<ScriptAuditRecord[]>(`/agents/${agentId}/script-audit`, { params: { limit } })).data,
  getScript: async (agentId: string, name: string) =>
    (await client.get<SavedScript>(`/agents/${agentId}/scripts/${encodeURIComponent(name)}`)).data,
  saveScript: async (agentId: string, name: string, content: string) =>
    (await client.put<SavedScript>(`/agents/${agentId}/scripts/${encodeURIComponent(name)}`, { content })).data,
  importScript: async (agentId: string, name: string, content: string, categoryPackage?: string) =>
    (await client.post<SavedScript>(`/agents/${agentId}/scripts/import`, {
      name,
      content,
      category_package: categoryPackage || null,
    })).data,
  moveScriptCategory: async (agentId: string, name: string, categoryPackage?: string) =>
    (await client.patch<SavedScript>(
      `/agents/${agentId}/scripts/${encodeURIComponent(name)}/category`,
      { category_package: categoryPackage || null },
    )).data,
  deleteScript: async (agentId: string, name: string) =>
    (await client.delete<{ ok: boolean; name: string }>(
      `/agents/${agentId}/scripts/${encodeURIComponent(name)}`,
    )).data,
  downloadScript: async (agentId: string, name: string) =>
    (await client.get<Blob>(
      `/agents/${agentId}/scripts/${encodeURIComponent(name)}/download`,
      { responseType: 'blob' },
    )).data,
  runQuickTest: async (
    agentId: string,
    content: string,
    mode: 'once' | 'repeat',
    repeatCount: number,
  ) => (await client.post<{ command_id: string }>(`/agents/${agentId}/quick-tests`, {
    content,
    mode,
    repeat_count: repeatCount,
  })).data,
  runStep: async (agentId: string, content: string, keepInteractive = true) =>
    (await client.post<{ command_id: string }>(`/agents/${agentId}/steps/run`, { content, keep_interactive: keepInteractive })).data,
  terminalArtifacts: async () => (await client.get<TerminalArtifact[]>('/terminal-deploy/artifacts')).data,
  uploadTerminalArtifact: async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return (await client.post<TerminalArtifact>('/terminal-deploy/artifacts', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 10 * 60_000,
    })).data
  },
  deployTerminal: async (agentId: string, artifactName: string) =>
    (await client.post<TerminalDeployment>(`/agents/${agentId}/deploy`, { artifact_name: artifactName }, { timeout: 30_000 })).data,
  terminalDeploymentStatus: async (agentId: string, deploymentId: string) =>
    (await client.get<TerminalDeployment>(`/agents/${agentId}/deployments/${deploymentId}`, { timeout: 15_000 })).data,
}
