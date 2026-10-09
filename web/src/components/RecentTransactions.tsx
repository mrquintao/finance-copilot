import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router'
import { queryKeys } from '../api/queryKeys'
import { listTransactions } from '../api/transactions'
import type { TransactionFilters } from '../hooks/useTransactionFilters'
import { periodSearch, type Period } from '../lib/period'
import { SectionHeading } from './SectionHeading'
import { TransactionRow } from './TransactionRow'

const SHOWN = 5
const NO_FILTERS: TransactionFilters = { q: '', accountId: '', categoryId: '', type: '' }

/** The newest transactions of the period. Secondary: nothing is shown while loading or on failure. */
export function RecentTransactions({ period }: { period: Period }) {
  const { search } = useLocation()
  const query = useQuery({
    queryKey: queryKeys.recentTransactions(period),
    queryFn: ({ signal }) => listTransactions(period, NO_FILTERS, 0, signal, SHOWN),
  })
  const items = query.data?.items ?? []
  if (items.length === 0) return null

  return (
    <section>
      <SectionHeading
        aside={
          <Link
            to={{ pathname: '/transactions', search: periodSearch(search) }}
            className="inline-flex min-h-11 items-center font-medium text-accent underline-offset-4 hover:underline"
          >
            Ver todas
          </Link>
        }
      >
        Últimas transações
      </SectionHeading>
      <ul>
        {items.map((transaction) => (
          <TransactionRow key={transaction.id} transaction={transaction} />
        ))}
      </ul>
    </section>
  )
}
