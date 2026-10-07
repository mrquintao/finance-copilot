import type { SyncRun, SyncStatus } from '../api/types'
import { formatDateTime } from '../lib/dateTime'

const STATUS: Record<SyncStatus, { label: string; className: string }> = {
  running: {
    label: 'Em andamento',
    className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
  succeeded: {
    label: 'Concluída',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  },
  failed: {
    label: 'Falhou',
    className: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  },
}

export function SyncRunItem({ run }: { run: SyncRun }) {
  const status = STATUS[run.status] ?? STATUS.running
  const counts = [
    ['Contas', run.accounts_received],
    ['Recebidas', run.transactions_received],
    ['Novas', run.transactions_created],
    ['Atualizadas', run.transactions_updated],
  ] as const

  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium tabular-nums">{formatDateTime(run.started_at)}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.className}`}>
          {status.label}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-4 gap-2 text-center">
        {counts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
            <dd className="text-sm font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {run.error && (
        <p className="mt-2 text-xs break-words text-red-700 dark:text-red-400">{run.error}</p>
      )}
    </li>
  )
}
