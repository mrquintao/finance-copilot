import type { CountChange, MoneyChange } from '../api/types'
import { formatPercentChange, formatSignedBRL } from './money'

// A percentage only exists when there is something to divide by. The absolute change is always
// shown, so a missing base never hides the movement.
function variation(change: string, percent: string | null): string {
  return `${change} (${percent === null ? 'sem base anterior' : formatPercentChange(percent)})`
}

export function moneyVariation(metric: MoneyChange): string {
  if (metric.direction === 'equal') return 'Sem variação'
  return variation(formatSignedBRL(metric.change), metric.percent_change)
}

export function countVariation(metric: CountChange): string {
  if (metric.direction === 'equal') return 'Sem variação'
  const sign = metric.change > 0 ? '+' : '−'
  return variation(`${sign}${Math.abs(metric.change)}`, metric.percent_change)
}
