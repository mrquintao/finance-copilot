import type { ReactNode } from 'react'

interface EmptyStateProps {
  title?: string
  message?: string
  children?: ReactNode
}

export function EmptyState({
  title = 'Nenhuma transação',
  message = 'Não há transações neste período. Escolha outro período ou sincronize suas contas.',
  children,
}: EmptyStateProps) {
  return (
    <div className="py-10">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-ink-soft">{message}</p>
      {children}
    </div>
  )
}
