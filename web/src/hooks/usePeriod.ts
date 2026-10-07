import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { today } from '../lib/localDate'
import {
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
    (next: PeriodSelection) => setParams(selectionToParams(next)),
    [setParams],
  )

  return { selection, period, setSelection }
}
