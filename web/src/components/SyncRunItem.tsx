import type { SyncErrorKind, SyncRun, SyncStatus } from '../api/types'
import { formatDateTime, formatDuration } from '../lib/dateTime'

const STATUS: Record<SyncStatus, { label: string; dot: string; text: string }> = {
  running: { label: 'Em andamento', dot: 'bg-warning', text: 'text-ink' },
  succeeded: { label: 'Concluída', dot: 'bg-income', text: 'text-ink' },
  failed: { label: 'Falhou', dot: 'bg-danger', text: 'text-danger' },
}

// Where a failed run went wrong, as classified by the backend from its own sanitized message.
const ERROR_KIND: Record<SyncErrorKind, string> = {
  provider: 'Falha no provedor (Pluggy)',
  network: 'Falha de rede',
  database: 'Falha no banco de dados',
  validation: 'Dados recusados na validação',
  unknown: 'Falha não classificada',
}

// One line of the sync log: when, outcome, counts. The status is a word with a small
// marker beside it, so it never depends on color alone.
export function SyncRunItem({ run }: { run: SyncRun }) {
  const status = STATUS[run.status] ?? STATUS.running
  const counts = [
    ['Contas', run.accounts_received],
    ['Recebidas', run.transactions_received],
    ['Novas', run.transactions_created],
    ['Atualizadas', run.transactions_updated],
  ] as const
  const duration = run.finished_at ? formatDuration(run.started_at, run.finished_at) : null
  const source = run.accounts.length > 0 ? run.accounts.join(', ') : 'Item sem contas importadas'

  return (
    <li className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 border-b border-line py-3 sm:grid-cols-[9rem_8rem_1fr] sm:items-baseline">
      <span className="text-sm font-medium tabular-nums">{formatDateTime(run.started_at)}</span>
      <span className={`flex items-center gap-2 text-sm ${status.text}`}>
        <span aria-hidden className={`size-1.5 rounded-full ${status.dot}`} />
        {status.label}
      </span>
      <dl className="col-span-full grid grid-cols-4 gap-2 sm:col-span-1">
        {counts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-ink-soft">{label}</dt>
            <dd className="text-sm font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="col-span-full truncate text-sm text-ink-soft">
        {source}
        {duration && <span className="tabular-nums"> • Duração: {duration}</span>}
      </p>
      {run.status === 'failed' && (
        <p className="col-span-full text-sm break-words text-danger">
          <span className="block font-semibold">
            {ERROR_KIND[run.error_kind ?? 'unknown'] ?? ERROR_KIND.unknown}
          </span>
          {run.error && <span className="block">{run.error}</span>}
        </p>
      )}
    </li>
  )
}
