import type { SyncRun, SyncStatus } from '../api/types'
import { formatDateTime } from '../lib/dateTime'

const STATUS: Record<SyncStatus, { label: string; dot: string; text: string }> = {
  running: { label: 'Em andamento', dot: 'bg-warning', text: 'text-ink' },
  succeeded: { label: 'Concluída', dot: 'bg-income', text: 'text-ink' },
  failed: { label: 'Falhou', dot: 'bg-danger', text: 'text-danger' },
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
      {run.error && <p className="col-span-full text-[0.8125rem] break-words text-danger">{run.error}</p>}
    </li>
  )
}
