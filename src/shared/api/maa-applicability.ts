import { apiClient } from './client'

export type ApplicationDevice = { application_id: string; device_id: string; created_at: string }
export type ApplicableApplication = { application_id: string; package_name: string; display_name: string }

export async function fetchApplicableApplications(deviceId: string): Promise<ApplicableApplication[]> {
  return (await apiClient.get<ApplicableApplication[]>(`/maa/devices/${deviceId}/applications`)).data
}

export async function fetchApplicationDevices(applicationId: string): Promise<ApplicationDevice[]> {
  return (await apiClient.get<ApplicationDevice[]>(`/maa/applications/${applicationId}/devices`)).data
}

export async function bindApplicationDevice(applicationId: string, deviceId: string, key: string): Promise<void> {
  await apiClient.post(`/maa/applications/${applicationId}/devices`, { device_id: deviceId },
    { headers: { 'Idempotency-Key': key } })
}

export async function unbindApplicationDevice(applicationId: string, deviceId: string, key: string): Promise<void> {
  await apiClient.delete(`/maa/applications/${applicationId}/devices/${deviceId}`,
    { headers: { 'Idempotency-Key': key } })
}
