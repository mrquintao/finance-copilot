import { useQuery } from '@tanstack/react-query'
import { getMonthProjection } from '../api/analytics'
import { queryKeys } from '../api/queryKeys'
import { formatLocalDate, today } from '../lib/localDate'
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

/**
 * Month-end projection for the current month. Every number comes from the API; this only
 * says, in words, which figures the estimate was built from.
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
      <section className="mt-10">
        <SectionHeading>Projeção de fechamento do mês</SectionHeading>
        <p className="py-4 text-sm text-ink-soft">Não foi possível carregar a projeção.</p>
      </section>
    )
  }
  if (!query.data) return null

  const projection = query.data
  const hasRecurring = projection.recurring_basis !== null

  return (
    <section className="mt-10">
      <SectionHeading>Projeção de fechamento do mês</SectionHeading>
      <div className="grid gap-x-12 gap-y-4 pt-4 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div>
          <p className="label-caps">Gasto projetado até {formatLocalDate(projection.month.end_date)}</p>
          <p className="mt-2 text-3xl leading-none font-semibold tracking-tight break-words tabular-nums">
            {formatBRL(projection.projected_total)}
          </p>
          <p className="mt-3 max-w-md text-xs text-ink-soft">
            É uma estimativa, não um valor garantido: supõe que o gasto variável mantenha a média
            diária dos {projection.days_elapsed} dia(s) já decorridos nos {projection.days_remaining}{' '}
            dia(s) restantes.
          </p>
        </div>
        <dl className="border-t border-line-strong">
          <Premise
            label={`Gasto até ${formatLocalDate(projection.as_of)}`}
            value={formatBRL(projection.spent_so_far)}
          />
          <Premise
            label="Média diária do gasto variável"
            value={formatBRL(projection.variable_daily_average)}
          />
          <Premise label="Gasto variável projetado" value={formatBRL(projection.projected_variable)} />
          {hasRecurring ? (
            <Premise
              label="Recorrentes ainda esperados (base: mês anterior)"
              value={formatBRL(projection.recurring_remaining)}
            />
          ) : (
            <Premise label="Gastos recorrentes" value="Nenhum marcado" />
          )}
        </dl>
      </div>
    </section>
  )
}
