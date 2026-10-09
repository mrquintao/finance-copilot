import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import {
  getPeriodComparison,
  getSpendingByCategory,
  getSpendingSummary,
} from '../api/analytics'
import { errorMessage } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import type { PeriodComparison, SpendingSummary } from '../api/types'
import { CategoryBreakdown } from '../components/CategoryBreakdown'
import { DirectionArrow } from '../components/DirectionArrow'
import { Insights } from '../components/Insights'
import { MonthProjection } from '../components/MonthProjection'
import { PageHeader } from '../components/PageHeader'
import { PeriodFilter } from '../components/PeriodFilter'
import { RecentTransactions } from '../components/RecentTransactions'
import { SectionHeading } from '../components/SectionHeading'
import { EmptyState } from '../components/states/EmptyState'
import { ErrorState } from '../components/states/ErrorState'
import { LoadingState } from '../components/states/LoadingState'
import { usePeriod } from '../hooks/usePeriod'
import { countVariation, moneyVariation } from '../lib/comparison'
import { formatLocalDate, today } from '../lib/localDate'
import { formatBRL } from '../lib/money'
import { isCurrentMonth, monthOf, periodInText, type Period } from '../lib/period'

export function DashboardPage() {
  const { period } = usePeriod()
  const todayISO = today()
  // No placeholderData: while a new period loads, the previous period's numbers are not shown.
  const summary = useQuery({
    queryKey: queryKeys.summary(period),
    queryFn: ({ signal }) => getSpendingSummary(period, signal),
  })
  const categories = useQuery({
    queryKey: queryKeys.byCategory(period),
    queryFn: ({ signal }) => getSpendingByCategory(period, signal),
  })
  const hasTransactions = (summary.data?.transaction_count ?? 0) > 0
  // Secondary: the summary never waits for it, and an empty period does not ask for it.
  const comparison = useQuery({
    queryKey: queryKeys.comparison(period),
    queryFn: ({ signal }) => getPeriodComparison(period, signal),
    enabled: hasTransactions,
  })
  // A failed background refetch keeps the data already on screen for this period.
  const error = (!summary.data && summary.error) || (!categories.data && categories.error)
  const changes = comparison.data ?? null
  const previous = changes && {
    start: changes.previous_period.start_date,
    end: changes.previous_period.end_date,
  }

  return (
    <>
      <PageHeader title="Resumo">
        <PeriodFilter />
      </PageHeader>
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
      ) : !hasTransactions ? (
        <EmptyState>
          <Link
            to="/connections"
            className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-accent underline-offset-4 hover:underline"
          >
            Conectar ou sincronizar contas
          </Link>
        </EmptyState>
      ) : (
        <div className="min-[86rem]:grid min-[86rem]:grid-cols-[minmax(0,1fr)_21rem] min-[86rem]:gap-x-12">
          <div className="min-w-0 min-[86rem]:col-span-2">
            <Totals
              summary={summary.data}
              period={period}
              comparison={changes}
              comparisonFailed={comparison.isError && !changes}
              previousLabel={previous ? periodInText(previous, todayISO) : null}
            />
          </div>

          <section className="mt-8 min-w-0 min-[86rem]:col-start-1">
            <SectionHeading
              aside={
                previous && (
                  <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden className="h-2.5 w-5 rounded-bar bg-ink-soft" />
                      {periodInText(period, todayISO)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="hatch h-2 w-5 rounded-bar border border-current text-ink-soft"
                      />
                      {periodInText(previous, todayISO)}, na mesma escala
                    </span>
                  </p>
                )
              }
            >
              Gastos por categoria
            </SectionHeading>
            {categories.data.items.length === 0 ? (
              <EmptyState
                title="Nenhuma despesa"
                message="Este período contém apenas receitas ou transferências."
              />
            ) : (
              <CategoryBreakdown
                items={categories.data.items}
                changes={changes?.categories ?? null}
              />
            )}
          </section>
          <div className="min-w-0 min-[86rem]:col-start-1">
            <Insights period={period} />
            {/* The projection is about the month in progress. */}
            {isCurrentMonth(period, todayISO) && <MonthProjection />}
          </div>
          <aside className="mt-10 min-w-0 min-[86rem]:col-start-2 min-[86rem]:row-span-2 min-[86rem]:row-start-2 min-[86rem]:mt-8">
            <RecentTransactions period={period} />
          </aside>
        </div>
      )}
    </>
  )
}

/**
 * The headline amount. Read as one value ("R$ 3.649,94"); drawn like a price sign: currency
 * small, integer as large as the column allows, cents raised and underlined.
 */
function Figure({ amount }: { amount: string }) {
  const text = formatBRL(amount)
  const match = /^(R\$)\s(.+?)(,\d{2})$/.exec(text)
  return (
    <p className="figure mt-2 text-figure text-headline tabular-nums">
      <span className="sr-only">{text}</span>
      <span aria-hidden className="flex flex-wrap items-start">
        {match ? (
          <>
            <span className="figure-unit">{match[1]}</span>
            {match[2]}
            <span className="figure-cents">{match[3]}</span>
          </>
        ) : (
          text
        )}
      </span>
    </p>
  )
}

const total = 'border-b border-line py-3 sm:border-b-0 sm:border-l sm:py-0 sm:pl-5 sm:first:border-l-0 sm:first:pl-0'

/**
 * Spending is the headline figure and states where it comes from; income, activity and the
 * change against the previous period read as the lines under it.
 */
function Totals({
  summary,
  period,
  comparison,
  comparisonFailed,
  previousLabel,
}: {
  summary: SpendingSummary
  period: Period
  comparison: PeriodComparison | null
  comparisonFailed: boolean
  previousLabel: string | null
}) {
  const expenses = `${summary.expense_count} ${summary.expense_count === 1 ? 'despesa' : 'despesas'}`
  const incomes = `${summary.income_count} ${summary.income_count === 1 ? 'receita' : 'receitas'}`

  return (
    <section aria-labelledby="spending-heading" className="@container">
      <h2 id="spending-heading" className="section-label">
        {monthOf(period) ? 'Gastos do mês' : 'Gastos do período'}
      </h2>
      <Figure amount={summary.total_spending} />
      {/* Provenance: a checked figure says what it is the sum of. */}
      <p className="mt-4 border-y border-headline py-2 text-xs font-bold tracking-[0.04em] text-headline uppercase">
        Soma dos débitos · {formatLocalDate(period.start)} a {formatLocalDate(period.end)} ·{' '}
        {expenses} · calculado pelo aplicativo
      </p>

      <ul
        aria-label={comparison ? 'Totais comparados' : 'Totais do período'}
        className="mt-5 grid gap-x-5 sm:grid-cols-3"
      >
        {comparison ? (
          <li className={total}>
            <p className="section-label">Gastos sobre {previousLabel}</p>
            <p className="money mt-1 flex items-center gap-1.5 text-lg font-extrabold">
              <DirectionArrow direction={comparison.spending.direction} />
              {moneyVariation(comparison.spending)}
            </p>
            <p className="mt-0.5 text-xs text-ink-soft tabular-nums">
              Antes: {formatBRL(comparison.spending.previous)}
            </p>
          </li>
        ) : comparisonFailed ? (
          <li className={total}>
            <p className="text-sm text-ink-soft">Não foi possível carregar a comparação.</p>
          </li>
        ) : (
          <li aria-hidden className="hidden sm:block" />
        )}
        <li className={total}>
          <p className="section-label">Receitas</p>
          <p className="money mt-1 text-lg font-extrabold break-words">
            {formatBRL(summary.total_income)}
          </p>
          {comparison && (
            <p className="mt-0.5 text-xs text-ink-soft tabular-nums">
              <span className="text-ink">{moneyVariation(comparison.income)}</span>
              <span className="ml-2 inline-block">
                Antes: {formatBRL(comparison.income.previous)}
              </span>
            </p>
          )}
        </li>
        <li className={total}>
          <p className="section-label">Transações</p>
          <p className="money mt-1 text-lg font-extrabold">{summary.transaction_count}</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            {expenses} • {incomes}
          </p>
          {comparison && (
            <p className="mt-0.5 text-xs text-ink-soft tabular-nums">
              <span className="text-ink">{countVariation(comparison.transaction_count)}</span>
              <span className="ml-2 inline-block">
                Antes: {comparison.transaction_count.previous}
              </span>
            </p>
          )}
        </li>
      </ul>
      {summary.transfer_count > 0 && (
        <p className="mt-4 text-xs text-ink-soft">
          Transferências entre contas não entram nos gastos ou nas receitas.
        </p>
      )}
    </section>
  )
}
