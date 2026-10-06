interface StatCardProps {
  label: string
  value: string
  hint?: string
  className?: string
}

export function StatCard({ label, value, hint, className = '' }: StatCardProps) {
  return (
    <div
      className={`rounded-2xl bg-white p-4 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 ${className}`}
    >
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight break-words tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  )
}
