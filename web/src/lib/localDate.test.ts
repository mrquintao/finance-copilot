import { describe, expect, it } from 'vitest'
import {
  addMonths,
  daysInMonth,
  firstDayOfMonth,
  formatLocalDate,
  isLocalDate,
  lastDayOfMonth,
  parseLocalDate,
  today,
} from './localDate'

describe('parseLocalDate', () => {
  it('reads the calendar day as written', () => {
    expect(parseLocalDate('2026-09-07')).toEqual({ year: 2026, month: 9, day: 7 })
    expect(parseLocalDate('2026-01-01')).toEqual({ year: 2026, month: 1, day: 1 })
    expect(parseLocalDate('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 })
  })

  it('rejects malformed and impossible dates', () => {
    for (const value of [
      '',
      '2026-9-7',
      '07/09/2026',
      '2026-09-07T00:00:00Z',
      '2026-13-01',
      '2026-00-10',
      '2026-02-29',
      '2026-04-31',
      '2026-09-00',
    ]) {
      expect(isLocalDate(value)).toBe(false)
    }
  })
})

describe('formatLocalDate', () => {
  it('formats as dd/MM/yyyy without shifting the day', () => {
    // The first and last days of a month are where a UTC conversion would show.
    expect(formatLocalDate('2026-09-01')).toBe('01/09/2026')
    expect(formatLocalDate('2026-09-30')).toBe('30/09/2026')
    expect(formatLocalDate('2026-01-01')).toBe('01/01/2026')
    expect(formatLocalDate('2025-12-31')).toBe('31/12/2025')
  })

  it('returns invalid input unchanged', () => {
    expect(formatLocalDate('not-a-date')).toBe('not-a-date')
  })
})

describe('today', () => {
  it('uses the local calendar day, including right around midnight', () => {
    expect(today(new Date(2026, 9, 6, 12, 0))).toBe('2026-10-06')
    expect(today(new Date(2026, 0, 1, 0, 0, 1))).toBe('2026-01-01')
    expect(today(new Date(2026, 8, 30, 23, 59, 59))).toBe('2026-09-30')
  })
})

describe('month arithmetic', () => {
  it('knows month lengths and leap years', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2024, 2)).toBe(29)
    expect(daysInMonth(1900, 2)).toBe(28)
    expect(daysInMonth(2000, 2)).toBe(29)
    expect(daysInMonth(2026, 4)).toBe(30)
    expect(daysInMonth(2026, 12)).toBe(31)
  })

  it('adds months across year boundaries', () => {
    expect(addMonths(2026, 10, -1)).toEqual({ year: 2026, month: 9 })
    expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 })
    expect(addMonths(2026, 1, -2)).toEqual({ year: 2025, month: 11 })
    expect(addMonths(2026, 12, 1)).toEqual({ year: 2027, month: 1 })
  })

  it('builds month bounds', () => {
    expect(firstDayOfMonth(2026, 9)).toBe('2026-09-01')
    expect(lastDayOfMonth(2026, 9)).toBe('2026-09-30')
    expect(lastDayOfMonth(2024, 2)).toBe('2024-02-29')
  })
})
