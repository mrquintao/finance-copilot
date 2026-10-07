import { describe, expect, it } from 'vitest'
import { formatDuration } from './dateTime'

describe('formatDuration', () => {
  it('formats elapsed time between two instants', () => {
    expect(formatDuration('2026-09-30T12:00:00Z', '2026-09-30T12:00:05Z')).toBe('5 s')
    expect(formatDuration('2026-09-30T12:00:00Z', '2026-09-30T12:00:00Z')).toBe('0 s')
    expect(formatDuration('2026-09-30T12:00:00Z', '2026-09-30T12:00:59.400Z')).toBe('59 s')
    expect(formatDuration('2026-09-30T12:00:00Z', '2026-09-30T12:02:05Z')).toBe('2 min 05 s')
    expect(formatDuration('2026-09-30T12:00:00-03:00', '2026-09-30T15:01:00Z')).toBe('1 min 00 s')
  })

  it('returns null for invalid or inverted instants', () => {
    expect(formatDuration('nope', '2026-09-30T12:00:05Z')).toBeNull()
    expect(formatDuration('2026-09-30T12:00:05Z', '2026-09-30T12:00:00Z')).toBeNull()
  })
})
