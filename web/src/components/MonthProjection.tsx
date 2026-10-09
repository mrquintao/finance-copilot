import { useQuery } from '@tanstack/react-query'
import { getMonthProjection } from '../api/analytics'
import { queryKeys } from '../api/queryKeys'
import { formatLocalDate, today } from '../lib/localDate'
import { barScale } from '../lib/barScale'
import { formatBRL } from '../lib/money'
import { SectionHeading } from './SectionHeading'

function Premise({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-line py-2.5 text-sm">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </div>
  )
}

const days = (count: number) => `${count} ${count === 1 ? 'dia' : 'dias'}`

// Bar scale only: how much of the projected total is already spent. Never shown as a number.
function spentShare(spent: string, total: string): number {
  const whole = barScale(total)
  return whole > 0 ? Math.min(barScale(spent) / whole, 1) : 0
}

/**
 * Month-end projection for the current month. Every number comes from the API; this only
 * says, in words, which figures the estimate was built from. What is already spent is drawn
 * solid and the estimated remainder hatched.
 */
export function MonthProjection() {
  const asOf = today()
  const query = useQuery({
    queryKey: queryKeys.projection(asOf),
    queryFn: ({ signal }) => getMonthProjection(asOf, signal),
  })

  // Secondary to the summary: it does not block or replace it while loading or on failure.
  if (query.isError && !query.data) {
    return (
      <section className="mt-8">
        <SectionHeading>Projeção de fechamento do mês</SectionHeading>
        <p className="py-4 text-sm text-ink-soft">Não foi possível carregar a projeção.</p>
      </section>
    )
  }
  if (!query.data) return null

  const projection = query.data
  const hasRecurring = projection.recurring_basis !== null
  const share = spentShare(projection.spent_so_far, projection.projected_total)

  return (
    <section className="mt-8">
      <SectionHeading aside="Estimativa">Projeção de fechamento do mês</SectionHeading>
      <div className="grid gap-x-12 gap-y-4 pt-4 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div>
          <p className="section-label">
            Gasto projetado até {formatLocalDate(projection.month.end_date)}
          </p>
          <p className="money mt-1 text-3xl font-extrabold break-words">
            {formatBRL(projection.projected_total)}
          </p>
          <div aria-hidden className="mt-4 flex h-3 text-accent">
            <span className="block rounded-l-bar bg-current" style={{ width: `${share * 100}%` }} />
            <span className="hatch block flex-1 rounded-r-bar border border-l-0 border-current" />
          </div>
          <p className="mt-3 max-w-md text-sm text-ink-soft">
            É uma estimativa, não um valor garantido: supõe que o gasto variável mantenha a média
            diária dos {days(projection.days_elapsed)} já decorridos nos{' '}
            {days(projection.days_remaining)} restantes.
          </p>
        </div>
        <details open className="group">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-accent [&::-webkit-details-marker]:hidden">
            <svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              className="transition-transform group-open:rotate-90"
            >
              <path d="m9 5 7 7-7 7" />
            </svg>
            De onde vem a estimativa
          </summary>
          <dl className="border-t border-line-strong">
            <Premise
              label={`Gasto até ${formatLocalDate(projection.as_of)}`}
              value={formatBRL(projection.spent_so_far)}
            />
            <Premise
              label="Média diária do gasto variável"
              value={formatBRL(projection.variable_daily_average)}
            />
            <Premise
              label="Gasto variável projetado"
              value={formatBRL(projection.projected_variable)}
            />
            {hasRecurring ? (
              <Premise
                label="Recorrentes ainda esperados (base: mês anterior)"
                value={formatBRL(projection.recurring_remaining)}
              />
            ) : (
              <Premise label="Gastos recorrentes" value="Nenhum marcado" />
            )}
          </dl>
        </details>
      </div>
    </section>
  )
}
