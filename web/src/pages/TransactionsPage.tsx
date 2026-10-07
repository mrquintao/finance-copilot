import { useInfiniteQuery } from '@tanstack/react-query'
import { errorMessage } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import { listTransactions } from '../api/transactions'
import type { Transaction, TransactionPage } from '../api/types'
import { Button } from '../components/Button'
import { PageHeader } from '../components/PageHeader'
import { PeriodFilter } from '../components/PeriodFilter'
import { EmptyState } from '../components/states/EmptyState'
import { ErrorState } from '../components/states/ErrorState'
import { LoadingState } from '../components/states/LoadingState'
import { TransactionRow } from '../components/TransactionRow'
import { usePeriod } from '../hooks/usePeriod'

// Offset pagination can repeat a row if data changes between pages; keep the first copy.
function uniqueTransactions(pages: TransactionPage[]): Transaction[] {
  const seen = new Set<string>()
  return pages
    .flatMap((page) => page.items)
    .filter((transaction) => !seen.has(transaction.id) && seen.add(transaction.id))
}

export function TransactionsPage() {
  const { period } = usePeriod()
  const query = useInfiniteQuery({
    queryKey: queryKeys.transactions(period),
    queryFn: ({ pageParam, signal }) => listTransactions(period, pageParam, signal),
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
    <>
      <PageHeader title="Transações" />
      <PeriodFilter />
      {!pages && query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : !pages ? (
        <LoadingState label="Carregando transações…" />
      ) : transactions.length === 0 ? (
        <EmptyState />
      ) : (
        <section aria-labelledby="transactions-count">
          <h2
            id="transactions-count"
            className="mb-2 text-sm font-medium text-slate-500 dark:text-slate-400"
          >
            {total} transações
          </h2>
          <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 dark:divide-slate-800 dark:bg-slate-900 dark:ring-slate-800">
            {transactions.map((transaction) => (
              <TransactionRow key={transaction.id} transaction={transaction} />
            ))}
          </ul>
          {pageError && (
            <p role="alert" className="mt-3 text-center text-sm">
              {errorMessage(query.error)}
            </p>
          )}
          {query.hasNextPage && (
            <Button
              variant="secondary"
              className="mt-3 w-full"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage
                ? 'Carregando…'
                : pageError
                  ? 'Tentar novamente'
                  : 'Carregar mais'}
            </Button>
          )}
        </section>
      )}
    </>
  )
}
