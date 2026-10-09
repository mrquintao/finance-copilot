import { useQuery } from '@tanstack/react-query'
import { getInsights } from '../api/analytics'
import { queryKeys } from '../api/queryKeys'
import type { Insight } from '../api/types'
import { formatBRL, formatPercentChange } from '../lib/money'
import type { Period } from '../lib/period'
import { SectionHeading } from './SectionHeading'

const MAX_SHOWN = 3

// Magnitudes are cut from the backend's own strings; nothing is recomputed here.
const unsigned = (value: string) => value.replace(/^-/, '')

function size(insight: Insight): string {
  const amount = formatBRL(unsigned(insight.change))
  if (insight.percent_change === null) return amount
  return `${amount} (${formatPercentChange(unsigned(insight.percent_change)).replace('+', '')})`
}

function sentence(insight: Insight): string {
  const up = insight.direction === 'up'
  const fromTo = `de ${formatBRL(insight.previous)} para ${formatBRL(insight.current)}`
  switch (insight.kind) {
    case 'spending_change':
      return `Os gastos ${up ? 'subiram' : 'caíram'} ${size(insight)}, ${fromTo}.`
    case 'income_change':
      return `As receitas ${up ? 'subiram' : 'caíram'} ${size(insight)}, ${fromTo}.`
    case 'recurring_growth':
      return `Os gastos recorrentes subiram ${size(insight)}, ${fromTo}.`
    case 'largest_category_change':
      return `${insight.category} foi a categoria que mais variou: ${up ? 'subiu' : 'caiu'} ${size(insight)}, ${fromTo}.`
    case 'category_increase':
    case 'category_decrease':
      return `${insight.category} ${up ? 'subiu' : 'caiu'} ${size(insight)}, ${fromTo}.`
  }
}

// The largest mover is also listed as an increase or decrease when it passes the thresholds;
// say it once.
function distinct(items: Insight[]): Insight[] {
  const moved = new Set(
    items
      .filter((item) => item.kind === 'category_increase' || item.kind === 'category_decrease')
      .map((item) => item.category_id),
  )
  return items.filter(
    (item) => item.kind !== 'largest_category_change' || !moved.has(item.category_id),
  )
}

/**
 * What changed against the previous period, in sentences. Written from fixed rules in the
 * backend, not by a model. Secondary to the summary: it shows nothing while loading or on
 * failure.
 */
export function Insights({ period }: { period: Period }) {
  const query = useQuery({
    queryKey: queryKeys.insights(period),
    queryFn: ({ signal }) => getInsights(period, signal),
  })
  const items = distinct(query.data?.items ?? []).slice(0, MAX_SHOWN)
  if (items.length === 0) return null

  return (
    <section aria-labelledby="insights-heading" className="mt-8">
      <SectionHeading id="insights-heading" aside="Regras fixas, sem IA">
        O que mudou
      </SectionHeading>
      <ul className="grid gap-2 pt-4">
        {items.map((item) => (
          <li
            key={`${item.kind}-${item.category_id ?? 'total'}`}
            className="max-w-[70ch] text-base tabular-nums"
          >
            {sentence(item)}
          </li>
        ))}
      </ul>
    </section>
  )
}
