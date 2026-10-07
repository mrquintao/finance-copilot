import { useQuery } from '@tanstack/react-query'
import { getPeriodComparison } from '../api/analytics'
import { queryKeys } from '../api/queryKeys'
import type { CountChange, MoneyChange } from '../api/types'
import { formatLocalDate } from '../lib/localDate'
import { formatBRL, formatPercentChange, formatSignedBRL } from '../lib/money'
import type { Period } from '../lib/period'
import { SectionHeading } from './SectionHeading'

const TOP_CATEGORIES = 5

// A percentage only exists when there is something to divide by. The absolute change is always
// shown, so a missing base never hides the movement.
function variation(change: string, percent: string | null): string {
  return `${change} (${percent === null ? 'sem base anterior' : formatPercentChange(percent)})`
}

function moneyVariation(metric: MoneyChange): string {
  if (metric.direction === 'equal') return 'Sem variação'
  return variation(formatSignedBRL(metric.change), metric.percent_change)
}

function countVariation(metric: CountChange): string {
  if (metric.direction === 'equal') return 'Sem variação'
  const sign = metric.change > 0 ? '+' : '−'
  return variation(`${sign}${Math.abs(metric.change)}`, metric.percent_change)
}

function Row({ label, previous, change }: { label: string; previous: string; change: string }) {
  return (
    <li className="grid grid-cols-[1fr_auto] items-baseline gap-x-6 border-b border-line py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm">{label}</p>
        <p className="text-xs text-ink-soft tabular-nums">Antes: {previous}</p>
      </div>
      <p className="text-right text-sm font-medium tabular-nums">{change}</p>
    </li>
  )
}

/** How this period moved against the equivalent one before it. Numbers come from the API. */
export function PeriodComparison({ period }: { period: Period }) {
  const query = useQuery({
    queryKey: queryKeys.comparison(period),
    queryFn: ({ signal }) => getPeriodComparison(period, signal),
  })

  // The comparison is secondary: while it loads or if it fails, the rest of the summary stays.
  if (query.isError && !query.data) {
    return (
      <section className="mt-10">
        <SectionHeading>Comparação com o período anterior</SectionHeading>
        <p className="py-4 text-sm text-ink-soft">Não foi possível carregar a comparação.</p>
      </section>
    )
  }
  if (!query.data) return null

  const { previous_period, spending, income, transaction_count, categories } = query.data
  const moved = categories.filter((item) => item.direction !== 'equal').slice(0, TOP_CATEGORIES)

  return (
    <section className="mt-10">
      <SectionHeading>Comparação com o período anterior</SectionHeading>
      <p className="pt-3 text-xs text-ink-soft">
        Em relação a{' '}
        <span className="tabular-nums">
          {formatLocalDate(previous_period.start_date)} – {formatLocalDate(previous_period.end_date)}
        </span>
        .
      </p>
      <div className="grid gap-x-12 lg:grid-cols-2">
        <ul aria-label="Totais comparados">
          <Row label="Gastos" previous={formatBRL(spending.previous)} change={moneyVariation(spending)} />
          <Row label="Receitas" previous={formatBRL(income.previous)} change={moneyVariation(income)} />
          <Row
            label="Transações"
            previous={String(transaction_count.previous)}
            change={countVariation(transaction_count)}
          />
        </ul>
        {moved.length > 0 && (
          <ul aria-label="Categorias que mais variaram">
            {moved.map((item) => (
              <Row
                key={item.category_id ?? 'uncategorized'}
                label={item.category}
                previous={formatBRL(item.previous)}
                change={moneyVariation(item)}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
