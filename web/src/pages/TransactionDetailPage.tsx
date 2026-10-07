import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useParams } from 'react-router'
import { errorMessage, hasStatus } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import { getTransaction } from '../api/transactions'
import type { Transaction } from '../api/types'
import { EmptyState } from '../components/states/EmptyState'
import { ErrorState } from '../components/states/ErrorState'
import { LoadingState } from '../components/states/LoadingState'
import { formatLocalDate } from '../lib/localDate'
import { formatBRL } from '../lib/money'
import { categoryName, transactionTitle, TYPE_LABELS } from '../lib/transaction'

export function TransactionDetailPage() {
  const { id = '' } = useParams()
  const { search } = useLocation()
  const query = useQuery({
    queryKey: queryKeys.transaction(id),
    queryFn: ({ signal }) => getTransaction(id, signal),
  })
  // 404 = unknown id; 422 = the id in the URL is not a UUID.
  const notFound = hasStatus(query.error, 404, 422)

  return (
    <>
      <Link
        to={{ pathname: '/transactions', search }}
        className="mb-4 inline-flex min-h-11 items-center text-sm font-medium text-teal-700 dark:text-teal-300"
      >
        ← Transações
      </Link>
      {notFound ? (
        <EmptyState
          title="Transação não encontrada"
          message="Volte à lista e atualize os dados."
        />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : !query.data ? (
        <LoadingState label="Carregando transação…" />
      ) : (
        <Detail transaction={query.data} />
      )}
    </>
  )
}

function Detail({ transaction }: { transaction: Transaction }) {
  const details: [string, string][] = [
    ['Data', formatLocalDate(transaction.date)],
    ['Descrição', transaction.description],
    ['Estabelecimento', transaction.merchant ?? 'Não informado'],
    ['Categoria', categoryName(transaction)],
    ['Subcategoria', transaction.subcategory ?? 'Não informada'],
    ['Recorrente', transaction.is_recurring ? 'Sim' : 'Não'],
    ['Moeda', transaction.currency],
  ]
  const account: [string, string][] = [
    ['Nome', transaction.account.name],
    ['Instituição', transaction.account.institution],
  ]

  return (
    <article>
      <header className="mb-6">
        <h1 className="text-xl font-bold break-words">{transactionTitle(transaction)}</h1>
        <p className="mt-1 text-3xl font-semibold tracking-tight break-words tabular-nums">
          {formatBRL(transaction.amount)}
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {TYPE_LABELS[transaction.type]}
        </p>
      </header>
      <FieldList title="Detalhes" fields={details} />
      <FieldList title="Conta" fields={account} />
      {transaction.type === 'transfer' && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Transferência interna: excluída dos totais de gastos e receitas.
        </p>
      )}
    </article>
  )
}

function FieldList({ title, fields }: { title: string; fields: [string, string][] }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-medium text-slate-500 dark:text-slate-400">{title}</h2>
      <dl className="divide-y divide-slate-200 rounded-2xl bg-white ring-1 ring-slate-200 dark:divide-slate-800 dark:bg-slate-900 dark:ring-slate-800">
        {fields.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 px-4 py-3">
            <dt className="shrink-0 text-slate-500 dark:text-slate-400">{label}</dt>
            <dd className="min-w-0 text-right break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
