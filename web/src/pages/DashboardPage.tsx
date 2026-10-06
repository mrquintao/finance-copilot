import { useQuery } from '@tanstack/react-query'
import { getSpendingByCategory, getSpendingSummary } from '../api/analytics'
import { errorMessage } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import type { CategorySpending, SpendingSummary } from '../api/types'
import { CategoryChart } from '../components/CategoryChart'
import { PageHeader } from '../components/PageHeader'
import { PeriodFilter } from '../components/PeriodFilter'
import { StatCard } from '../components/StatCard'
import { EmptyState } from '../components/states/EmptyState'
import { ErrorState } from '../components/states/ErrorState'
import { LoadingState } from '../components/states/LoadingState'
import { usePeriod } from '../hooks/usePeriod'
import { formatBRL } from '../lib/money'

export function DashboardPage() {
  const { period } = usePeriod()
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
        <Dashboard summary={summary.data} categories={categories.data.items} />
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          label="Gastos"
          value={formatBRL(summary.total_spending)}
          className="col-span-2 sm:col-span-1"
        />
        <StatCard label="Receitas" value={formatBRL(summary.total_income)} />
        <StatCard
          label="Transações"
          value={String(summary.transaction_count)}
          hint={`${summary.expense_count} despesas • ${summary.income_count} receitas`}
        />
      </div>
      {summary.transfer_count > 0 && (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Transferências entre contas não entram nos gastos ou nas receitas.
        </p>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Gastos por categoria</h2>
        {categories.length === 0 ? (
          <EmptyState
            title="Nenhuma despesa"
            message="Este período contém apenas receitas ou transferências."
          />
        ) : (
          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            <CategoryChart items={categories} />
            <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
              {categories.map((item) => (
                <li
                  key={item.category_id ?? 'uncategorized'}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <span className="min-w-0">
                    <span className="block truncate">{item.category}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      {item.transaction_count} despesas
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">{formatBRL(item.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </>
  )
}
