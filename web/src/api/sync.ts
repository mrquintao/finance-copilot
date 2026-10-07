import { request } from './client'
import type {
  ConnectTokenResponse,
  SyncList,
  SyncRequest,
  SyncRun,
  SyncStatus,
} from './types'

export function createConnectToken(): Promise<ConnectTokenResponse> {
  return request('/sync/connect-token', { method: 'POST', body: {} })
}

export function syncItem(payload: SyncRequest): Promise<SyncRun> {
  return request('/sync', { method: 'POST', body: payload })
}

export function refreshConnections(): Promise<SyncList> {
  return request('/sync/refresh', { method: 'POST' })
}

export function listSyncRuns(
  status: SyncStatus | null,
  signal?: AbortSignal,
): Promise<SyncList> {
  return request('/sync/runs', { query: { status: status ?? undefined }, signal })
}
