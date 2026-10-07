import type { Transaction, TransactionType } from '../api/types'

export const TYPE_LABELS: Record<TransactionType, string> = {
  debit: 'Despesa',
  credit: 'Receita',
  transfer: 'Transferência',
}

export function transactionTitle(transaction: Transaction): string {
  return transaction.merchant ?? transaction.description
}

export function categoryName(transaction: Transaction): string {
  return transaction.category?.name ?? 'Sem categoria'
}
