export interface DeviceState {
  connected?: boolean
  serial?: string
  model?: string
  android_version?: string
  screen_width?: number | null
  screen_height?: number | null
  screen_size?: string
  battery_level?: number | null
  battery_status?: string | null
  screen_on?: boolean | null
  root?: boolean
  warning?: string
  storage?: {
    path?: string
    total_bytes?: number
    used_bytes?: number
    free_bytes?: number
  }
}

export interface Agent {
  id: string
  name: string
  os: string
  address?: string
  status: 'online' | 'offline'
  last_seen?: string
  capabilities: Record<string, unknown>
  metadata: {
    device?: DeviceState
    metadata?: {
      device_lease?: 'idle' | 'interactive' | 'automation'
      interactive?: Record<string, unknown>
      service?: {
        state?: 'running' | 'stopped' | 'busy'
        accepting_tasks?: boolean
        automation_active?: boolean
        started_at?: string
        uptime_seconds?: number
        pid?: number
      }
      storage?: {
        path?: string
        total_bytes?: number
        used_bytes?: number
        free_bytes?: number
      }
      [key: string]: unknown
    }
  }
}

export interface Task {
  id: string
  agent_id: string
  name: string
  script_name?: string
  status: string
  script?: string
  params?: Record<string, unknown>
  batch_id?: string
  batch_sequence?: number
  schedule_type?: 'once' | 'repeat' | 'scheduled' | 'retry'
  scheduled_for?: string
  schedule_window_end?: string
  run_index?: number
  run_total?: number
  root_task_id?: string
  retry_of_task_id?: string
  attempt?: number
  max_retries?: number
  record_video?: boolean
  recording_url?: string
  recording_mime?: string
  recording_size?: number
  task_kind?: 'standard' | 'composition'
  composition?: CompositionModule[]
  result: Record<string, unknown>
  created_at: string
  started_at?: string
  finished_at?: string
}

export type ScriptType = 'standard' | 'module_start' | 'module_process' | 'invalid'

export interface ScriptCompatibilityWarning {
  code: string
  message: string
}

export interface ScriptCompatibility {
  status: 'compatible' | 'warning' | 'unknown'
  summary: string
  warnings: ScriptCompatibilityWarning[]
  device?: {
    serial?: string
    model?: string
    android_version?: string
    screen_width?: number | null
    screen_height?: number | null
  }
}

export interface SavedScript {
  name: string
  content: string
  updated_at: string
  script_type: ScriptType
  cleanup_on_finish: boolean
  category_package?: string | null
  category_name?: string | null
  source_package?: string | null
  source_activity?: string | null
  valid?: boolean
  validation_error?: string
  compatibility?: ScriptCompatibility
}

export interface ScriptCategory {
  agent_id: string
  package_name: string
  display_name: string
  script_count: number
  created_at: string
  updated_at: string
}

export interface ScriptAuditRecord {
  id: number
  agent_id: string
  script_name: string
  operation: 'created' | 'updated' | 'uploaded' | 'category_changed' | 'category_renamed' | 'deleted'
  from_category?: string | null
  to_category?: string | null
  details: Record<string, unknown>
  created_at: string
}

export interface CompositionModule {
  position: number
  script_name: string
  script_type: 'module_start' | 'module_process'
  cleanup_on_finish?: boolean
  interval_after_seconds: number
  step_count?: number
  retry_skipped?: boolean
  retry_replayed?: boolean
  retry_resume?: boolean
}

export interface MaintenanceStatus {
  threshold_bytes: number
  platform: StorageStatus
  storage: StorageStatus[]
  cache: {
    tasks: number
    finished_tasks: number
    recordings: number
    recording_bytes: number
    failure_records: number
    failure_screenshot_bytes: number
    database_bytes: number
  }
}

export interface StorageStatus {
  scope: string
  label: string
  free_bytes: number
  total_bytes: number
  active: boolean
  last_seen: string
  last_sent?: string
  last_attempt?: string
  last_error?: string
}

export interface FailureRecord {
  id: string
  command_id: string
  task_id?: string
  agent_id: string
  script_name: string
  error: string
  failed_step_index?: number | null
  failed_step_action?: string | null
  screenshot_url?: string
  screenshot_mime?: string
  screenshot_size?: number
  email_status: 'disabled' | 'pending' | 'sent' | 'failed'
  email_error?: string | null
  confirmed: boolean
  result: Record<string, unknown>
  created_at: string
}

export interface NotificationStatus {
  smtp_configured: boolean
  failure_email_enabled: boolean
  failure_enabled: boolean
  recipients: string[]
  from: string
  smtp_host: string
  smtp_port: number
  smtp_user: string
  security: 'starttls' | 'ssl' | 'none'
  public_base_url: string
  password_configured: boolean
  source: 'environment' | 'control_center'
  updated_at?: string
}

export interface NotificationSettingsPayload {
  smtp_host: string
  smtp_port: number
  smtp_user: string
  smtp_password?: string
  clear_password: boolean
  smtp_from: string
  security: 'starttls' | 'ssl' | 'none'
  failure_recipients: string[]
  failure_enabled: boolean
  public_base_url: string
}

export interface Command {
  id: string
  agent_id: string
  kind: string
  status: string
  result: Record<string, unknown>
  created_at: string
}

export interface AgentLog {
  id: number
  level: string
  message: string
  created_at: string
}

export interface TerminalArtifact {
  name: string
  size_bytes: number
  sha256: string
  created_at: string
}

export interface TerminalDeployment {
  deployment_id: string
  status: string
  message?: string
  artifact?: TerminalArtifact
  [key: string]: unknown
}

export interface Overview {
  agents_total: number
  agents_online: number
  tasks_running: number
  tasks_succeeded: number
  tasks_failed: number
  failure_records: number
}
