import type { CopilotFact, TransactionsLink } from '../api/types'
import { formatBRL, formatPercentChange, formatSignedBRL } from './money'

/** The Transactions screen with the same filters as the query behind a fact. */
export function transactionsHref(link: TransactionsLink): string {
  const params = new URLSearchParams({ start: link.start_date, end: link.end_date })
  if (link.q) params.set('q', link.q)
  if (link.category_id) params.set('category', link.category_id)
  if (link.type) params.set('type', link.type)
  return `/transactions?${params.toString()}`
}

const COUNT = /^-?\d+$/

/** Formats a calculated value for display. Money stays a decimal string throughout. */
export function formatFact(fact: CopilotFact): string {
  switch (fact.kind) {
    case 'money':
      return formatBRL(fact.value)
    case 'signed_money':
      return formatSignedBRL(fact.value)
    case 'percent':
      return formatPercentChange(fact.value)
    case 'signed_count': {
      if (!COUNT.test(fact.value)) return '—'
      if (/^-?0+$/.test(fact.value)) return '0'
      return fact.value.startsWith('-') ? `−${fact.value.slice(1)}` : `+${fact.value}`
    }
    default:
      return COUNT.test(fact.value) ? fact.value : '—'
  }
}
