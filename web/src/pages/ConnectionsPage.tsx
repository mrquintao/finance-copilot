import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { errorMessage, hasStatus } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import { createConnectToken, listSyncRuns, refreshConnections, syncItem } from '../api/sync'
import type { SyncRun } from '../api/types'
import { Button } from '../components/Button'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/states/EmptyState'
import { ErrorState } from '../components/states/ErrorState'
import { LoadingState } from '../components/states/LoadingState'
import { SyncRunItem } from '../components/SyncRunItem'
import { openPluggyConnect } from '../lib/pluggyConnect'

function syncError(error: unknown): string {
  if (hasStatus(error, 503)) {
    return 'Open Finance não está configurado no backend (PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET).'
  }
  return errorMessage(error)
}

function summarize(runs: SyncRun[]): string {
  if (runs.some((run) => run.status === 'failed')) {
    return 'A sincronização falhou. Veja o histórico abaixo.'
  }
  const created = runs.reduce((sum, run) => sum + run.transactions_created, 0)
  const updated = runs.reduce((sum, run) => sum + run.transactions_updated, 0)
  return `Sincronização concluída: ${created} novas e ${updated} atualizadas.`
}

export function ConnectionsPage() {
  const queryClient = useQueryClient()
  const [message, setMessage] = useState<string | null>(null)
  const runs = useQuery({
    queryKey: queryKeys.syncRuns(),
    queryFn: ({ signal }) => listSyncRuns(signal),
  })

  // A sync changes transactions and analytics too, and a failed one still records a run.
  const onSettled = () => queryClient.invalidateQueries()

  const connect = useMutation({
    mutationFn: async () => {
      setMessage('Gerando sessão segura…')
      const { connect_token } = await createConnectToken()
      setMessage('Aguardando a conexão com a instituição…')
      const itemId = await openPluggyConnect(connect_token)
      if (!itemId) return null
      setMessage('Conta conectada. Importando transações…')
      return syncItem({ item_id: itemId })
    },
    onSuccess: (run) =>
      setMessage(run ? summarize([run]) : 'A conexão não foi concluída. Tente novamente.'),
    onError: (error) => setMessage(syncError(error)),
    onSettled,
  })

  const refresh = useMutation({
    mutationFn: () => {
      setMessage('Sincronizando…')
      return refreshConnections()
    },
    onSuccess: ({ items }) =>
      setMessage(items.length === 0 ? 'Nenhuma instituição conectada ainda.' : summarize(items)),
    onError: (error) => setMessage(syncError(error)),
    onSettled,
  })

  const busy = connect.isPending || refresh.isPending

  return (
    <>
      <PageHeader title="Conexões" />
      <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        <h2 className="font-semibold">Open Finance</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Conecte sua instituição financeira de forma segura. As credenciais do banco são tratadas
          pelo provedor e não passam pelo Finance Copilot.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Button disabled={busy} onClick={() => connect.mutate()}>
            Conectar instituição
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => refresh.mutate()}>
            Sincronizar novamente
          </Button>
        </div>
        {message && (
          <p role="status" className="mt-4 text-sm">
            {message}
          </p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Histórico de sincronizações</h2>
        {!runs.data && runs.isError ? (
          <ErrorState message={errorMessage(runs.error)} onRetry={() => void runs.refetch()} />
        ) : !runs.data ? (
          <LoadingState label="Carregando histórico…" />
        ) : runs.data.items.length === 0 ? (
          <EmptyState
            title="Nenhuma sincronização"
            message="Conecte uma instituição para importar contas e transações."
          />
        ) : (
          <ul className="divide-y divide-slate-200 rounded-2xl bg-white ring-1 ring-slate-200 dark:divide-slate-800 dark:bg-slate-900 dark:ring-slate-800">
            {runs.data.items.map((run) => (
              <SyncRunItem key={run.id} run={run} />
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
