import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { today } from '../lib/localDate'
import {
  PERIOD_PARAMS,
  parseSelection,
  resolveSelection,
  selectionToParams,
  type Period,
  type PeriodSelection,
} from '../lib/period'

/** The selected period lives in the URL, so it is shared across screens and links. */
export function usePeriod(): {
  selection: PeriodSelection
  period: Period
  setSelection: (selection: PeriodSelection) => void
} {
  const [params, setParams] = useSearchParams()
  const todayISO = today()
  const key = params.toString()

  const { selection, period } = useMemo(() => {
    const parsed = parseSelection(new URLSearchParams(key))
    return { selection: parsed, period: resolveSelection(parsed, todayISO) }
  }, [key, todayISO])

  const setSelection = useCallback(
    (next: PeriodSelection) =>
      setParams((previous) => {
        // Replace only the period; other parameters (transaction filters) stay.
        const params = new URLSearchParams(previous)
        for (const name of PERIOD_PARAMS) params.delete(name)
        for (const [name, value] of Object.entries(selectionToParams(next))) {
          params.set(name, value)
        }
        return params
      }),
    [setParams],
  )

  return { selection, period, setSelection }
}
