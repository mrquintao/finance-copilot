import { request } from './client'
import type { ConnectTokenResponse, SyncList, SyncRequest, SyncRun } from './types'

export function createConnectToken(): Promise<ConnectTokenResponse> {
  return request('/sync/connect-token', { method: 'POST', body: {} })
}

export function syncItem(payload: SyncRequest): Promise<SyncRun> {
  return request('/sync', { method: 'POST', body: payload })
}

export function refreshConnections(): Promise<SyncList> {
  return request('/sync/refresh', { method: 'POST' })
}

export function listSyncRuns(signal?: AbortSignal): Promise<SyncList> {
  return request('/sync/runs', { signal })
}
