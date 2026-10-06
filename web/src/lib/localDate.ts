// A transaction date is a calendar day ("YYYY-MM-DD"), not an instant. It is handled as
// text and integers only, because parsing that string with Date would apply UTC.
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export interface DateParts {
  year: number
  month: number
  day: number
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

export function parseLocalDate(value: string): DateParts | null {
  const match = ISO_DATE_PATTERN.exec(value)
  if (!match) return null
  const year = parseInt(match[1]!, 10)
  const month = parseInt(match[2]!, 10)
  const day = parseInt(match[3]!, 10)
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null
  return { year, month, day }
}

export function isLocalDate(value: string): boolean {
  return parseLocalDate(value) !== null
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0')
}

export function toLocalDate({ year, month, day }: DateParts): string {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`
}

/** dd/MM/yyyy, or the raw value when it is not a valid date. */
export function formatLocalDate(value: string): string {
  const parts = parseLocalDate(value)
  if (!parts) return value
  return `${pad(parts.day, 2)}/${pad(parts.month, 2)}/${pad(parts.year, 4)}`
}

/** Today in the device's time zone. */
export function today(now: Date = new Date()): string {
  return toLocalDate({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() })
}

export function addMonths(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta
  return { year: Math.floor(index / 12), month: (((index % 12) + 12) % 12) + 1 }
}

export function firstDayOfMonth(year: number, month: number): string {
  return toLocalDate({ year, month, day: 1 })
}

export function lastDayOfMonth(year: number, month: number): string {
  return toLocalDate({ year, month, day: daysInMonth(year, month) })
}
