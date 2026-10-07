import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useParams } from 'react-router'
import { errorMessage, hasStatus } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import { getTransaction } from '../api/transactions'
import type { Transaction } from '../api/types'
import { SectionHeading } from '../components/SectionHeading'
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
    <div className="max-w-2xl">
      <Link
        to={{ pathname: '/transactions', search }}
        className="-ml-1 mb-3 inline-flex min-h-11 items-center px-1 text-sm font-medium text-accent underline-offset-4 hover:underline"
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
    </div>
  )
}

function Detail({ transaction }: { transaction: Transaction }) {
  // What and when first; bookkeeping fields after.
  const details: [string, string][] = [
    ['Data', formatLocalDate(transaction.date)],
    ['Categoria', categoryName(transaction)],
    ['Subcategoria', transaction.subcategory ?? 'Não informada'],
    ['Estabelecimento', transaction.merchant ?? 'Não informado'],
    ['Descrição', transaction.description],
    ['Recorrente', transaction.is_recurring ? 'Sim' : 'Não'],
    ['Moeda', transaction.currency],
  ]
  const account: [string, string][] = [
    ['Nome', transaction.account.name],
    ['Instituição', transaction.account.institution],
  ]

  return (
    <article>
      <header className="border-b border-ink pb-5">
        <p className="label-caps">{TYPE_LABELS[transaction.type]}</p>
        <h1 className="mt-2 text-lg font-semibold break-words">{transactionTitle(transaction)}</h1>
        <p className="mt-1 text-[clamp(1.75rem,8vw,2.25rem)] leading-tight font-semibold tracking-tight break-words tabular-nums">
          {formatBRL(transaction.amount)}
        </p>
        {transaction.type === 'transfer' && (
          <p className="mt-2 text-xs text-ink-soft">
            Transferência interna: excluída dos totais de gastos e receitas.
          </p>
        )}
      </header>
      <FieldList title="Detalhes" fields={details} />
      <FieldList title="Conta" fields={account} />
    </article>
  )
}

function FieldList({ title, fields }: { title: string; fields: [string, string][] }) {
  return (
    <section className="mt-7">
      <SectionHeading>{title}</SectionHeading>
      <dl>
        {fields.map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-6 border-b border-line py-2.5 text-sm"
          >
            <dt className="shrink-0 text-ink-soft">{label}</dt>
            <dd className="min-w-0 text-right font-medium break-words tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
