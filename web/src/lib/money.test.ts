import { describe, expect, it } from 'vitest'
import { formatBRL, INVALID_MONEY, isMoney } from './money'

// Intl separates the symbol from the digits with a non-breaking space.
const brl = (digits: string) => `R$${String.fromCharCode(0xa0)}${digits}`

describe('formatBRL', () => {
  it('formats decimal strings as BRL', () => {
    expect(formatBRL('0.00')).toBe(brl('0,00'))
    expect(formatBRL('0.05')).toBe(brl('0,05'))
    expect(formatBRL('37.90')).toBe(brl('37,90'))
    expect(formatBRL('1234.56')).toBe(brl('1.234,56'))
    expect(formatBRL('8150.00')).toBe(brl('8.150,00'))
  })

  it('keeps every digit of amounts a float cannot represent', () => {
    // 1234567890123456.78 as a double is 1234567890123456.8; NUMERIC(18,2) max is below.
    expect(formatBRL('1234567890123456.78')).toBe(brl('1.234.567.890.123.456,78'))
    expect(formatBRL('9999999999999999.99')).toBe(brl('9.999.999.999.999.999,99'))
    expect(formatBRL('0.10')).toBe(brl('0,10'))
  })

  it('refuses anything that is not an exact two-decimal amount', () => {
    for (const value of ['', '12', '12.5', '12.345', '-1.00', '1e3', '1,00', 'NaN', ' 1.00']) {
      expect(formatBRL(value)).toBe(INVALID_MONEY)
    }
  })
})

describe('isMoney', () => {
  it('accepts only strings', () => {
    expect(isMoney('1.00')).toBe(true)
    expect(isMoney(1)).toBe(false)
    expect(isMoney(null)).toBe(false)
  })
})
