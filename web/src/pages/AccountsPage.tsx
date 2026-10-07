import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { listAccounts } from '../api/accounts'
import { errorMessage } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import type { AccountSummary, ConnectionState } from '../api/types'
import { PageHeader } from '../components/PageHeader'
import { SectionHeading } from '../components/SectionHeading'
import { EmptyState } from '../components/states/EmptyState'
import { ErrorState } from '../components/states/ErrorState'
import { LoadingState } from '../components/states/LoadingState'
import { formatDateTime } from '../lib/dateTime'
import { formatLocalDate } from '../lib/localDate'

// The state is always a word; the dot beside it only reinforces it.
const CONNECTION: Record<ConnectionState, { label: string; dot: string; text: string }> = {
  connected: { label: 'Sincronizada', dot: 'bg-income', text: 'text-ink' },
  failing: { label: 'Última sincronização falhou', dot: 'bg-danger', text: 'text-danger' },
  syncing: { label: 'Sincronizando', dot: 'bg-warning', text: 'text-ink' },
  never_synced: { label: 'Nunca sincronizada', dot: 'bg-ink-muted', text: 'text-ink-soft' },
  local: { label: 'Conta local', dot: 'bg-ink-muted', text: 'text-ink-soft' },
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

export function AccountsPage() {
  const query = useQuery({
    queryKey: queryKeys.accounts(),
    queryFn: ({ signal }) => listAccounts(signal),
  })

  return (
    <div className="max-w-3xl">
      <PageHeader title="Contas" />
      {!query.data && query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : !query.data ? (
        <LoadingState label="Carregando contas…" />
      ) : query.data.total === 0 ? (
        <EmptyState
          title="Nenhuma conta"
          message="As contas aparecem aqui depois que você conecta o MeuPluggy e a primeira sincronização termina."
        >
          <Link
            to="/connections"
            className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-accent underline-offset-4 hover:underline"
          >
            Ir para Conexões
          </Link>
        </EmptyState>
      ) : (
        <>
          <p className="mb-6 text-sm text-ink-soft">
            {plural(query.data.total, 'conta', 'contas')} em{' '}
            {plural(query.data.groups.length, 'origem', 'origens')}.
          </p>
          {query.data.groups.map((group) => (
            <section key={group.institution} className="mb-8" aria-label={group.institution}>
              <SectionHeading>{group.institution}</SectionHeading>
              <ul>
                {group.accounts.map((account) => (
                  <AccountRow key={account.id} account={account} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  )
}

function AccountRow({ account }: { account: AccountSummary }) {
  const connection = CONNECTION[account.connection] ?? CONNECTION.local
  const details = [
    account.currency,
    plural(account.transaction_count, 'transação', 'transações'),
    account.last_transaction_date
      ? `última em ${formatLocalDate(account.last_transaction_date)}`
      : null,
  ].filter(Boolean)

  return (
    <li className="grid gap-x-6 gap-y-1 border-b border-line py-3 sm:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <p className="truncate text-[0.9375rem] font-medium">{account.name}</p>
        <p className="mt-0.5 text-[0.8125rem] text-ink-soft tabular-nums">{details.join(' • ')}</p>
      </div>
      <div className="sm:text-right">
        <p className={`flex items-center gap-2 text-sm sm:justify-end ${connection.text}`}>
          <span aria-hidden className={`size-1.5 rounded-full ${connection.dot}`} />
          {connection.label}
        </p>
        {account.last_successful_sync_at && (
          <p className="mt-0.5 text-[0.8125rem] text-ink-soft tabular-nums">
            Dados de {formatDateTime(account.last_successful_sync_at)}
          </p>
        )}
      </div>
    </li>
  )
}
