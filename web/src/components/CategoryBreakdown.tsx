import type { CSSProperties } from 'react'
import { Link, useLocation } from 'react-router'
import type { CategoryChange, CategorySpending } from '../api/types'
import { useCategoryInk } from '../hooks/useCategoryInk'
import { barScale } from '../lib/barScale'
import { moneyVariation } from '../lib/comparison'
import { formatBRL } from '../lib/money'
import { periodSearch } from '../lib/period'
import { DirectionArrow } from './DirectionArrow'

interface Row {
  id: string | null
  name: string
  amount: string
  count: number | null
  change: CategoryChange | null
}

const keyOf = (id: string | null) => id ?? 'uncategorized'

function width(value: number, max: number): string {
  if (value <= 0 || max <= 0) return '0%'
  return `${Math.max((value / max) * 100, 0.75)}%`
}

function buildRows(items: CategorySpending[], changes: CategoryChange[] | null): Row[] {
  const byKey = new Map((changes ?? []).map((change) => [keyOf(change.category_id), change]))
  const rows: Row[] = items.map((item) => ({
    id: item.category_id,
    name: item.category,
    amount: item.amount,
    count: item.transaction_count,
    change: byKey.get(keyOf(item.category_id)) ?? null,
  }))
  // A category with spending before and none now is still part of what changed.
  const listed = new Set(items.map((item) => keyOf(item.category_id)))
  for (const change of changes ?? []) {
    if (listed.has(keyOf(change.category_id))) continue
    rows.push({
      id: change.category_id,
      name: change.category,
      amount: change.current,
      count: null,
      change,
    })
  }
  return rows
}

const layout =
  'grid grid-cols-[0.75rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 py-3 @2xl:py-2 @2xl:grid-cols-[0.75rem_8.5rem_minmax(0,1fr)_7.5rem_10.5rem] @2xl:gap-x-4'

/**
 * One list answers "on what" and "what changed": each category with its ink, this period's
 * bar (solid), the previous period's on the same scale (hatched), the value and the change.
 */
export function CategoryBreakdown({
  items,
  changes,
}: {
  items: CategorySpending[]
  /** Null while the comparison is loading or when it failed; the list then shows no change. */
  changes: CategoryChange[] | null
}) {
  const { search } = useLocation()
  const inkOf = useCategoryInk()
  const rows = buildRows(items, changes)
  const max = Math.max(
    0,
    ...rows.flatMap((row) => [barScale(row.amount), barScale(row.change?.previous)]),
  )

  return (
    <ul aria-label="Gastos por categoria" className="@container">
      {rows.map((row) => {
        const content = (
          <>
            <span
              aria-hidden
              className="size-3 rounded-bar bg-[var(--ink-of-category)]"
              style={{ '--ink-of-category': inkOf(row.id) } as CSSProperties}
            />
            <span className="flex min-w-0 items-baseline gap-2 @2xl:block">
              <span className="block truncate font-semibold">{row.name}</span>
              {row.count !== null && (
                <span className="shrink-0 text-xs text-ink-soft tabular-nums @2xl:block">
                  {row.count} {row.count === 1 ? 'despesa' : 'despesas'}
                </span>
              )}
            </span>
            <span
              aria-hidden
              className="col-span-3 row-start-2 grid gap-1 text-[var(--ink-of-category)] @2xl:col-span-1 @2xl:col-start-3 @2xl:row-start-1"
              style={{ '--ink-of-category': inkOf(row.id) } as CSSProperties}
            >
              <span
                className="block h-2.5 rounded-r-bar bg-current"
                style={{ width: width(barScale(row.amount), max) }}
              />
              {row.change && (
                <span
                  className="hatch block h-2 rounded-r-bar border border-l-0 border-current"
                  style={{ width: width(barScale(row.change.previous), max) }}
                />
              )}
            </span>
            <span className="money col-start-3 row-start-1 text-right text-lg font-extrabold whitespace-nowrap @2xl:col-start-4">
              {formatBRL(row.amount)}
            </span>
            {row.change && (
              <span className="col-span-3 row-start-3 text-sm @2xl:col-span-1 @2xl:col-start-5 @2xl:row-start-1 @2xl:text-right">
                <span
                  className={
                    row.change.direction === 'equal'
                      ? 'text-ink-soft'
                      : 'money inline-flex items-center gap-1 font-bold'
                  }
                >
                  <DirectionArrow direction={row.change.direction} />
                  {moneyVariation(row.change)}
                </span>
                <span className="ml-2 text-xs text-ink-soft tabular-nums @2xl:ml-0 @2xl:block">
                  Antes: {formatBRL(row.change.previous)}
                </span>
              </span>
            )}
          </>
        )

        // "Sem categoria" has no filter to link to.
        if (row.id === null) {
          return (
            <li key={keyOf(row.id)} className={`border-b border-line ${layout}`}>
              {content}
            </li>
          )
        }
        const params = new URLSearchParams(periodSearch(search))
        params.set('category', row.id)
        params.set('type', 'debit')
        return (
          <li key={row.id} className="border-b border-line">
            <Link
              to={{ pathname: '/transactions', search: `?${params.toString()}` }}
              className={`-mx-3 px-3 transition-colors hover:bg-surface active:bg-brand-soft ${layout}`}
            >
              {content}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
