import { Link, useLocation } from 'react-router'
import type { Transaction } from '../api/types'
import { formatLocalDate } from '../lib/localDate'
import { formatBRL } from '../lib/money'
import { categoryName, transactionTitle, TYPE_LABELS } from '../lib/transaction'

export function TransactionRow({ transaction }: { transaction: Transaction }) {
  const { search } = useLocation()

  return (
    <li>
      <Link
        to={{ pathname: `/transactions/${transaction.id}`, search }}
        className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">{transactionTitle(transaction)}</span>
          <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
            {formatLocalDate(transaction.date)} • {categoryName(transaction)}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block tabular-nums">{formatBRL(transaction.amount)}</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">
            {TYPE_LABELS[transaction.type]}
          </span>
        </span>
      </Link>
    </li>
  )
}
