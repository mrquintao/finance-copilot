import { request } from './client'
import type { AccountList } from './types'

export function listAccounts(signal?: AbortSignal): Promise<AccountList> {
  return request('/accounts', { signal })
}
