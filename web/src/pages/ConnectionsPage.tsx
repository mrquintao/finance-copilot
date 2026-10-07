import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError, errorMessage, hasStatus } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import { createConnectToken, listSyncRuns, refreshConnections, syncItem } from '../api/sync'
import type { SyncRun, SyncStatus } from '../api/types'
import { Button } from '../components/Button'
import { PageHeader } from '../components/PageHeader'
import { SectionHeading } from '../components/SectionHeading'
import { Spinner } from '../components/Spinner'
import { EmptyState } from '../components/states/EmptyState'
import { ErrorState } from '../components/states/ErrorState'
import { LoadingState } from '../components/states/LoadingState'
import { SyncRunItem } from '../components/SyncRunItem'
import { openPluggyConnect } from '../lib/pluggyConnect'

type Tone = 'progress' | 'success' | 'neutral' | 'error'

interface Message {
  tone: Tone
  text: string
}

const TONES: Record<Tone, string> = {
  progress: 'border-line-strong text-ink-soft',
  success: 'border-income text-ink',
  neutral: 'border-line-strong text-ink',
  error: 'border-danger text-danger',
}

const HISTORY_FILTERS: { label: string; status: SyncStatus | null }[] = [
  { label: 'Todas', status: null },
  { label: 'Concluídas', status: 'succeeded' },
  { label: 'Falhas', status: 'failed' },
]

function syncError(error: unknown): Message {
  const text = hasStatus(error, 503)
    ? 'A integração com a Pluggy não está configurada no backend (PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET).'
    : errorMessage(error)
  return { tone: 'error', text }
}

// A failure before any item exists: no token, or the widget reported an error.
function connectError(error: unknown): Message {
  // Not configured and backend unreachable have a more useful explanation of their own.
  if (hasStatus(error, 503) || (error instanceof ApiError && error.status === null)) {
    return syncError(error)
  }
  return { tone: 'error', text: 'Não foi possível conectar ao MeuPluggy. Tente novamente.' }
}

function summarize(runs: SyncRun[]): Message {
  if (runs.some((run) => run.status === 'failed')) {
    return { tone: 'error', text: 'A sincronização falhou. Veja o histórico abaixo.' }
  }
  const created = runs.reduce((sum, run) => sum + run.transactions_created, 0)
  const updated = runs.reduce((sum, run) => sum + run.transactions_updated, 0)
  return {
    tone: 'success',
    text: `Sincronização concluída: ${created} novas e ${updated} atualizadas.`,
  }
}

export function ConnectionsPage() {
  const queryClient = useQueryClient()
  const [message, setMessage] = useState<Message | null>(null)
  const progress = (text: string) => setMessage({ tone: 'progress', text })
  const [statusFilter, setStatusFilter] = useState<SyncStatus | null>(null)
  const runs = useQuery({
    queryKey: queryKeys.syncRuns(statusFilter),
    queryFn: ({ signal }) => listSyncRuns(statusFilter, signal),
  })

  // A sync changes transactions and analytics too, and a failed one still records a run.
  const onSettled = () => queryClient.invalidateQueries()

  const connect = useMutation({
    // Three different outcomes that must not be confused: the user gave up, the connection
    // itself failed, or MeuPluggy was connected and only the import failed.
    mutationFn: async (): Promise<Message> => {
      let itemId: string | null
      try {
        progress('Gerando sessão segura…')
        const { connect_token } = await createConnectToken()
        progress('Aguardando a conexão com o MeuPluggy…')
        itemId = await openPluggyConnect(connect_token)
      } catch (error) {
        return connectError(error)
      }
      if (!itemId) {
        return { tone: 'neutral', text: 'A conexão não foi concluída. Tente novamente.' }
      }

      progress('MeuPluggy conectado. Importando contas e transações…')
      try {
        const run = await syncItem({ item_id: itemId })
        if (run.status === 'succeeded') {
          return {
            tone: 'success',
            text: `MeuPluggy conectado e dados sincronizados: ${run.transactions_created} novas e ${run.transactions_updated} atualizadas.`,
          }
        }
      } catch {
        // Falls through: the backend already knows the item, so "sync again" can retry it.
      }
      return {
        tone: 'error',
        text: 'MeuPluggy foi conectado, mas não foi possível importar os dados agora. Tente sincronizar novamente.',
      }
    },
    onSuccess: setMessage,
    onSettled,
  })

  const refresh = useMutation({
    mutationFn: () => {
      progress('Sincronizando…')
      return refreshConnections()
    },
    onSuccess: ({ items }) =>
      setMessage(
        items.length === 0
          ? { tone: 'neutral', text: 'Nenhuma conta MeuPluggy conectada ainda.' }
          : summarize(items),
      ),
    onError: (error) => setMessage(syncError(error)),
    onSettled,
  })

  const busy = connect.isPending || refresh.isPending

  return (
    <div className="max-w-3xl">
      <PageHeader title="Conexões" />
      <section>
        <h2 className="text-base font-semibold">MeuPluggy</h2>
        <p className="mt-1 max-w-xl text-sm text-ink-soft">
          O Finance Copilot não se conecta diretamente aos bancos. Ele importa, pela Pluggy, as
          contas e transações das instituições que você já conectou na sua conta MeuPluggy.
        </p>
        <p className="mt-2 max-w-xl text-sm text-ink-soft">
          O login é feito na janela do MeuPluggy; suas senhas não passam pelo Finance Copilot.
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Button disabled={busy} onClick={() => connect.mutate()}>
            Conectar com MeuPluggy
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => refresh.mutate()}>
            Sincronizar novamente
          </Button>
        </div>
        {message && (
          <p
            role="status"
            className={`mt-5 flex items-center gap-2.5 border-l-2 py-0.5 pl-3 text-sm ${TONES[message.tone]}`}
          >
            {message.tone === 'progress' && <Spinner />}
            <span>{message.text}</span>
          </p>
        )}
      </section>

      <section className="mt-10">
        <SectionHeading>Histórico de sincronizações</SectionHeading>
        <div
          role="group"
          aria-label="Filtrar histórico"
          className="mt-4 inline-flex gap-px overflow-hidden rounded-ctl border border-line-strong bg-line-strong"
        >
          {HISTORY_FILTERS.map((option) => {
            const active = statusFilter === option.status
            return (
              <button
                key={option.label}
                type="button"
                aria-pressed={active}
                onClick={() => setStatusFilter(option.status)}
                className={`min-h-10 px-3 text-[0.8125rem] transition-colors ${
                  active
                    ? 'bg-brand-soft font-semibold text-accent'
                    : 'bg-raised font-medium text-ink-soft hover:text-ink'
                }`}
              >
                {option.label}
              </button>
            )
          })}
        </div>
        {!runs.data && runs.isError ? (
          <ErrorState message={errorMessage(runs.error)} onRetry={() => void runs.refetch()} />
        ) : !runs.data ? (
          <LoadingState label="Carregando histórico…" />
        ) : runs.data.items.length === 0 && statusFilter ? (
          <EmptyState
            title="Nenhuma sincronização neste filtro"
            message="Não há execuções com esse status entre as 50 mais recentes."
          />
        ) : runs.data.items.length === 0 ? (
          <EmptyState
            title="Nenhuma sincronização"
            message="Conecte sua conta MeuPluggy para importar contas e transações."
          />
        ) : (
          <ul>
            {runs.data.items.map((run) => (
              <SyncRunItem key={run.id} run={run} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
