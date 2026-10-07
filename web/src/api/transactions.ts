import type { TransactionFilters } from '../hooks/useTransactionFilters'
import type { Period } from '../lib/period'
import { request } from './client'
import type { Transaction, TransactionPage } from './types'

export const PAGE_SIZE = 50

export function listTransactions(
  period: Period,
  filters: TransactionFilters,
  offset: number,
  signal?: AbortSignal,
): Promise<TransactionPage> {
  return request('/transactions', {
    query: {
      start_date: period.start,
      end_date: period.end,
      // Empty filters are left out of the request.
      q: filters.q || undefined,
      account_id: filters.accountId || undefined,
      category_id: filters.categoryId || undefined,
      type: filters.type || undefined,
      limit: PAGE_SIZE,
      offset,
    },
    signal,
  })
}

export function getTransaction(id: string, signal?: AbortSignal): Promise<Transaction> {
  return request(`/transactions/${encodeURIComponent(id)}`, { signal })
}
