import { isMoney } from './money'

// Beyond this many integer digits a double can no longer place a bar faithfully.
const MAX_SCALE_DIGITS = 15

/**
 * The only number conversion of money in the app: it sizes a bar and nothing else. The result
 * is never displayed and never added up; every shown value is formatted from the original
 * decimal string. Returns 0 for anything that is not a plottable amount.
 */
export function barScale(amount: string | undefined): number {
  if (amount === undefined || !isMoney(amount) || amount.length > MAX_SCALE_DIGITS + 3) return 0
  return Number(amount)
}
