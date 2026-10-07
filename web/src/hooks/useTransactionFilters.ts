import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import type { TransactionType } from '../api/types'

export interface TransactionFilters {
  q: string
  accountId: string
  categoryId: string
  type: TransactionType | ''
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TYPES: readonly string[] = ['debit', 'credit', 'transfer']
// URL parameter for each filter. The period keeps its own parameters (see usePeriod).
const PARAMS = { q: 'q', accountId: 'account', categoryId: 'category', type: 'type' } as const

function uuid(value: string | null): string {
  return value && UUID_PATTERN.test(value) ? value : ''
}

/** Transaction filters live in the URL, next to the period; invalid values are ignored. */
export function useTransactionFilters(): {
  filters: TransactionFilters
  active: boolean
  setFilters: (changes: Partial<TransactionFilters>) => void
  clearFilters: () => void
} {
  const [params, setParams] = useSearchParams()
  const key = params.toString()

  const filters = useMemo<TransactionFilters>(() => {
    const current = new URLSearchParams(key)
    const type = current.get(PARAMS.type) ?? ''
    return {
      q: (current.get(PARAMS.q) ?? '').trim().slice(0, 100),
      accountId: uuid(current.get(PARAMS.accountId)),
      categoryId: uuid(current.get(PARAMS.categoryId)),
      type: TYPES.includes(type) ? (type as TransactionType) : '',
    }
  }, [key])

  const setFilters = useCallback(
    (changes: Partial<TransactionFilters>) =>
      setParams((previous) => {
        const next = new URLSearchParams(previous)
        for (const [name, value] of Object.entries(changes)) {
          const param = PARAMS[name as keyof TransactionFilters]
          const text = value.trim()
          if (text) next.set(param, text)
          else next.delete(param)
        }
        return next
      }),
    [setParams],
  )

  const clearFilters = useCallback(
    () =>
      setParams((previous) => {
        const next = new URLSearchParams(previous)
        for (const param of Object.values(PARAMS)) next.delete(param)
        return next
      }),
    [setParams],
  )

  const active = Object.values(filters).some((value) => value !== '')
  return { filters, active, setFilters, clearFilters }
}
