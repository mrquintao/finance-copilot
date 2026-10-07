import type { ReactNode } from 'react'

interface EmptyStateProps {
  title?: string
  message?: string
  children?: ReactNode
}

export function EmptyState({
  title = 'Nenhuma transação',
  message = 'Não há transações neste período. Escolha outro período.',
  children,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">{message}</p>
      {children}
    </div>
  )
}
