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

const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const

export interface YearMonth {
  year: number
  month: number
}

/** The calendar month a period covers exactly, or null when it is any other range. */
export function monthOf(period: Period): YearMonth | null {
  const start = parseLocalDate(period.start)
  if (!start || start.day !== 1) return null
  return period.end === lastDayOfMonth(start.year, start.month)
    ? { year: start.year, month: start.month }
    : null
}

function currentMonth(todayISO: string): YearMonth {
  const parts = parseLocalDate(todayISO)
  if (!parts) throw new Error('Invalid reference date.')
  return { year: parts.year, month: parts.month }
}

const monthIndex = ({ year, month }: YearMonth) => year * 12 + month

export function isCurrentMonth(period: Period, todayISO: string): boolean {
  const month = monthOf(period)
  return month !== null && monthIndex(month) === monthIndex(currentMonth(todayISO))
}

/** The selection for a calendar month: a preset when one names it, so URLs stay short. */
export function monthSelection(target: YearMonth, todayISO: string): PeriodSelection {
  const distance = monthIndex(currentMonth(todayISO)) - monthIndex(target)
  if (distance === 0) return { kind: 'current-month' }
  if (distance === 1) return { kind: 'previous-month' }
  return {
    kind: 'custom',
    start: firstDayOfMonth(target.year, target.month),
    end: lastDayOfMonth(target.year, target.month),
  }
}

/**
 * The month one step before the period starts or one step after it ends. Null when the step
 * would go past the current month, which has no data yet.
 */
export function stepMonth(period: Period, delta: -1 | 1, todayISO: string): YearMonth | null {
  const edge = parseLocalDate(delta < 0 ? period.start : period.end)
  if (!edge) return null
  const target = addMonths(edge.year, edge.month, delta)
  return monthIndex(target) > monthIndex(currentMonth(todayISO)) ? null : target
}

/** "setembro" in the year of `todayISO`, "setembro de 2025" in any other. */
export function monthShortLabel(target: YearMonth, todayISO: string): string {
  const name = MONTH_NAMES[target.month - 1]!
  return target.year === currentMonth(todayISO).year ? name : `${name} de ${target.year}`
}

/** "Setembro de 2026" for a calendar month, the date range for anything else. */
export function periodTitle(period: Period): string {
  const month = monthOf(period)
  if (!month) return periodLabel(period)
  const name = MONTH_NAMES[month.month - 1]!
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${month.year}`
}

/** How to name a period in running text: "setembro" or "01/08/2026 – 31/10/2026". */
export function periodInText(period: Period, todayISO: string): string {
  const month = monthOf(period)
  return month ? monthShortLabel(month, todayISO) : periodLabel(period)
}
