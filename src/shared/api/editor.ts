import { apiClient } from './client'

export type EditorSession = {
  session_id: string
  device_id: string
  terminal_id: string
  status: 'pending' | 'active' | 'closing' | 'closed' | 'failed' | 'expired'
  error_code: string | null
  connection?: {
    transport: 'scrcpy-managed-v1' | 'android-reverse-v1'
    scrcpy_version: '3.3.4'
    video_ws_url: string
    control_ws_url: string
    screenshot_ws_url?: string
  } | null
}

export async function createEditorSession(deviceId: string, requestId: string): Promise<EditorSession> {
  return (await apiClient.post<EditorSession>('/editor-sessions', { device_id: deviceId }, {
    headers: { 'Idempotency-Key': requestId },
  })).data
}

export async function fetchEditorSession(id: string): Promise<EditorSession> {
  const session = (await apiClient.get<EditorSession>(`/editor-sessions/${id}`)).data
  if (session.connection) {
    for (const key of ['video_ws_url', 'control_ws_url', 'screenshot_ws_url'] as const) {
      const value = session.connection[key]
      if (value?.startsWith('/api/v1/editor-sessions/') && !value.startsWith('//')) {
        const url = new URL(value, location.origin)
        url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
        session.connection[key] = url.href
      }
    }
  }
  return session
}

export async function currentEditorSession(deviceId: string): Promise<EditorSession | null> {
  return (await apiClient.get<EditorSession | null>('/editor-sessions', { params: { device_id: deviceId } })).data
}

export async function closeEditorSession(id: string): Promise<EditorSession> {
  return (await apiClient.delete<EditorSession>(`/editor-sessions/${id}`)).data
}
