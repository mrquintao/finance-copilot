// The API sends money as an exact decimal string ("1234.56"). It is formatted as text and
// never becomes a JS number: Intl.NumberFormat treats string input as an exact decimal.
const MONEY_PATTERN = /^\d{1,25}\.\d{2}$/

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export const INVALID_MONEY = 'R$ —'

export function isMoney(value: unknown): value is string {
  return typeof value === 'string' && MONEY_PATTERN.test(value)
}

export function formatBRL(amount: string): string {
  if (!isMoney(amount)) return INVALID_MONEY
  return brl.format(amount as Intl.StringNumericLiteral)
}
