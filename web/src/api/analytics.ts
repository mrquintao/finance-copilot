import type { Period } from '../lib/period'
import { request } from './client'
import type {
  MonthProjection,
  PeriodComparison,
  SpendingByCategory,
  SpendingSummary,
} from './types'

const periodQuery = (period: Period) => ({ start_date: period.start, end_date: period.end })

export function getSpendingSummary(period: Period, signal?: AbortSignal): Promise<SpendingSummary> {
  return request('/analytics/spending-summary', { query: periodQuery(period), signal })
}

export function getSpendingByCategory(
  period: Period,
  signal?: AbortSignal,
): Promise<SpendingByCategory> {
  return request('/analytics/spending-by-category', { query: periodQuery(period), signal })
}

export function getPeriodComparison(period: Period, signal?: AbortSignal): Promise<PeriodComparison> {
  return request('/analytics/period-comparison', { query: periodQuery(period), signal })
}

/** `asOf` is the user's local date: the backend never guesses "today". */
export function getMonthProjection(asOf: string, signal?: AbortSignal): Promise<MonthProjection> {
  return request('/analytics/month-projection', { query: { as_of: asOf }, signal })
}
