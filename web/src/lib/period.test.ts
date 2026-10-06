import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SELECTION,
  isValidPeriod,
  parseSelection,
  periodLabel,
  resolvePreset,
  resolveSelection,
  selectionToParams,
} from './period'

describe('resolvePreset', () => {
  it('resolves each preset from today', () => {
    expect(resolvePreset('current-month', '2026-10-06')).toEqual({
      start: '2026-10-01',
      end: '2026-10-31',
    })
    expect(resolvePreset('previous-month', '2026-10-06')).toEqual({
      start: '2026-09-01',
      end: '2026-09-30',
    })
    expect(resolvePreset('last-3-months', '2026-10-06')).toEqual({
      start: '2026-08-01',
      end: '2026-10-31',
    })
  })

  it('crosses the year boundary', () => {
    expect(resolvePreset('previous-month', '2026-01-15')).toEqual({
      start: '2025-12-01',
      end: '2025-12-31',
    })
    expect(resolvePreset('last-3-months', '2026-01-15')).toEqual({
      start: '2025-11-01',
      end: '2026-01-31',
    })
  })

  it('handles February in leap and common years', () => {
    expect(resolvePreset('previous-month', '2024-03-31')).toEqual({
      start: '2024-02-01',
      end: '2024-02-29',
    })
    expect(resolvePreset('current-month', '2026-02-10')).toEqual({
      start: '2026-02-01',
      end: '2026-02-28',
    })
  })
})

describe('isValidPeriod', () => {
  it('accepts ordered and single-day ranges', () => {
    expect(isValidPeriod('2026-09-01', '2026-09-30')).toBe(true)
    expect(isValidPeriod('2026-09-15', '2026-09-15')).toBe(true)
  })

  it('rejects inverted ranges and invalid dates', () => {
    expect(isValidPeriod('2026-09-30', '2026-09-01')).toBe(false)
    expect(isValidPeriod('', '2026-09-01')).toBe(false)
    expect(isValidPeriod('2026-02-30', '2026-03-01')).toBe(false)
  })
})

describe('URL round trip', () => {
  const parse = (search: string) => parseSelection(new URLSearchParams(search))

  it('defaults to the current month', () => {
    expect(parse('')).toEqual(DEFAULT_SELECTION)
    expect(parse('period=unknown')).toEqual(DEFAULT_SELECTION)
  })

  it('reads presets and custom ranges', () => {
    expect(parse('period=last-3-months')).toEqual({ kind: 'last-3-months' })
    expect(parse('start=2026-04-01&end=2026-09-30')).toEqual({
      kind: 'custom',
      start: '2026-04-01',
      end: '2026-09-30',
    })
  })

  it('falls back to the default for an invalid custom range', () => {
    expect(parse('start=2026-09-30&end=2026-09-01')).toEqual(DEFAULT_SELECTION)
    expect(parse('start=2026-09-01')).toEqual(DEFAULT_SELECTION)
    expect(parse('start=abc&end=def')).toEqual(DEFAULT_SELECTION)
  })

  it('serializes back to the same selection', () => {
    for (const search of ['period=previous-month', 'start=2026-04-01&end=2026-09-30']) {
      const selection = parse(search)
      expect(parse(new URLSearchParams(selectionToParams(selection)).toString())).toEqual(selection)
    }
  })
})

describe('resolveSelection and label', () => {
  it('uses custom bounds as given', () => {
    const period = resolveSelection(
      { kind: 'custom', start: '2026-04-01', end: '2026-09-30' },
      '2026-10-06',
    )
    expect(period).toEqual({ start: '2026-04-01', end: '2026-09-30' })
    expect(periodLabel(period)).toBe('01/04/2026 – 30/09/2026')
  })
})
