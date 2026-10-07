import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { listAccounts } from '../api/accounts'
import { listCategories } from '../api/categories'
import { queryKeys } from '../api/queryKeys'
import type { TransactionType } from '../api/types'
import { useTransactionFilters } from '../hooks/useTransactionFilters'
import { TYPE_LABELS } from '../lib/transaction'
import { Button } from './Button'

const control =
  'mt-1 block min-h-11 w-full rounded-ctl border border-line-strong bg-raised px-3 text-base'
const label = 'text-xs font-medium text-ink-soft'

export function TransactionFilters() {
  const { filters, active, setFilters, clearFilters } = useTransactionFilters()
  // The options are a convenience: if they fail to load, the other filters still work.
  const accounts = useQuery({
    queryKey: queryKeys.accounts(),
    queryFn: ({ signal }) => listAccounts(signal),
  })
  const categories = useQuery({
    queryKey: queryKeys.categories(),
    queryFn: ({ signal }) => listCategories(signal),
  })

  return (
    <section aria-label="Filtros" className="mb-7">
      {/* Remounting on an external change (back button, "clear") resets the typed text. */}
      <SearchBox key={filters.q} value={filters.q} onSearch={(q) => setFilters({ q })} />
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className={label}>
          Conta
          <select
            className={control}
            value={filters.accountId}
            onChange={(event) => setFilters({ accountId: event.target.value })}
          >
            <option value="">Todas</option>
            {accounts.data?.groups.map((group) => (
              <optgroup key={group.institution} label={group.institution}>
                {group.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className={label}>
          Categoria
          <select
            className={control}
            value={filters.categoryId}
            onChange={(event) => setFilters({ categoryId: event.target.value })}
          >
            <option value="">Todas</option>
            {categories.data?.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className={`${label} col-span-2 sm:col-span-1`}>
          Tipo
          <select
            className={control}
            value={filters.type}
            onChange={(event) => setFilters({ type: event.target.value as TransactionType | '' })}
          >
            <option value="">Todos</option>
            {Object.entries(TYPE_LABELS).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </label>
      </div>
      {active && (
        <Button variant="ghost" className="-ml-4 mt-1" onClick={clearFilters}>
          Limpar filtros
        </Button>
      )}
    </section>
  )
}

function SearchBox({ value, onSearch }: { value: string; onSearch: (text: string) => void }) {
  const [text, setText] = useState(value)

  function submit(event: FormEvent) {
    event.preventDefault()
    onSearch(text)
  }

  return (
    <form role="search" onSubmit={submit} className="flex items-end gap-3">
      <label className={`${label} min-w-0 flex-1`}>
        Buscar por descrição ou estabelecimento
        <input
          type="search"
          maxLength={100}
          enterKeyHint="search"
          className={control}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <Button type="submit" variant="secondary">
        Buscar
      </Button>
    </form>
  )
}
