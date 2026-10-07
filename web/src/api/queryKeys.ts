import type { Period } from '../lib/period'

// The period is part of every key: a response can only land in the cache entry of the period
// it was requested for, so a late response never shows up under a newer selection.
export const queryKeys = {
  summary: (period: Period) => ['analytics', 'summary', period.start, period.end] as const,
  byCategory: (period: Period) => ['analytics', 'by-category', period.start, period.end] as const,
  transactions: (period: Period) => ['transactions', 'list', period.start, period.end] as const,
  transaction: (id: string) => ['transactions', 'detail', id] as const,
  syncRuns: (status: string | null) => ['sync', 'runs', status ?? 'all'] as const,
}
