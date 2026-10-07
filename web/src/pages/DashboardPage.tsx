import { useQuery } from '@tanstack/react-query'
import { getSpendingByCategory, getSpendingSummary } from '../api/analytics'
import { errorMessage } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import type { CategorySpending, SpendingSummary } from '../api/types'
import { CategoryChart } from '../components/CategoryChart'
import { MonthProjection } from '../components/MonthProjection'
import { PageHeader } from '../components/PageHeader'
import { PeriodComparison } from '../components/PeriodComparison'
import { PeriodFilter } from '../components/PeriodFilter'
import { SectionHeading } from '../components/SectionHeading'
import { EmptyState } from '../components/states/EmptyState'
import { ErrorState } from '../components/states/ErrorState'
import { LoadingState } from '../components/states/LoadingState'
import { usePeriod } from '../hooks/usePeriod'
import { formatBRL } from '../lib/money'

export function DashboardPage() {
  const { period, selection } = usePeriod()
  // No placeholderData: while a new period loads, the previous period's numbers are not shown.
  const summary = useQuery({
    queryKey: queryKeys.summary(period),
    queryFn: ({ signal }) => getSpendingSummary(period, signal),
  })
  const categories = useQuery({
    queryKey: queryKeys.byCategory(period),
    queryFn: ({ signal }) => getSpendingByCategory(period, signal),
  })
  // A failed background refetch keeps the data already on screen for this period.
  const error = (!summary.data && summary.error) || (!categories.data && categories.error)

  return (
    <>
      <PageHeader title="Resumo" />
      <PeriodFilter />
      {error ? (
        <ErrorState
          message={errorMessage(error)}
          onRetry={() => {
            if (summary.isError) void summary.refetch()
            if (categories.isError) void categories.refetch()
          }}
        />
      ) : !summary.data || !categories.data ? (
        <LoadingState label="Carregando resumo…" />
      ) : summary.data.transaction_count === 0 ? (
        <EmptyState />
      ) : (
        <>
          <Dashboard summary={summary.data} categories={categories.data.items} />
          {/* The projection is about the month in progress, so it follows that preset. */}
          {selection.kind === 'current-month' && <MonthProjection />}
          <PeriodComparison period={period} />
        </>
      )}
    </>
  )
}

function Dashboard({
  summary,
  categories,
}: {
  summary: SpendingSummary
  categories: CategorySpending[]
}) {
  return (
    <>
      {/* Spending is the headline figure; income and activity read as the lines beside it. */}
      <section
        aria-label="Totais do período"
        className="grid gap-x-12 gap-y-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:items-end"
      >
        <div>
          <h2 className="label-caps">Gastos</h2>
          <p className="mt-2 text-[clamp(1.875rem,9vw,2.625rem)] leading-none font-semibold tracking-tight break-words tabular-nums">
            {formatBRL(summary.total_spending)}
          </p>
        </div>
        <dl className="border-t border-line-strong">
          <div className="flex items-baseline justify-between gap-4 border-b border-line py-2.5">
            <dt className="text-sm text-ink-soft">Receitas</dt>
            <dd className="text-lg font-semibold break-words tabular-nums">
              {formatBRL(summary.total_income)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-b border-line py-2.5">
            <dt className="text-sm text-ink-soft">
              Transações
              <span className="block text-xs">
                {summary.expense_count} despesas • {summary.income_count} receitas
              </span>
            </dt>
            <dd className="text-lg font-semibold tabular-nums">{summary.transaction_count}</dd>
          </div>
        </dl>
      </section>
      {summary.transfer_count > 0 && (
        <p className="mt-3 text-xs text-ink-soft">
          Transferências entre contas não entram nos gastos ou nas receitas.
        </p>
      )}

      <section className="mt-10">
        <SectionHeading>Gastos por categoria</SectionHeading>
        {categories.length === 0 ? (
          <EmptyState
            title="Nenhuma despesa"
            message="Este período contém apenas receitas ou transferências."
          />
        ) : (
          <div className="grid gap-x-12 gap-y-6 pt-4 lg:grid-cols-2">
            <CategoryChart items={categories} />
            <table className="w-full self-start text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-ink-soft">
                  <th scope="col" className="pb-2 text-left font-medium">
                    Categoria
                  </th>
                  <th scope="col" className="pb-2 text-right font-medium">
                    Despesas
                  </th>
                  <th scope="col" className="pb-2 text-right font-medium">
                    Valor
                  </th>
                </tr>
              </thead>
              <tbody>
                {categories.map((item) => (
                  <tr key={item.category_id ?? 'uncategorized'} className="border-b border-line">
                    <th scope="row" className="w-full max-w-0 truncate py-2 pr-3 text-left font-normal">
                      {item.category}
                    </th>
                    <td className="py-2 pr-3 text-right text-ink-soft tabular-nums">
                      {item.transaction_count}
                    </td>
                    <td className="py-2 text-right font-medium whitespace-nowrap tabular-nums">
                      {formatBRL(item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
