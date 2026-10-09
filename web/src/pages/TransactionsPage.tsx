import { useInfiniteQuery } from '@tanstack/react-query'
import { errorMessage } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import { listTransactions } from '../api/transactions'
import type { Transaction, TransactionPage } from '../api/types'
import { Button } from '../components/Button'
import { PageHeader } from '../components/PageHeader'
import { PeriodFilter } from '../components/PeriodFilter'
import { TransactionFilters } from '../components/TransactionFilters'
import { SectionHeading } from '../components/SectionHeading'
import { EmptyState } from '../components/states/EmptyState'
import { ErrorState } from '../components/states/ErrorState'
import { LoadingState } from '../components/states/LoadingState'
import { TransactionRow } from '../components/TransactionRow'
import { usePeriod } from '../hooks/usePeriod'
import { useTransactionFilters } from '../hooks/useTransactionFilters'

// Offset pagination can repeat a row if data changes between pages; keep the first copy.
function uniqueTransactions(pages: TransactionPage[]): Transaction[] {
  const seen = new Set<string>()
  return pages
    .flatMap((page) => page.items)
    .filter((transaction) => !seen.has(transaction.id) && seen.add(transaction.id))
}

export function TransactionsPage() {
  const { period } = usePeriod()
  const { filters, active, clearFilters } = useTransactionFilters()
  const query = useInfiniteQuery({
    queryKey: queryKeys.transactions(period, filters),
    queryFn: ({ pageParam, signal }) => listTransactions(period, filters, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (last) => {
      const next = last.offset + last.items.length
      return last.items.length > 0 && next < last.total ? next : undefined
    },
  })

  const pages = query.data?.pages
  const transactions = pages ? uniqueTransactions(pages) : []
  const total = pages?.at(-1)?.total ?? 0
  const pageError = query.isFetchNextPageError

  return (
    <div className="max-w-3xl">
      <PageHeader title="Transações">
        <PeriodFilter />
      </PageHeader>
      <TransactionFilters />
      {!pages && query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : !pages ? (
        <LoadingState label="Carregando transações…" />
      ) : transactions.length === 0 && active ? (
        <EmptyState
          title="Nenhuma transação encontrada"
          message="Nenhuma transação deste período corresponde aos filtros."
        >
          <Button variant="secondary" className="mt-4" onClick={clearFilters}>
            Limpar filtros
          </Button>
        </EmptyState>
      ) : transactions.length === 0 ? (
        <EmptyState />
      ) : (
        <section aria-labelledby="transactions-count">
          <SectionHeading id="transactions-count">{total} transações</SectionHeading>
          <ul>
            {transactions.map((transaction) => (
              <TransactionRow key={transaction.id} transaction={transaction} />
            ))}
          </ul>
          {pageError && (
            <p role="alert" className="mt-4 border-l-2 border-danger pl-3 text-sm">
              {errorMessage(query.error)}
            </p>
          )}
          {query.hasNextPage && (
            <div className="mt-4 flex items-center justify-between gap-4">
              <p className="text-sm text-ink-soft tabular-nums">
                {transactions.length} de {total}
              </p>
              <Button
                variant="secondary"
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                {query.isFetchingNextPage
                  ? 'Carregando…'
                  : pageError
                    ? 'Tentar novamente'
                    : 'Carregar mais'}
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
