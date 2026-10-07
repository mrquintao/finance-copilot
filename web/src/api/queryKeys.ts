import type { TransactionFilters } from '../hooks/useTransactionFilters'
import type { Period } from '../lib/period'

// The period is part of every key: a response can only land in the cache entry of the period
// it was requested for, so a late response never shows up under a newer selection.
export const queryKeys = {
  summary: (period: Period) => ['analytics', 'summary', period.start, period.end] as const,
  byCategory: (period: Period) => ['analytics', 'by-category', period.start, period.end] as const,
  comparison: (period: Period) => ['analytics', 'comparison', period.start, period.end] as const,
  projection: (asOf: string) => ['analytics', 'projection', asOf] as const,
  // Filters are part of the key for the same reason as the period.
  transactions: (period: Period, filters: TransactionFilters) =>
    ['transactions', 'list', period.start, period.end, filters] as const,
  transaction: (id: string) => ['transactions', 'detail', id] as const,
  syncRuns: (status: string | null) => ['sync', 'runs', status ?? 'all'] as const,
  accounts: () => ['accounts'] as const,
  copilotStatus: () => ['copilot', 'status'] as const,
  categories: () => ['categories'] as const,
}
