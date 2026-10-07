import { Link, useLocation } from 'react-router'
import type { Transaction, TransactionType } from '../api/types'
import { formatLocalDate } from '../lib/localDate'
import { formatBRL } from '../lib/money'
import { categoryName, transactionTitle, TYPE_LABELS } from '../lib/transaction'

// Expenses are the default reading and stay in plain ink. Income gets the one semantic
// tone, transfers recede; the type label under the amount says the same thing in words.
const AMOUNT_TONE: Record<TransactionType, string> = {
  debit: 'text-ink',
  credit: 'text-income',
  transfer: 'text-ink-soft',
}

export function TransactionRow({ transaction }: { transaction: Transaction }) {
  const { search } = useLocation()

  return (
    <li className="border-b border-line">
      <Link
        to={{ pathname: `/transactions/${transaction.id}`, search }}
        className="-mx-4 flex items-baseline justify-between gap-4 px-4 py-3 transition-colors hover:bg-surface active:bg-brand-soft md:-mx-3 md:px-3"
      >
        <span className="min-w-0">
          <span className="block truncate text-[0.9375rem] font-medium">
            {transactionTitle(transaction)}
          </span>
          <span className="mt-0.5 block truncate text-[0.8125rem] text-ink-soft tabular-nums">
            {formatLocalDate(transaction.date)} • {categoryName(transaction)}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span
            className={`block text-[0.9375rem] font-semibold tabular-nums ${AMOUNT_TONE[transaction.type]}`}
          >
            {formatBRL(transaction.amount)}
          </span>
          <span className="mt-0.5 block text-[0.8125rem] text-ink-soft">
            {TYPE_LABELS[transaction.type]}
          </span>
        </span>
      </Link>
    </li>
  )
}
