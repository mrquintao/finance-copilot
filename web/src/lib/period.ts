import {
  addMonths,
  firstDayOfMonth,
  formatLocalDate,
  isLocalDate,
  lastDayOfMonth,
  parseLocalDate,
} from './localDate'

/** Inclusive bounds, both YYYY-MM-DD. */
export interface Period {
  start: string
  end: string
}

export type PresetId = 'current-month' | 'previous-month' | 'last-3-months'

export type PeriodSelection = { kind: PresetId } | { kind: 'custom'; start: string; end: string }

export const PRESETS: readonly { id: PresetId; label: string }[] = [
  { id: 'current-month', label: 'Mês atual' },
  { id: 'previous-month', label: 'Mês anterior' },
  { id: 'last-3-months', label: 'Últimos 3 meses' },
]

export const DEFAULT_SELECTION: PeriodSelection = { kind: 'current-month' }

/** The URL parameters that carry the period. */
export const PERIOD_PARAMS = ['period', 'start', 'end'] as const

/** A query string with only the period, for links to screens that share nothing else. */
export function periodSearch(search: string): string {
  const current = new URLSearchParams(search)
  const kept = new URLSearchParams()
  for (const name of PERIOD_PARAMS) {
    const value = current.get(name)
    if (value !== null) kept.set(name, value)
  }
  const text = kept.toString()
  return text ? `?${text}` : ''
}

function isPresetId(value: string | null): value is PresetId {
  return PRESETS.some((preset) => preset.id === value)
}

/** ISO dates sort lexicographically, so string comparison is a date comparison. */
export function isValidPeriod(start: string, end: string): boolean {
  return isLocalDate(start) && isLocalDate(end) && start <= end
}

export function resolvePreset(id: PresetId, todayISO: string): Period {
  const parts = parseLocalDate(todayISO)
  if (!parts) throw new Error('Invalid reference date.')
  const { year, month } = parts
  switch (id) {
    case 'current-month':
      return { start: firstDayOfMonth(year, month), end: lastDayOfMonth(year, month) }
    case 'previous-month': {
      const previous = addMonths(year, month, -1)
      return {
        start: firstDayOfMonth(previous.year, previous.month),
        end: lastDayOfMonth(previous.year, previous.month),
      }
    }
    case 'last-3-months': {
      // Current month plus the two full months before it.
      const first = addMonths(year, month, -2)
      return { start: firstDayOfMonth(first.year, first.month), end: lastDayOfMonth(year, month) }
    }
  }
}

export function resolveSelection(selection: PeriodSelection, todayISO: string): Period {
  if (selection.kind === 'custom') return { start: selection.start, end: selection.end }
  return resolvePreset(selection.kind, todayISO)
}

/** Reads ?period=<preset> or ?start=&end=; anything invalid falls back to the default. */
export function parseSelection(params: URLSearchParams): PeriodSelection {
  const preset = params.get('period')
  if (isPresetId(preset)) return { kind: preset }
  const start = params.get('start')
  const end = params.get('end')
  if (start && end && isValidPeriod(start, end)) return { kind: 'custom', start, end }
  return DEFAULT_SELECTION
}

export function selectionToParams(selection: PeriodSelection): Record<string, string> {
  if (selection.kind === 'custom') return { start: selection.start, end: selection.end }
  return { period: selection.kind }
}

export function periodLabel(period: Period): string {
  return `${formatLocalDate(period.start)} – ${formatLocalDate(period.end)}`
}
