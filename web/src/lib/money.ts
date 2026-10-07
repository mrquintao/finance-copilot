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

const SIGNED_MONEY_PATTERN = /^-?\d{1,25}\.\d{2}$/
const PERCENT_PATTERN = /^-?\d{1,12}\.\d$/

/** A difference between two amounts ("-60.00"): always signed, still formatted from text. */
export function formatSignedBRL(amount: string): string {
  if (typeof amount !== 'string' || !SIGNED_MONEY_PATTERN.test(amount)) return INVALID_MONEY
  const negative = amount.startsWith('-')
  const magnitude = negative ? amount.slice(1) : amount
  if (/^0+\.00$/.test(magnitude)) return formatBRL(magnitude)
  return `${negative ? '−' : '+'}${formatBRL(magnitude)}`
}

/** A percent change computed by the backend ("7.5", "-100.0") as "+7,5%" / "−100,0%". */
export function formatPercentChange(percent: string): string {
  if (typeof percent !== 'string' || !PERCENT_PATTERN.test(percent)) return '—'
  const negative = percent.startsWith('-')
  const magnitude = (negative ? percent.slice(1) : percent).replace('.', ',')
  if (/^0+,0$/.test(magnitude)) return '0,0%'
  return `${negative ? '−' : '+'}${magnitude}%`
}
